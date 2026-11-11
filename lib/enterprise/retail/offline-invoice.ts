import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { previewRetailCommercialPricing } from "@/lib/enterprise/retail/commercial-engine";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { prepareRetailInvoice } from "@/lib/enterprise/retail/invoice-checkout";
import { requireRetailSiteCapability } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

/** Offline invoice intake is intentionally NOT an offline receipt/payment.
 * It creates only Finance's canonical DRAFT invoice after a fresh server check.
 * Approving, issuing, collecting, stock movements and accounting stay online.
 */
const nonNegativeMoney = z.number().finite().min(0).max(1e15);
const draftSchema = z.object({
  mode: z.literal("INVOICE_DRAFT"),
  soldAt: z.string().datetime({ offset: true }),
  siteId: z.string().min(1),
  warehouseId: z.string().min(1),
  currencyCode: z.string().length(3),
  customerBusinessPartyId: z.null().optional(),
  couponCode: z.null().optional(),
  overrideReason: z.null().optional(),
  tenders: z.array(z.unknown()).length(0),
  lines: z.array(z.object({
    catalogItemId: z.string().min(1),
    quantity: z.number().finite().positive().max(1_000_000).refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.000001),
    unitPrice: nonNegativeMoney,
    discountAmount: nonNegativeMoney,
    taxAmount: nonNegativeMoney,
  }).passthrough()).min(1).max(100),
}).passthrough();

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function decimal(value: Prisma.Decimal.Value) { return new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP); }
function amount(value: Prisma.Decimal.Value) { return decimal(value).toFixed(6); }

async function conflict(organizationId: string, operationUuid: string, status: "CONFLICT" | "REJECTED", code: string) {
  const operation = await prisma.enterpriseRetailOfflineSyncOperation.update({
    where: { organizationId_operationUuid: { organizationId, operationUuid } },
    data: { status, conflictCode: code, syncedAt: null },
  });
  return { operation, idempotent: false };
}

export async function syncRetailOfflineInvoiceDraft(args: {
  organizationId: string; actorUserId: string; operationUuid: string;
  snapshotVersion: string; siteId: string; warehouseId: string; payload: unknown;
}) {
  const { organizationId, actorUserId, operationUuid } = args;
  // Permission is revalidated at every replay: a cached snapshot cannot retain revoked access.
  await requireRetailSiteCapability(organizationId, actorUserId, args.siteId, "PREPARE_INVOICE", prisma, { requireAssignment: true });
  const payloadHash = hash(args.payload);
  const existing = await prisma.enterpriseRetailOfflineSyncOperation.findFirst({
    where: { organizationId, operationUuid },
  });
  if (existing?.payloadHash !== undefined && existing.payloadHash !== payloadHash) {
    throw new EnterpriseRetailError("RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH", 409);
  }
  if (existing && (existing.siteId !== args.siteId || existing.warehouseId !== args.warehouseId || existing.snapshotVersion !== args.snapshotVersion)) {
    throw new EnterpriseRetailError("RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH", 409);
  }
  if (existing?.operationType && existing.operationType !== "INVOICE_DRAFT") {
    throw new EnterpriseRetailError("RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH", 409);
  }
  if (existing && ["SYNCED", "CONFLICT", "REJECTED"].includes(existing.status)) return { operation: existing, idempotent: true };
  if (!existing) {
    try {
      await prisma.enterpriseRetailOfflineSyncOperation.create({
        data: {
          organizationId, operationUuid, operationType: "INVOICE_DRAFT",
          siteId: args.siteId, warehouseId: args.warehouseId, snapshotVersion: args.snapshotVersion,
          payloadHash, receivedByUserId: actorUserId,
        },
      });
    } catch (error) {
      // A second browser tab may have inserted the same UUID. Never overwrite it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await prisma.enterpriseRetailOfflineSyncOperation.findFirst({ where: { organizationId, operationUuid } });
      if (!raced || raced.payloadHash !== payloadHash || raced.operationType !== "INVOICE_DRAFT"
        || raced.siteId !== args.siteId || raced.warehouseId !== args.warehouseId || raced.snapshotVersion !== args.snapshotVersion) {
        throw new EnterpriseRetailError("RETAIL_OFFLINE_UUID_PAYLOAD_MISMATCH", 409);
      }
      if (["SYNCED", "CONFLICT", "REJECTED"].includes(raced.status)) return { operation: raced, idempotent: true };
    }
  }

  const config = await prisma.enterpriseRetailConfiguration.findUnique({
    where: { organizationId }, select: { settingsJson: true },
  });
  const settings = config?.settingsJson;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
    return conflict(organizationId, operationUuid, "CONFLICT", "RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE");
  }
  const snapshot = await prisma.enterpriseRetailOfflineSnapshot.findFirst({
    where: { organizationId, version: args.snapshotVersion, siteId: args.siteId, warehouseId: args.warehouseId },
  });
  if (!snapshot) return conflict(organizationId, operationUuid, "CONFLICT", "OFFLINE_SNAPSHOT_NOT_FOUND");
  const parsed = draftSchema.safeParse(args.payload);
  if (!parsed.success) return conflict(organizationId, operationUuid, "REJECTED", "OFFLINE_INVOICE_DRAFT_INVALID");
  const body = parsed.data;
  if (body.siteId !== args.siteId || body.warehouseId !== args.warehouseId || body.currencyCode !== snapshot.currencyCode) {
    return conflict(organizationId, operationUuid, "REJECTED", "OFFLINE_INVOICE_SCOPE_MISMATCH");
  }
  const capturedAt = new Date(body.soldAt);
  if (capturedAt < snapshot.validFrom || capturedAt > snapshot.validUntil || capturedAt.getTime() > Date.now() + 60_000) {
    return conflict(organizationId, operationUuid, "CONFLICT", "OFFLINE_SNAPSHOT_EXPIRED");
  }
  if (new Set(body.lines.map((line) => line.catalogItemId)).size !== body.lines.length) {
    return conflict(organizationId, operationUuid, "REJECTED", "RETAIL_DUPLICATE");
  }
  try {
    // Always compare the locally displayed amount against live canonical prices/taxes.
    // No stale, discounted or tax-exempt value is ever silently accepted.
    const preview = await previewRetailCommercialPricing(
      organizationId,
      { siteId: args.siteId, customerBusinessPartyId: null, currencyCode: body.currencyCode,
        lines: body.lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity })) },
      { channelCode: "POS", couponCode: null, customerSegmentCode: null },
    );
    const resolved = new Map(preview.lines.map((line) => [line.catalogItemId, line]));
    const changed = body.lines.some((line) => {
      const server = resolved.get(line.catalogItemId);
      if (!server) return true;
      const rate = decimal(server.taxRate);
      const divisor = server.taxIncluded && rate.gt(0) ? decimal(1).plus(rate) : decimal(1);
      const price = decimal(decimal(server.resolvedUnitPrice).div(divisor));
      const discount = decimal(decimal(server.discountAmount).div(divisor));
      return amount(line.unitPrice) !== amount(price)
        || amount(line.discountAmount) !== amount(discount)
        || amount(line.taxAmount) !== amount(server.taxAmount);
    });
    if (changed) return conflict(organizationId, operationUuid, "CONFLICT", "OFFLINE_PRICING_CHANGED");

    const result = await prepareRetailInvoice(organizationId, actorUserId, {
      idempotencyKey: `offline-invoice:${operationUuid}`,
      siteId: args.siteId,
      warehouseId: args.warehouseId,
      businessPartyId: null,
      currencyCode: body.currencyCode,
      lines: body.lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity, stockLotId: null })),
    });
    // prepareRetailInvoice only creates a Finance DRAFT and a nonfinancial stock hold.
    // It does NOT approve/issue the invoice, confirm cash or post accounting.
    const operation = await prisma.enterpriseRetailOfflineSyncOperation.update({
      where: { organizationId_operationUuid: { organizationId, operationUuid } },
      data: {
        status: "SYNCED",
        serverEntityType: "EnterpriseSalesInvoice",
        serverEntityId: result.invoice.id,
        syncedAt: new Date(),
        conflictCode: null,
        conflictJson: Prisma.JsonNull,
      },
    });
    return { operation, invoice: result.invoice, idempotent: result.idempotent };
  } catch (error) {
    // Preserve the original operation and payload for reconciliation; do not silently drop it.
    const code = error instanceof EnterpriseRetailError ? error.code : "OFFLINE_INVOICE_REQUIRES_REVIEW";
    return conflict(organizationId, operationUuid, "CONFLICT", code);
  }
}
