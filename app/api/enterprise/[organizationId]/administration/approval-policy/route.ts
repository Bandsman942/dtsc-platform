import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getEnterpriseApprovalPolicy, setEnterpriseApprovalPolicy } from "@/lib/enterprise/approval-assignment";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const MODULE_CODE = /^[A-Z0-9_]{2,120}$/;
type Params = { params: Promise<{ organizationId: string }> };

async function allowedModuleCodes(organizationId: string) {
  const modules = await prisma.enterpriseModule.findMany({
    where: { organizationId, isEnabled: true },
    select: { moduleCode: true },
  });
  return new Set(modules.map((item) => normalizeEnterpriseModuleCode(item.moduleCode)).filter((code) => Boolean(getEnterpriseModuleDefinition(code))));
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({ policy: await getEnterpriseApprovalPolicy(organizationId) });
}

export async function PUT(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-approval-policy:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => null) as { selfApprovalModuleCodes?: unknown } | null;
  if (!body || !Array.isArray(body.selfApprovalModuleCodes) || body.selfApprovalModuleCodes.length > 200 || !body.selfApprovalModuleCodes.every((value) => typeof value === "string" && MODULE_CODE.test(value))) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Politique de validation invalide." }, { status: 400 });
  }
  const tenantModules = await allowedModuleCodes(organizationId);
  const normalized = Array.from(new Set(body.selfApprovalModuleCodes.map((code) => normalizeEnterpriseModuleCode(code))));
  if (normalized.some((code) => !tenantModules.has(code))) {
    return NextResponse.json({ error: "FORBIDDEN_MODULE", message: "Un module sélectionné n’est pas actif dans cette entreprise." }, { status: 403 });
  }

  const previous = await getEnterpriseApprovalPolicy(organizationId);
  const organization = await setEnterpriseApprovalPolicy({ organizationId, selfApprovalModuleCodes: normalized });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: "ENTERPRISE_APPROVAL_POLICY_UPDATED",
    entity: "Organization",
    entityId: organization.id,
    request: req,
    reasonCode: "SELF_APPROVAL_OVERRIDE_UPDATED",
    riskLevel: "CRITICAL",
    before: previous as unknown as Prisma.InputJsonValue,
    after: { selfApprovalModuleCodes: normalized } as Prisma.InputJsonValue,
  });
  return NextResponse.json({ ok: true, policy: { selfApprovalModuleCodes: normalized } });
}
