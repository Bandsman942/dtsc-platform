import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { convertPharmacyMoneyToBase } from "@/lib/pharmacy-currencies";
import { canAccessPharmacyPurchases, type PharmacyPurchaseAction } from "@/lib/pharmacy-purchase-access";
import { purchaseActionSchema, purchaseOrderInputSchema } from "@/lib/pharmacy-purchase-validators";
import { createReceiptFromPurchaseOrder, updatePurchaseOrderDraft, validatePurchaseReferences } from "@/lib/pharmacy-purchases";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; entity: string; id: string }> };
function permission(action: string): PharmacyPurchaseAction {
  if (action === "validate") return "validate";
  if (action === "reject") return "reject";
  if (action === "cancel") return "cancel";
  if (action === "suspend") return "suspend";
  if (action === "create-receipt") return "create_receipt";
  if (action === "submit") return "submit";
  return "update";
}

export async function PATCH(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-purchases:${session.userId}`), 120, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions achats." }, { status: 429 });
  const { organizationId, entity, id } = await params;
  const body = await request.json().catch(() => null);
  const actionName = body && typeof body === "object" && "action" in body ? String(body.action) : "";
  if (!actionName) {
    if (entity !== "order") return NextResponse.json({ error: "Invalid entity", message: "Seules les commandes peuvent être modifiées par ce formulaire." }, { status: 400 });
    if (!(await canAccessPharmacyPurchases(session.userId, organizationId, "update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsedOrder = purchaseOrderInputSchema.safeParse(body);
    if (!parsedOrder.success) return NextResponse.json({ error: "Invalid payload", message: parsedOrder.error.issues[0]?.message || "Commande fournisseur invalide." }, { status: 400 });
    const referenceError = await validatePurchaseReferences(organizationId, parsedOrder.data);
    if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
    try {
      const order = await updatePurchaseOrderDraft(organizationId, id, session.userId, parsedOrder.data);
      await writeAuditLog({ userId: session.userId, action: "PHARMACY_PURCHASE_ORDER_UPDATED", entity: "order", entityId: id, request, metadata: { organizationId } });
      await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
      return NextResponse.json({ ok: true, record: order });
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      const messages: Record<string, string> = { ORDER_NOT_FOUND: "Commande introuvable.", ORDER_LOCKED: "Une commande validée, commandée ou déjà réceptionnée ne peut plus être modifiée." };
      return NextResponse.json({ error: code, message: messages[code] || "Modification de commande impossible." }, { status: code === "ORDER_NOT_FOUND" ? 404 : 409 });
    }
  }
  const parsed = purchaseActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action", message: "Action achats invalide." }, { status: 400 });
  const data = parsed.data;
  if (!(await canAccessPharmacyPurchases(session.userId, organizationId, permission(data.action)))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reason = data.reason?.trim() || undefined;
  if (["reject", "cancel", "suspend"].includes(data.action) && !reason) return NextResponse.json({ error: "Reason required", message: "Le motif est obligatoire." }, { status: 400 });
  try {
    let receiptId: string | undefined;
    if (entity === "supplier") {
      const supplier = await prisma.pharmacySupplier.findFirst({ where: { id, organizationId } });
      if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const status = data.action === "suspend" ? "SUSPENDED" : data.action === "reactivate" ? "ACTIVE" : data.action === "archive" ? "ARCHIVED" : supplier.status;
      await prisma.pharmacySupplier.update({ where: { id }, data: { status, suspensionReason: data.action === "suspend" ? reason : null, updatedById: session.userId } });
    } else if (entity === "request") {
      const item = await prisma.pharmacyReplenishmentRequest.findFirst({ where: { id, organizationId } });
      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (data.action === "create-order") {
        const suggestedSupplierId = item.suggestedSupplierId;
        if (item.status !== "VALIDATED" || !suggestedSupplierId) throw new Error("REQUEST_NOT_CONVERTIBLE");
        const count = await prisma.pharmacyPurchaseOrder.count({ where: { organizationId } });
        const estimatedTotal = Number(item.estimatedPrice || 0) * Number(item.requestedQuantity);
        const conversion = await convertPharmacyMoneyToBase(organizationId, estimatedTotal, "USD");
        await prisma.$transaction(async (transaction) => {
          const order = await transaction.pharmacyPurchaseOrder.create({ data: { organizationId, orderNumber: `CMD-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, supplierId: suggestedSupplierId, requestId: item.id, requestedById: item.requestedById, departmentId: item.departmentId, priority: item.priority, orderDate: new Date(), estimatedTotal, currency: conversion.currency, baseCurrency: conversion.baseCurrency, exchangeRateToBase: conversion.exchangeRateToBase, estimatedTotalBase: conversion.baseAmount, createdById: session.userId, updatedById: session.userId } });
          await transaction.pharmacyPurchaseOrderLine.create({ data: { organizationId, purchaseOrderId: order.id, productId: item.productId, orderedQuantity: item.requestedQuantity, remainingQuantity: item.requestedQuantity, unit: item.unit, estimatedUnitPrice: item.estimatedPrice, totalLine: estimatedTotal } });
          await transaction.pharmacyReplenishmentRequest.update({ where: { id }, data: { status: "CONVERTED_TO_ORDER", purchaseOrderId: order.id } });
        });
      } else {
        const status = data.action === "submit" ? "SUBMITTED" : data.action === "validate" ? "VALIDATED" : data.action === "reject" ? "REJECTED" : data.action === "cancel" ? "CANCELLED" : item.status;
        await prisma.pharmacyReplenishmentRequest.update({ where: { id }, data: { status, validatedById: data.action === "validate" ? session.userId : item.validatedById, validatedAt: data.action === "validate" ? new Date() : item.validatedAt, rejectionReason: data.action === "reject" ? reason : item.rejectionReason } });
      }
    } else if (entity === "order") {
      const order = await prisma.pharmacyPurchaseOrder.findFirst({ where: { id, organizationId } });
      if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (data.action === "create-receipt") {
        const receipt = await createReceiptFromPurchaseOrder(organizationId, id, session.userId);
        receiptId = receipt.id;
      } else {
        const status = data.action === "submit" ? "SUBMITTED" : data.action === "validate" ? "VALIDATED" : data.action === "reject" ? "REJECTED" : data.action === "cancel" ? "CANCELLED" : data.action === "mark-ordered" ? "ORDERED" : data.action === "archive" ? "ARCHIVED" : order.status;
        await prisma.pharmacyPurchaseOrder.update({ where: { id }, data: { status, submittedById: data.action === "submit" ? session.userId : order.submittedById, submittedAt: data.action === "submit" ? new Date() : order.submittedAt, validatedById: data.action === "validate" ? session.userId : order.validatedById, validatedAt: data.action === "validate" ? new Date() : order.validatedAt, rejectionReason: data.action === "reject" ? reason : order.rejectionReason, cancelledById: data.action === "cancel" ? session.userId : order.cancelledById, cancelledAt: data.action === "cancel" ? new Date() : order.cancelledAt, cancellationReason: data.action === "cancel" ? reason : order.cancellationReason, updatedById: session.userId } });
      }
    } else if (entity === "alert" && data.action === "resolve-alert") {
      const alert = await prisma.pharmacyPurchaseAlert.findFirst({ where: { id, organizationId } });
      if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.pharmacyPurchaseAlert.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    } else return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_PURCHASE_${data.action.toUpperCase().replaceAll("-", "_")}`, entity, entityId: id, request, metadata: { organizationId, reason: reason || null, receiptId: receiptId || null } });
    await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, receiptId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const messages: Record<string, string> = { REQUEST_NOT_CONVERTIBLE: "La demande doit être validée et avoir un fournisseur suggéré.", ORDER_NOT_RECEIVABLE: "Seule une commande validée, commandée ou partiellement reçue peut générer une réception.", ORDER_FULLY_RECEIVED: "Cette commande est déjà entièrement reçue." };
    return NextResponse.json({ error: code, message: messages[code] || "Action achats impossible." }, { status: 400 });
  }
}
