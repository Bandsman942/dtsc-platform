import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";

export type EnterpriseApprovalCandidate = {
  userId: string;
  name: string;
  email: string;
  positionTitle: string | null;
  role: string;
  isRequester: boolean;
  selfApprovalOverride: boolean;
};

export type EnterpriseApprovalPolicy = {
  selfApprovalModuleCodes: string[];
};

type ApprovalDecisionInput = {
  organizationId: string;
  requesterUserId: string;
  approverUserId: string;
  actorUserId: string;
  moduleCode: string;
};

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function approvalError(message: string, code: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { code, statusCode });
  return error;
}

export function readEnterpriseApprovalPolicy(settingsJson: Prisma.JsonValue | null | undefined): EnterpriseApprovalPolicy {
  const root = jsonObject(settingsJson);
  const rawPolicy = jsonObject(root.approvalPolicy as Prisma.JsonValue | null | undefined);
  const selfApprovalModuleCodes = Array.isArray(rawPolicy.selfApprovalModuleCodes)
    ? rawPolicy.selfApprovalModuleCodes
        .filter((value): value is string => typeof value === "string")
        .map((value) => normalizeEnterpriseModuleCode(value))
    : [];
  return { selfApprovalModuleCodes: Array.from(new Set(selfApprovalModuleCodes)) };
}

export async function getEnterpriseApprovalPolicy(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { settingsJson: true },
  });
  return organization ? readEnterpriseApprovalPolicy(organization.settingsJson) : { selfApprovalModuleCodes: [] };
}

export async function setEnterpriseApprovalPolicy({
  organizationId,
  selfApprovalModuleCodes,
}: {
  organizationId: string;
  selfApprovalModuleCodes: string[];
}) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
    select: { settingsJson: true },
  });
  if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
  const current = jsonObject(organization.settingsJson);
  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      settingsJson: {
        ...current,
        approvalPolicy: {
          selfApprovalModuleCodes: Array.from(new Set(selfApprovalModuleCodes.map((code) => normalizeEnterpriseModuleCode(code)))),
        },
      } as Prisma.InputJsonValue,
    },
    select: { id: true, settingsJson: true },
  });
}

export async function listEnterpriseApprovalCandidates({
  organizationId,
  requesterUserId,
  moduleCode,
}: {
  organizationId: string;
  requesterUserId: string;
  moduleCode: string;
}): Promise<{ candidates: EnterpriseApprovalCandidate[]; selfApprovalOverrideAvailable: boolean }> {
  const canonicalModuleCode = normalizeEnterpriseModuleCode(moduleCode);
  const requesterAccess = await resolveEnterpriseModuleAccess({ userId: requesterUserId, organizationId, moduleCode: canonicalModuleCode, action: "submit" });
  if (!requesterAccess.allowed) return { candidates: [], selfApprovalOverrideAvailable: false };

  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null },
    select: {
      userId: true,
      role: true,
      positionTitle: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
    take: 250,
  });

  const resolved = await Promise.all(members.map(async (member) => ({
    member,
    access: await resolveEnterpriseModuleAccess({ userId: member.userId, organizationId, moduleCode: canonicalModuleCode, action: "approve" }),
  })));
  const otherCandidates = resolved
    .filter(({ member, access }) => member.userId !== requesterUserId && access.allowed)
    .map(({ member }) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      positionTitle: member.positionTitle || null,
      role: member.role,
      isRequester: false,
      selfApprovalOverride: false,
    }));

  if (otherCandidates.length) return { candidates: otherCandidates, selfApprovalOverrideAvailable: false };

  const policy = await getEnterpriseApprovalPolicy(organizationId);
  const requester = resolved.find(({ member }) => member.userId === requesterUserId);
  const selfApprovalOverrideAvailable = Boolean(requester?.access.allowed && policy.selfApprovalModuleCodes.includes(canonicalModuleCode));
  if (!requester || !selfApprovalOverrideAvailable) return { candidates: [], selfApprovalOverrideAvailable };

  return {
    selfApprovalOverrideAvailable: true,
    candidates: [{
      userId: requester.member.userId,
      name: requester.member.user.name,
      email: requester.member.user.email,
      positionTitle: requester.member.positionTitle || null,
      role: requester.member.role,
      isRequester: true,
      selfApprovalOverride: true,
    }],
  };
}

export async function assertEnterpriseApprovalCandidate({
  organizationId,
  requesterUserId,
  approverUserId,
  moduleCode,
}: {
  organizationId: string;
  requesterUserId: string;
  approverUserId: string;
  moduleCode: string;
}) {
  const result = await listEnterpriseApprovalCandidates({ organizationId, requesterUserId, moduleCode });
  const candidate = result.candidates.find((item) => item.userId === approverUserId);
  if (!candidate) {
    throw approvalError(
      result.candidates.length
        ? "Le validateur sélectionné n’est plus autorisé pour cette action."
        : "Aucun validateur autorisé n’est disponible. Un administrateur peut habiliter un collaborateur ou autoriser l’auto-validation de secours pour ce service.",
      "APPROVER_NOT_ELIGIBLE",
      403,
    );
  }
  return candidate;
}

export async function canUseSelfApprovalOverride({ organizationId, userId, moduleCode }: { organizationId: string; userId: string; moduleCode: string }) {
  const result = await listEnterpriseApprovalCandidates({ organizationId, requesterUserId: userId, moduleCode });
  return result.candidates.length === 1 && result.candidates[0]?.userId === userId && result.candidates[0]?.selfApprovalOverride === true;
}

export async function assertEnterpriseApprovalDecision({
  organizationId,
  requesterUserId,
  approverUserId,
  actorUserId,
  moduleCode,
}: ApprovalDecisionInput) {
  if (approverUserId !== actorUserId) {
    throw approvalError("Seul le validateur désigné peut prendre cette décision.", "WRONG_APPROVER", 403);
  }
  const access = await resolveEnterpriseModuleAccess({
    userId: actorUserId,
    organizationId,
    moduleCode: normalizeEnterpriseModuleCode(moduleCode),
    action: "approve",
  });
  if (!access.allowed) {
    throw approvalError("Vous ne disposez plus de l’autorisation nécessaire pour valider cette action.", "APPROVER_PERMISSION_DENIED", 403);
  }
  if (requesterUserId !== actorUserId) return { selfApprovalOverride: false };
  const allowed = await canUseSelfApprovalOverride({ organizationId, userId: actorUserId, moduleCode });
  if (!allowed) {
    throw approvalError("Une autre personne autorisée doit valider cette opération.", "SELF_APPROVAL_FORBIDDEN", 403);
  }
  return { selfApprovalOverride: true };
}
