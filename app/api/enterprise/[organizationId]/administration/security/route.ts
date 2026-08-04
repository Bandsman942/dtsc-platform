import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { enterpriseSecurityPolicySchema } from "@/lib/enterprise/governance/validators";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const DEFAULT_POLICY = { sessionIdleMinutes: 60, invitationExpiryHours: 168, maxPendingInvitations: 100, requireApprovedDomains: false, allowedEmailDomainsJson: [], defaultInvitationRole: "MEMBER", requireInvitationApproval: false, requireMfa: false, sensitiveExportApproval: true, devicePolicyJson: null, dataExportPolicyJson: null };

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const policy = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId } });
  return NextResponse.json({ policy: policy || DEFAULT_POLICY });
}

export async function PUT(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await requireEnterpriseGovernanceAccess(session.userId, organizationId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = enterpriseSecurityPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Politique invalide." }, { status: 400 });
  const previous = await prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId } });
  const { allowedEmailDomains, devicePolicy, dataExportPolicy, ...scalarPolicy } = parsed.data;
  const policyData = {
    ...scalarPolicy,
    allowedEmailDomainsJson: allowedEmailDomains as Prisma.InputJsonValue,
    devicePolicyJson: devicePolicy == null ? Prisma.JsonNull : devicePolicy as Prisma.InputJsonValue,
    dataExportPolicyJson: dataExportPolicy == null ? Prisma.JsonNull : dataExportPolicy as Prisma.InputJsonValue,
    updatedByUserId: session.userId,
  };
  const policy = await prisma.enterpriseOrganizationSecurityPolicy.upsert({
    where: { organizationId },
    create: { organizationId, ...policyData },
    update: policyData,
  });
  await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_SECURITY_POLICY_UPDATED", entity: "EnterpriseOrganizationSecurityPolicy", entityId: policy.id, request: req, reasonCode: "SECURITY_POLICY_UPDATED", riskLevel: "CRITICAL", before: previous as unknown as Prisma.InputJsonValue, after: policy as unknown as Prisma.InputJsonValue });
  return NextResponse.json({ ok: true, policy });
}
