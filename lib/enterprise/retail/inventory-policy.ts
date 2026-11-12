import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

export const retailInventoryPolicySchema = z.object({
  expiryMode: z.enum(["ALLOW", "WARN", "BLOCK"]),
  enforceFefo: z.boolean(),
  warningDays: z.number().int().min(1).max(365),
  transferReception: z.enum(["IMMEDIATE", "CONFIRMED"]).default("IMMEDIATE"),
}).strict();

export type RetailInventoryPolicy = z.infer<typeof retailInventoryPolicySchema>;

export const DEFAULT_RETAIL_INVENTORY_POLICY: RetailInventoryPolicy = {
  expiryMode: "ALLOW",
  enforceFefo: false,
  warningDays: 30,
  transferReception: "IMMEDIATE",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readRetailInventoryPolicy(settings: unknown): RetailInventoryPolicy {
  const value = record(settings).inventoryPolicy;
  if (value === undefined) return { ...DEFAULT_RETAIL_INVENTORY_POLICY };
  const parsed = retailInventoryPolicySchema.safeParse(value);
  if (!parsed.success) throw new EnterpriseRetailError("RETAIL_INVENTORY_POLICY_INVALID", 409);
  return parsed.data;
}

export function mergeRetailInventoryPolicy(settings: unknown, policy: RetailInventoryPolicy): Prisma.InputJsonValue {
  return { ...record(settings), inventoryPolicy: retailInventoryPolicySchema.parse(policy) } as Prisma.InputJsonValue;
}

export function businessDateKey(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const field = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

// StockLot expiryDate is a date entered as a calendar day, persisted as a
// UTC-anchored DateTime by the shared Inventory domain. Decode only that
// stored date label here; today's *business* date must come independently
// from businessDateKey(now, organization.timezone), never from UTC now.
export function retailLotExpiryDateKey(expiryDate: Date): string {
  const year = String(expiryDate.getUTCFullYear()).padStart(4, "0");
  const month = String(expiryDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(expiryDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A lot remains valid throughout its named expiry day in the store's timezone.
export function lotIsExpired(expiryDate: Date | null, businessDate: string): boolean {
  return Boolean(expiryDate && retailLotExpiryDateKey(expiryDate) < businessDate);
}

export type RetailLotPolicyWarning = {
  code: "RETAIL_STOCK_LOT_EXPIRED_WARNING" | "RETAIL_STOCK_LOT_UNDATED_WARNING";
  inventoryItemId: string;
  stockLotId: string | null;
};

export async function assertRetailLotPolicyTx(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    warehouseId: string;
    timezone: string;
    settings: unknown;
    lines: Array<{ inventoryItemId: string | null; stockLotId: string | null }>;
  },
) {
  const policy = readRetailInventoryPolicy(args.settings);
  const warnings: RetailLotPolicyWarning[] = [];
  if (policy.expiryMode === "ALLOW" && !policy.enforceFefo) return warnings;
  const inventoryIds = [...new Set(args.lines.map((line) => line.inventoryItemId).filter((value): value is string => Boolean(value)))];
  if (!inventoryIds.length) return warnings;
  const lots = await tx.enterpriseStockLot.findMany({
    where: { organizationId: args.organizationId, warehouseId: args.warehouseId, inventoryItemId: { in: inventoryIds }, archivedAt: null },
    select: { id: true, inventoryItemId: true, status: true, expiryDate: true },
  });
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const today = businessDateKey(new Date(), args.timezone);
  const balances = policy.enforceFefo ? await tx.enterpriseInventoryBalance.findMany({
    where: {
      organizationId: args.organizationId, warehouseId: args.warehouseId,
      inventoryItemId: { in: inventoryIds }, stockLotId: { not: null },
      quantityOnHand: { gt: 0 },
    },
    select: { inventoryItemId: true, stockLotId: true, quantityOnHand: true, quantityReserved: true },
  }) : [];

  for (const line of args.lines) {
    if (!line.inventoryItemId) continue;
    const availableLots = lots.filter((lot) => lot.inventoryItemId === line.inventoryItemId && lot.status === "AVAILABLE");
    // When a product is managed in dated lots, a lot-less sale must never
    // bypass the configured expiry barrier.
    if (!line.stockLotId) {
      if (policy.expiryMode === "BLOCK" && availableLots.some((lot) => lot.expiryDate)) {
        throw new EnterpriseRetailError("RETAIL_STOCK_LOT_REQUIRED", 409);
      }
      if (policy.enforceFefo && availableLots.length) throw new EnterpriseRetailError("RETAIL_STOCK_LOT_REQUIRED", 409);
      if (policy.expiryMode === "WARN" && availableLots.some((lot) => lot.expiryDate)) warnings.push({
        code: "RETAIL_STOCK_LOT_UNDATED_WARNING", inventoryItemId: line.inventoryItemId, stockLotId: null,
      });
      continue;
    }
    const selected = lotById.get(line.stockLotId);
    if (!selected || selected.inventoryItemId !== line.inventoryItemId || selected.status !== "AVAILABLE") {
      throw new EnterpriseRetailError("RETAIL_STOCK_LOT_INVALID", 409);
    }
    if (lotIsExpired(selected.expiryDate, today)) {
      if (policy.expiryMode === "BLOCK") throw new EnterpriseRetailError("RETAIL_STOCK_LOT_EXPIRED", 409);
      if (policy.expiryMode === "WARN") warnings.push({
        code: "RETAIL_STOCK_LOT_EXPIRED_WARNING", inventoryItemId: line.inventoryItemId, stockLotId: selected.id,
      });
    }
    if (!policy.enforceFefo) continue;
    const usable = availableLots.filter((lot) => !lotIsExpired(lot.expiryDate, today));
    const candidates = usable.filter((lot) => balances.some((balance) =>
      balance.inventoryItemId === line.inventoryItemId && balance.stockLotId === lot.id
      && balance.quantityOnHand.greaterThan(balance.quantityReserved),
    ));
    candidates.sort((a, b) => (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
    if (candidates.length && candidates[0].id !== selected.id) throw new EnterpriseRetailError("RETAIL_FEFO_LOT_REQUIRED", 409);
  }
  return warnings;
}
