import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { assertEnterpriseApprovalCandidate, listEnterpriseApprovalCandidates } from "@/lib/enterprise/approval-assignment";
import { createAssignedEnterpriseApproval } from "@/lib/enterprise/core-v2/approval-assignment-service";
import { createEnterpriseRequest } from "@/lib/enterprise/core-v2/service";
import { requireEnterpriseGovernanceAccess } from "@/lib/enterprise/governance/access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

async function context(organizationId: string, userId: string) {
  const [access, policy] = await Promise.all([
    requireEnterpriseGovernanceAccess(userId, organizationId),
    prisma.enterpriseOrganizationSecurityPolicy.findUnique({ where: { organizationId }, select: { sensitiveExportApproval: true } }),
  ]);
  return { access, required: Boolean(policy?.sensitiveExportApproval) };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const scope = await context(organizationId, session.userId);
  if (!scope.access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const candidates = scope.required ? await listEnterpriseApprovalCandidates({ organizationId, requesterUserId: session.userId, moduleCode: "INTERNAL_REQUESTS" }) : { candidates: [], selfApprovalOverrideAvailable: false };
  const approvals = scope.required ? await prisma.enterpriseApproval.findMany({
    where: { organizationId, requestedByUserId: session.userId, targetEntityType: "EnterpriseRequest", archivedAt: null, requestedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
    orderBy: { requestedAt: "desc" }, take: 20,
    select: { id: true, targetEntityId: true, status: true, requestedAt: true },
  }) : [];
  const linkedRequests = approvals.length ? await prisma.enterpriseRequest.findMany({
    where: { organizationId, id: { in: approvals.map((item) => item.targetEntityId) }, requestType: "AUDIT_EXPORT", requestedByUserId: session.userId, archivedAt: null },
    select: { id: true },
  }) : [];
  const validRequestIds = new Set(linkedRequests.map((item) => item.id));
  return NextResponse.json({ required: scope.required, candidates: candidates.candidates,
    approvals: approvals.filter((item) => validRequestIds.has(item.targetEntityId)).map((item) => ({ id: item.id, status: item.status, requestedAt: item.requestedAt.toISOString() })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: Params) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const scope = await context(organizationId, session.userId);
  if (!scope.access) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!scope.required) return NextResponse.json({ error: "APPROVAL_NOT_REQUIRED" }, { status: 409 });
  const limit = await rateLimit(getRateLimitKey(req, `enterprise-audit-approval:${session.userId}`), 6, 60 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de demandes de validation récentes." }, { status: 429 });
  const body = await req.json().catch(() => null) as { approverUserId?: unknown } | null;
  const approverUserId = typeof body?.approverUserId === "string" ? body.approverUserId.trim() : "";
  if (!approverUserId || approverUserId.length > 120) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Sélectionnez un validateur habilité." }, { status: 400 });
  try {
    await assertEnterpriseApprovalCandidate({ organizationId, requesterUserId: session.userId, approverUserId, moduleCode: "INTERNAL_REQUESTS" });
  } catch {
    return NextResponse.json({ error: "APPROVER_NOT_ELIGIBLE", message: "Le validateur choisi n’est plus habilité. Actualisez la liste puis réessayez." }, { status: 403 });
  }
  const request = await createEnterpriseRequest(organizationId, session.userId, {
    requestType: "AUDIT_EXPORT", title: "Demande d’export sécurisé du journal d’audit",
    description: "Autorisation d’exporter le journal d’audit de l’entreprise, limitée au demandeur et à une fenêtre de 48 heures après la demande.",
    priority: "HIGH", initialStatus: "SUBMITTED",
  });
  try {
    const approval = await createAssignedEnterpriseApproval({ organizationId, actorUserId: session.userId, targetEntityType: "EnterpriseRequest", targetEntityId: request.id, approverUserId });
    await writeAuditLog({ userId: session.userId, organizationId, action: "ENTERPRISE_AUDIT_EXPORT_APPROVAL_REQUESTED", entity: "EnterpriseApproval", entityId: approval.id, request: req, reasonCode: "AUDIT_EXPORT_APPROVAL_REQUEST", riskLevel: "HIGH", metadata: { targetRequestId: request.id, approverUserId } });
    return NextResponse.json({ ok: true, approvalId: approval.id, status: approval.status, validationUrl: `/enterprise-modules/VALIDATIONS?approval=${encodeURIComponent(approval.id)}` }, { status: 201 });
  } catch {
    await prisma.enterpriseRequest.updateMany({ where: { id: request.id, organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
    return NextResponse.json({ error: "AUDIT_EXPORT_APPROVAL_FAILED", message: "La demande de validation n’a pas pu être enregistrée. Vérifiez le statut du validateur puis réessayez." }, { status: 409 });
  }
}
