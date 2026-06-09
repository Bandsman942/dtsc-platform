import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyStock, type PharmacyStockAction } from "@/lib/pharmacy-stock-access";
import { generateInventoryLines, getPharmacyStockDataset } from "@/lib/pharmacy-stock";
import { inventoryCountSchema, inventorySessionSchema, stockActionSchema, stockAdjustmentSchema, stockLocationSchema } from "@/lib/pharmacy-stock-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

async function activeMember(organizationId: string, userId: string) {
  return prisma.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { id: true } });
}

async function batchInOrganization(organizationId: string, batchId: string) {
  return prisma.pharmacyBatch.findFirst({ where: { id: batchId, organizationId }, select: { id: true, productId: true, availableQuantity: true } });
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyStock(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getPharmacyStockDataset(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-stock:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions stock sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload", message: "Requête stock invalide." }, { status: 400 });
  const kind = typeof body?.kind === "string" ? body.kind : "";
  if (kind === "session") return createSession(req, organizationId, session.userId, body, startedAt);
  if (kind === "adjustment") return createAdjustment(req, organizationId, session.userId, body, startedAt);
  if (kind === "location") return createLocation(req, organizationId, session.userId, body, startedAt);
  if (kind === "action") return applyAction(req, organizationId, session.userId, body, startedAt);
  return NextResponse.json({ error: "Invalid payload", message: "Action stock inconnue." }, { status: 400 });
}

async function createSession(req: Request, organizationId: string, userId: string, body: Record<string, unknown>, startedAt: number) {
  if (!(await canAccessPharmacyStock(userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inventorySessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Session invalide." }, { status: 400 });
  if (!(await activeMember(organizationId, parsed.data.responsibleUserId))) return NextResponse.json({ error: "Invalid responsible", message: "Le responsable n'appartient pas à cette pharmacie." }, { status: 400 });
  if (parsed.data.departmentId) {
    const department = await prisma.enterpriseDepartment.findFirst({ where: { id: parsed.data.departmentId, organizationId, isActive: true }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "Invalid department", message: "Le département n'appartient pas à cette pharmacie." }, { status: 400 });
  }
  if (parsed.data.locationId) {
    const location = await prisma.pharmacyStockLocation.findFirst({ where: { id: parsed.data.locationId, organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!location) return NextResponse.json({ error: "Invalid location", message: "L'emplacement n'appartient pas à cette pharmacie." }, { status: 400 });
  }
  for (const participantId of parsed.data.participants) if (!(await activeMember(organizationId, participantId))) return NextResponse.json({ error: "Invalid participant", message: "Un participant n'appartient pas à cette pharmacie." }, { status: 400 });
  const saved = await prisma.pharmacyInventorySession.create({ data: { organizationId, title: parsed.data.title, inventoryDate: parsed.data.inventoryDate, inventoryType: parsed.data.inventoryType, departmentId: parsed.data.departmentId || null, locationId: parsed.data.locationId || null, responsibleUserId: parsed.data.responsibleUserId, participantsJson: parsed.data.participants, scopeType: parsed.data.scopeType, scopeJson: { value: parsed.data.scopeValue || null }, notes: parsed.data.notes || null, createdById: userId, updatedById: userId } });
  await writeAuditLog({ userId, action: "PHARMACY_INVENTORY_SESSION_CREATED", entity: "PharmacyInventorySession", entityId: saved.id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 201, userId, startedAt });
  return NextResponse.json({ ok: true, session: saved }, { status: 201 });
}

async function createAdjustment(req: Request, organizationId: string, userId: string, body: Record<string, unknown>, startedAt: number) {
  if (!(await canAccessPharmacyStock(userId, organizationId, "adjust"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = stockAdjustmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ajustement invalide." }, { status: 400 });
  const batch = await batchInOrganization(organizationId, parsed.data.batchId);
  if (!batch || batch.productId !== parsed.data.productId) return NextResponse.json({ error: "Invalid batch", message: "Le lot n'appartient pas au produit ou à cette pharmacie." }, { status: 400 });
  if (parsed.data.inventorySessionId) {
    const inventorySession = await prisma.pharmacyInventorySession.findFirst({ where: { id: parsed.data.inventorySessionId, organizationId }, select: { id: true } });
    if (!inventorySession) return NextResponse.json({ error: "Invalid session", message: "La session d'inventaire n'appartient pas à cette pharmacie." }, { status: 400 });
  }
  if (parsed.data.inventoryLineId) {
    const inventoryLine = await prisma.pharmacyInventoryLine.findFirst({ where: { id: parsed.data.inventoryLineId, organizationId, productId: parsed.data.productId, batchId: parsed.data.batchId }, select: { id: true } });
    if (!inventoryLine) return NextResponse.json({ error: "Invalid line", message: "La ligne d'inventaire ne correspond pas au produit et au lot." }, { status: 400 });
  }
  const saved = await prisma.pharmacyStockAdjustment.create({ data: { organizationId, productId: parsed.data.productId, batchId: parsed.data.batchId, inventorySessionId: parsed.data.inventorySessionId || null, inventoryLineId: parsed.data.inventoryLineId || null, adjustmentType: parsed.data.adjustmentType, direction: parsed.data.direction, quantity: parsed.data.quantity, reason: parsed.data.reason, notes: parsed.data.notes || null, status: "SUBMITTED", requestedById: userId } });
  await writeAuditLog({ userId, action: "PHARMACY_STOCK_ADJUSTMENT_CREATED", entity: "PharmacyStockAdjustment", entityId: saved.id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 201, userId, startedAt });
  return NextResponse.json({ ok: true, adjustment: saved }, { status: 201 });
}

async function createLocation(req: Request, organizationId: string, userId: string, body: Record<string, unknown>, startedAt: number) {
  if (!(await canAccessPharmacyStock(userId, organizationId, "manage_locations"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = stockLocationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Emplacement invalide." }, { status: 400 });
  if (parsed.data.responsibleUserId && !(await activeMember(organizationId, parsed.data.responsibleUserId))) return NextResponse.json({ error: "Invalid responsible", message: "Le responsable n'appartient pas à cette pharmacie." }, { status: 400 });
  try {
    const saved = await prisma.pharmacyStockLocation.create({ data: { organizationId, ...parsed.data, parentLocationId: parsed.data.parentLocationId || null, responsibleUserId: parsed.data.responsibleUserId || null, description: parsed.data.description || null, createdById: userId, updatedById: userId } });
    await writeAuditLog({ userId, action: "PHARMACY_STOCK_LOCATION_CREATED", entity: "PharmacyStockLocation", entityId: saved.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId, startedAt });
    return NextResponse.json({ ok: true, location: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Duplicate location", message: "Ce code d'emplacement existe déjà." }, { status: 409 });
    throw error;
  }
}

async function applyAction(req: Request, organizationId: string, userId: string, body: Record<string, unknown>, startedAt: number) {
  const parsed = stockActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Action stock invalide." }, { status: 400 });
  const data = parsed.data;
  if (data.entity === "session" && data.action === "generate-lines") {
    if (!(await canAccessPharmacyStock(userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await generateInventoryLines(organizationId, data.id);
  } else if (data.entity === "session" && ["submit", "validate", "reject"].includes(data.action)) {
    const permission: PharmacyStockAction = data.action === "submit" ? "submit" : "validate";
    if (!(await canAccessPharmacyStock(userId, organizationId, permission))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const existing = await prisma.pharmacyInventorySession.findFirst({ where: { id: data.id, organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.pharmacyInventorySession.update({ where: { id: data.id }, data: data.action === "submit" ? { status: "SUBMITTED", submittedAt: new Date(), updatedById: userId } : data.action === "validate" ? { status: "VALIDATED", validatedAt: new Date(), validatedById: userId, updatedById: userId } : { status: "REJECTED", rejectionReason: data.reason || "Rejeté", updatedById: userId } });
  } else if (data.entity === "line" && data.action === "count") {
    if (!(await canAccessPharmacyStock(userId, organizationId, "count"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const count = inventoryCountSchema.safeParse({ lineId: data.id, countedQuantity: data.countedQuantity, varianceReason: data.reason });
    if (!count.success) return NextResponse.json({ error: "Invalid count", message: "Quantité comptée invalide." }, { status: 400 });
    const line = await prisma.pharmacyInventoryLine.findFirst({ where: { id: data.id, organizationId }, select: { id: true, systemQuantity: true } });
    if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const variance = count.data.countedQuantity - Number(line.systemQuantity);
    await prisma.pharmacyInventoryLine.update({ where: { id: line.id }, data: { countedQuantity: count.data.countedQuantity, variance, varianceType: variance === 0 ? "NONE" : variance > 0 ? "SURPLUS" : "MISSING", varianceReason: count.data.varianceReason || null, countedById: userId, countedAt: new Date(), status: variance === 0 ? "COUNTED" : "VARIANCE_DETECTED" } });
  } else if (data.entity === "adjustment" && ["approve", "cancel"].includes(data.action)) {
    if (!(await canAccessPharmacyStock(userId, organizationId, "validate"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await applyAdjustment(organizationId, data.id, userId, data.action === "cancel");
  } else if (data.entity === "location" && data.action === "archive") {
    if (!(await canAccessPharmacyStock(userId, organizationId, "manage_locations"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const location = await prisma.pharmacyStockLocation.findFirst({ where: { id: data.id, organizationId }, select: { id: true } });
    if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.pharmacyStockLocation.update({ where: { id: data.id }, data: { status: "ARCHIVED", updatedById: userId } });
  } else return NextResponse.json({ error: "Invalid action", message: "Cette action n'est pas autorisée." }, { status: 400 });
  await writeAuditLog({ userId, action: `PHARMACY_STOCK_${data.entity.toUpperCase()}_${data.action.toUpperCase().replaceAll("-", "_")}`, entity: data.entity, entityId: data.id, request: req, metadata: { organizationId, reason: data.reason || null } });
  await writeApiLog({ request: req, statusCode: 200, userId, startedAt });
  return NextResponse.json({ ok: true });
}

async function applyAdjustment(organizationId: string, adjustmentId: string, userId: string, reverse: boolean) {
  const adjustment = await prisma.pharmacyStockAdjustment.findFirst({ where: { id: adjustmentId, organizationId }, include: { batch: true } });
  if (!adjustment?.batch) throw new Error("ADJUSTMENT_NOT_FOUND");
  if (!reverse && adjustment.status === "APPROVED") return;
  if (reverse && adjustment.status !== "APPROVED") throw new Error("ADJUSTMENT_NOT_APPROVED");
  const before = Number(adjustment.batch.availableQuantity);
  const signedQuantity = Number(adjustment.quantity) * (adjustment.direction === "IN" ? 1 : -1) * (reverse ? -1 : 1);
  const after = before + signedQuantity;
  if (after < 0) throw new Error("NEGATIVE_STOCK");
  await prisma.$transaction([
    prisma.pharmacyBatch.update({ where: { id: adjustment.batch.id }, data: { availableQuantity: after, status: after === 0 ? "DEPLETED" : adjustment.batch.status, updatedById: userId } }),
    prisma.pharmacyStockMovement.create({ data: { organizationId, productId: adjustment.productId, batchId: adjustment.batch.id, movementType: reverse ? "MANUAL_CORRECTION" : "INVENTORY_CORRECTION", direction: signedQuantity >= 0 ? "IN" : "OUT", quantity: Math.abs(signedQuantity), quantityBefore: before, quantityAfter: after, reason: reverse ? `Annulation: ${adjustment.reason}` : adjustment.reason, relatedEntityType: "PharmacyStockAdjustment", relatedEntityId: adjustment.id, createdById: userId } }),
    prisma.pharmacyStockAdjustment.update({ where: { id: adjustment.id }, data: reverse ? { status: "CANCELLED", reversedAt: new Date() } : { status: "APPROVED", approvedAt: new Date(), approvedById: userId } }),
  ]);
}
