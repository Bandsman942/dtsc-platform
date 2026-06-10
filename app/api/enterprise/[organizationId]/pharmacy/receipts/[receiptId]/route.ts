import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReceipts, type PharmacyReceiptAction } from "@/lib/pharmacy-receipt-access";
import { pharmacyReceiptUpdateSchema, receiptActionSchema } from "@/lib/pharmacy-receipt-validators";
import { applyReceiptStockImpact, duplicateReceiptMessage, reverseReceiptStockImpact, updatePharmacyReceipt, validateReceiptReferences } from "@/lib/pharmacy-receipts";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; receiptId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, receiptId } = await params;
  if (!(await canAccessPharmacyReceipts(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const receipt = await prisma.pharmacyReceipt.findFirst({ where: { id: receiptId, organizationId }, include: { lines: true, receiptBatches: true, discrepancies: true, documents: true } });
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const movements = await prisma.pharmacyStockMovement.findMany({ where: { organizationId, relatedEntityType: "PharmacyReceipt", relatedEntityId: receiptId }, orderBy: { createdAt: "desc" } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ receipt, movements });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-receipts:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions de réception sur une courte période." }, { status: 429 });
  const { organizationId, receiptId } = await params;
  const body = await req.json().catch(() => null);
  const actionName = body && typeof body === "object" && "action" in body ? String(body.action) : "";
  if (!actionName) {
    if (!(await canAccessPharmacyReceipts(session.userId, organizationId, "update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = pharmacyReceiptUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Réception invalide." }, { status: 400 });
    const referenceError = await validateReceiptReferences(organizationId, parsed.data);
    if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
    try {
      const receipt = await updatePharmacyReceipt(organizationId, receiptId, session.userId, parsed.data);
      await writeAuditLog({ userId: session.userId, action: "PHARMACY_RECEIPT_UPDATED", entity: "PharmacyReceipt", entityId: receiptId, request: req, metadata: { organizationId } });
      return NextResponse.json({ ok: true, receipt });
    } catch (error) {
      const message = duplicateReceiptMessage(error);
      if (message) return NextResponse.json({ error: "Duplicate receipt", message }, { status: 409 });
      if (error instanceof Error && error.message === "RECEIPT_LOCKED") return NextResponse.json({ error: "Locked", message: "Seule une réception en brouillon peut être modifiée." }, { status: 409 });
      throw error;
    }
  }
  const parsed = receiptActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action de réception invalide." }, { status: 400 });
  const data = parsed.data;
  const permission: PharmacyReceiptAction = data.action === "submit" ? "submit" : data.action === "validate" ? "validate" : data.action === "reject" ? "reject" : data.action === "cancel" ? "cancel" : "manage_discrepancies";
  if (!(await canAccessPharmacyReceipts(session.userId, organizationId, permission))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.pharmacyReceipt.findFirst({ where: { id: receiptId, organizationId }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.action === "submit") {
    if (existing.status !== "DRAFT") return NextResponse.json({ error: "Invalid status", message: "Seul un brouillon peut être soumis." }, { status: 409 });
    await prisma.pharmacyReceipt.update({ where: { id: receiptId }, data: { status: "SUBMITTED", submittedById: session.userId, submittedAt: new Date(), updatedById: session.userId } });
  } else if (data.action === "validate") {
    await applyReceiptStockImpact(organizationId, receiptId, session.userId);
  } else if (data.action === "cancel") {
    if (!data.reason) return NextResponse.json({ error: "Reason required", message: "Le motif d'annulation est obligatoire." }, { status: 400 });
    await reverseReceiptStockImpact(organizationId, receiptId, session.userId, data.reason);
  } else if (data.action === "reject") {
    if (!data.reason) return NextResponse.json({ error: "Reason required", message: "Le motif de rejet est obligatoire." }, { status: 400 });
    await prisma.pharmacyReceipt.update({ where: { id: receiptId }, data: { status: "REJECTED", rejectedById: session.userId, rejectedAt: new Date(), rejectionReason: data.reason, updatedById: session.userId } });
  } else if (data.action === "archive") {
    await prisma.pharmacyReceipt.update({ where: { id: receiptId }, data: { status: "ARCHIVED", updatedById: session.userId } });
  } else if (data.action === "add-discrepancy") {
    if (!data.discrepancyType || !data.description) return NextResponse.json({ error: "Invalid discrepancy", message: "Le type et la description de l'écart sont obligatoires." }, { status: 400 });
    await prisma.pharmacyReceiptDiscrepancy.create({ data: { organizationId, receiptId, discrepancyType: data.discrepancyType, description: data.description, criticality: data.criticality || "MEDIUM", responsibleUserId: data.responsibleUserId || null, proposedAction: data.proposedAction || null, createdById: session.userId, updatedById: session.userId } });
  } else if (data.action === "resolve-discrepancy") {
    const discrepancy = await prisma.pharmacyReceiptDiscrepancy.findFirst({ where: { id: data.discrepancyId, receiptId, organizationId }, select: { id: true } });
    if (!discrepancy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.pharmacyReceiptDiscrepancy.update({ where: { id: discrepancy.id }, data: { status: "RESOLVED", notes: data.reason || null, updatedById: session.userId } });
  }
  await writeAuditLog({ userId: session.userId, action: `PHARMACY_RECEIPT_${data.action.toUpperCase().replaceAll("-", "_")}`, entity: "PharmacyReceipt", entityId: receiptId, request: req, metadata: { organizationId, reason: data.reason || null } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
