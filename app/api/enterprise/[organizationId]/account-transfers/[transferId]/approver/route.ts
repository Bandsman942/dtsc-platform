import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertEnterpriseApprovalCandidate } from "@/lib/enterprise/approval-assignment";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

const payloadSchema = z.object({ approverUserId: z.string().cuid() });
type Params = { params: Promise<{ organizationId: string; transferId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, transferId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "create", { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Sélectionnez un validateur proposé par DTSC." }, { status: 400 });

  const transfer = await prisma.enterpriseAccountTransfer.findFirst({
    where: { id: transferId, organizationId },
    select: { id: true, number: true, status: true, initiatedByUserId: true },
  });
  if (!transfer) return NextResponse.json({ error: "TRANSFER_NOT_FOUND", message: "Ce transfert n’existe pas dans cette entreprise." }, { status: 404 });
  if (transfer.status !== "DRAFT") return NextResponse.json({ error: "TRANSFER_NOT_DRAFT", message: "Le validateur ne peut être modifié que tant que le transfert est en brouillon." }, { status: 409 });

  if (transfer.initiatedByUserId !== auth.session.userId) {
    const manage = await resolveEnterpriseModuleAccess({ userId: auth.session.userId, organizationId, moduleCode: "FINANCE_TREASURY", action: "manage" });
    if (!manage.allowed) return NextResponse.json({ error: "FORBIDDEN", message: "Seul le créateur du brouillon ou un administrateur autorisé peut affecter le validateur." }, { status: 403 });
  }

  try {
    await assertEnterpriseApprovalCandidate({
      organizationId,
      requesterUserId: transfer.initiatedByUserId,
      approverUserId: parsed.data.approverUserId,
      moduleCode: "FINANCE_TREASURY",
    });
  } catch {
    return NextResponse.json({ error: "APPROVER_NOT_ELIGIBLE", message: "Le validateur sélectionné n’est plus autorisé. Rechargez la liste proposée par DTSC." }, { status: 403 });
  }

  const existing = await prisma.enterpriseApproval.findFirst({
    where: { organizationId, targetEntityType: "EnterpriseAccountTransfer", targetEntityId: transfer.id, status: "PENDING", archivedAt: null },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "APPROVAL_ALREADY_ASSIGNED", message: "Un validateur est déjà affecté à ce transfert." }, { status: 409 });

  const approval = await prisma.enterpriseApproval.create({
    data: {
      organizationId,
      targetEntityType: "EnterpriseAccountTransfer",
      targetEntityId: transfer.id,
      requestedByUserId: transfer.initiatedByUserId,
      approverUserId: parsed.data.approverUserId,
      status: "PENDING",
    },
  });
  await writeAuditLog({
    userId: auth.session.userId,
    organizationId,
    action: "ENTERPRISE_ACCOUNT_TRANSFER_APPROVER_ASSIGNED",
    entity: "EnterpriseAccountTransfer",
    entityId: transfer.id,
    request: req,
    reasonCode: "TRANSFER_APPROVER_ASSIGNED",
    riskLevel: "HIGH",
    metadata: { organizationId, approvalId: approval.id, approverUserId: parsed.data.approverUserId, requestedByUserId: transfer.initiatedByUserId },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-transfers", action: "assign-approver" } });
  return NextResponse.json({ ok: true, approval }, { status: 201 });
}
