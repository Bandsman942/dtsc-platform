import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeSectorConvergenceRequest } from "@/lib/enterprise/sector-convergence/access";
import { asSectorConvergenceError } from "@/lib/enterprise/sector-convergence/errors";
import { convergePharmacyProduct } from "@/lib/enterprise/sector-convergence/pharmacy-catalog-service";
import { convergePharmacyCashSession, convergePharmacyPayment, convergePharmacySaleInvoice } from "@/lib/enterprise/sector-convergence/pharmacy-finance-service";
import { projectPharmacyInventoryAccountingEvent } from "@/lib/enterprise/sector-convergence/pharmacy-inventory-accounting";
import { convergePharmacySupplier } from "@/lib/enterprise/sector-convergence/pharmacy-party-service";
import { convergePharmacyPurchaseOrder, convergePharmacyReceipt } from "@/lib/enterprise/sector-convergence/pharmacy-procurement-service";
import { pharmacyInventoryEventSchema } from "@/lib/enterprise/sector-convergence/schemas";
import { prisma } from "@/lib/prisma";

const pharmacyActionSchema = z.union([
  z.object({ action: z.literal("MAP_SUPPLIER"), pharmacySupplierId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_PRODUCT"), pharmacyProductId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_PURCHASE"), pharmacyPurchaseOrderId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_RECEIPT"), pharmacyReceiptId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_SALE_INVOICE"), pharmacySaleId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_PAYMENT"), pharmacyPaymentId: z.string().min(1), financialAccountId: z.string().min(1) }),
  z.object({ action: z.literal("MAP_CASH_SESSION"), pharmacyCashSessionId: z.string().min(1) }),
  z.object({
    action: z.literal("POST_INVENTORY_EVENT"),
    warehouseId: z.string().min(1),
    storageLocationId: z.string().min(1).optional(),
    currencyCode: z.string().trim().min(3).max(3).optional(),
    unitCost: z.string().optional(),
  }).and(pharmacyInventoryEventSchema),
]);

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId);
  if (!auth.ok) return auth.response;
  const [suppliers, products, purchases, receipts, sales, payments, cash, inventoryEvents] = await Promise.all([
    prisma.pharmacySupplierExtension.count({ where: { organizationId } }),
    prisma.pharmacyProductExtension.count({ where: { organizationId } }),
    prisma.pharmacyPurchaseExtension.count({ where: { organizationId } }),
    prisma.pharmacyReceiptExtension.count({ where: { organizationId } }),
    prisma.pharmacySalesExtension.count({ where: { organizationId } }),
    prisma.pharmacyPaymentExtension.count({ where: { organizationId } }),
    prisma.pharmacyCashExtension.count({ where: { organizationId } }),
    prisma.enterpriseSectorInventoryEvent.groupBy({ by: ["status"], where: { organizationId, sector: "PHARMACY" }, _count: { _all: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-pharmacy" } });
  return NextResponse.json({ mapped: { suppliers, products, purchases, receipts, sales, payments, cash }, inventoryEvents });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeSectorConvergenceRequest(req, organizationId, { mutation: true, limit: 60 });
  if (!auth.ok) return auth.response;
  const parsed = pharmacyActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "MAP_SUPPLIER"
      ? await convergePharmacySupplier(organizationId, input.pharmacySupplierId, auth.session.userId)
      : input.action === "MAP_PRODUCT"
        ? await convergePharmacyProduct(organizationId, input.pharmacyProductId, auth.session.userId)
        : input.action === "MAP_PURCHASE"
          ? await convergePharmacyPurchaseOrder(organizationId, input.pharmacyPurchaseOrderId, auth.session.userId)
          : input.action === "MAP_RECEIPT"
            ? await convergePharmacyReceipt(organizationId, input.pharmacyReceiptId, auth.session.userId)
            : input.action === "MAP_SALE_INVOICE"
              ? await convergePharmacySaleInvoice(organizationId, input.pharmacySaleId, auth.session.userId)
              : input.action === "MAP_PAYMENT"
                ? await convergePharmacyPayment(organizationId, input.pharmacyPaymentId, auth.session.userId, { financialAccountId: input.financialAccountId })
                : input.action === "MAP_CASH_SESSION"
                  ? await convergePharmacyCashSession(organizationId, input.pharmacyCashSessionId, auth.session.userId)
                  : await projectPharmacyInventoryAccountingEvent(organizationId, input.sourceMovementId, input.eventType, auth.session.userId, { warehouseId: input.warehouseId, storageLocationId: input.storageLocationId, currencyCode: input.currencyCode, unitCost: input.unitCost, eventVersion: input.eventVersion });
    await writeAuditLog({ userId: auth.session.userId, action: `SECTOR_CONVERGENCE_${input.action}`, entity: "EnterpriseSectorSyncState", request: req, metadata: { organizationId, sector: "PHARMACY" } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-pharmacy", action: input.action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const mapped = asSectorConvergenceError(error);
    await writeApiLog({ request: req, statusCode: mapped.status, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "sector-convergence-pharmacy", error: mapped.code } });
    return NextResponse.json({ error: mapped.code, details: mapped.details }, { status: mapped.status });
  }
}
