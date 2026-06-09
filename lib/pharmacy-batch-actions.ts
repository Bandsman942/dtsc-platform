import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyBatches, type PharmacyBatchAction } from "@/lib/pharmacy-batch-access";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";
import { pharmacyBatchActionSchema } from "@/lib/validators";

const ACTIONS: Record<string, { permission: PharmacyBatchAction; status: string; movementType: string; quarantine?: boolean; recall?: boolean }> = {
  quarantine: { permission: "quarantine", status: "QUARANTINED", movementType: "QUARANTINE", quarantine: true },
  "release-quarantine": { permission: "release_quarantine", status: "ACTIVE", movementType: "ADJUSTMENT", quarantine: false },
  recall: { permission: "recall", status: "RECALLED", movementType: "RECALL", recall: true },
  block: { permission: "block", status: "BLOCKED", movementType: "ADJUSTMENT" },
  cancel: { permission: "archive", status: "CANCELLED", movementType: "CANCELLATION" },
};

export async function performPharmacyBatchAction(req: Request, organizationId: string, batchId: string, actionName: string) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const action = ACTIONS[actionName];
  if (!action || !(await canAccessPharmacyBatches(session.userId, organizationId, action.permission))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyBatchActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Un motif d'au moins trois caractères est obligatoire." }, { status: 400 });
  if (parsed.data.decisionResponsibleId) {
    const member = await prisma.organizationMember.findFirst({ where: { organizationId, userId: parsed.data.decisionResponsibleId, status: "ACTIVE", removedAt: null }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "Invalid responsible", message: "Le responsable sélectionné n'appartient pas à cette pharmacie." }, { status: 400 });
  }
  const existing = await prisma.pharmacyBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const batch = await prisma.$transaction(async (tx) => {
    const updated = await tx.pharmacyBatch.update({ where: { id: batchId }, data: {
      status: action.status,
      quarantine: action.quarantine ?? existing.quarantine,
      recall: action.recall ?? existing.recall,
      quarantineReason: actionName === "quarantine" ? parsed.data.reason : actionName === "release-quarantine" ? null : existing.quarantineReason,
      recallReason: actionName === "recall" ? parsed.data.reason : existing.recallReason,
      recallDate: actionName === "recall" ? new Date() : existing.recallDate,
      statusReason: parsed.data.reason,
      decisionResponsibleId: parsed.data.decisionResponsibleId || session.userId,
      updatedById: session.userId,
    } });
    await tx.pharmacyStockMovement.create({ data: { organizationId, productId: existing.productId, batchId, movementType: action.movementType, quantity: 0, quantityBefore: existing.availableQuantity, quantityAfter: existing.availableQuantity, reason: parsed.data.reason, createdById: session.userId } });
    return updated;
  });
  await writeAuditLog({ userId: session.userId, action: `PHARMACY_BATCH_${actionName.toUpperCase().replaceAll("-", "_")}`, entity: "PharmacyBatch", entityId: batchId, request: req, metadata: { organizationId, reason: parsed.data.reason } });
  return NextResponse.json({ ok: true, batch });
}
