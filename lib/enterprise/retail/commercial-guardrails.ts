import { Prisma } from "@prisma/client";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import type { RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { prisma } from "@/lib/prisma";
import type { mobileMoneyCreateSchema, retailSaleCreateSchema, telcoTopupCreateSchema } from "@/lib/enterprise/retail/schemas";
import type { z } from "zod";

type RetailSaleInput = z.infer<typeof retailSaleCreateSchema>;
type MobileMoneyInput = z.infer<typeof mobileMoneyCreateSchema>;
type TelcoTopupInput = z.infer<typeof telcoTopupCreateSchema>;

const DRC_COUNTRY_MARKERS = new Set(["CD", "COD", "RDC", "DRC", "CONGO RDC", "CONGO-KINSHASA", "DEMOCRATIC REPUBLIC OF THE CONGO"]);

function normalizeCountry(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z -]/g, "");
}

export function normalizeRetailPhone(value: string, country?: string | null) {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[\s().-]/g, "");
  let normalized = compact;
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (!normalized.startsWith("+") && DRC_COUNTRY_MARKERS.has(normalizeCountry(country))) {
    normalized = normalized.startsWith("0") ? `+243${normalized.slice(1)}` : `+243${normalized}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new EnterpriseRetailError("RETAIL_PHONE_INVALID", 400);
  }
  return normalized;
}

async function organizationCountry(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { country: true },
  });
  if (!organization) throw new EnterpriseRetailError("RETAIL_ORGANIZATION_NOT_FOUND", 404);
  return organization.country;
}

export async function prepareCommercialRetailSale(
  organizationId: string,
  input: RetailSaleInput,
  options: { allowOverride: boolean; overrideReason?: string | null },
) {
  const ids = Array.from(new Set(input.lines.map((line) => line.catalogItemId)));
  const items = await prisma.enterpriseCatalogItem.findMany({
    where: { organizationId, id: { in: ids }, status: "ACTIVE", archivedAt: null },
    select: { id: true, name: true, currency: true, indicativeSalePrice: true },
  });
  if (items.length !== ids.length) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409);
  const byId = new Map(items.map((item) => [item.id, item]));
  const reason = options.overrideReason?.trim() || "";
  const overrides: Array<{ catalogItemId: string; reason: "PRICE" | "DISCOUNT" | "TAX" | "PRICE_MISSING" }> = [];

  const lines = input.lines.map((line) => {
    const item = byId.get(line.catalogItemId);
    if (!item) throw new EnterpriseRetailError("RETAIL_CATALOG_ITEM_INVALID", 409, { catalogItemId: line.catalogItemId });
    if (item.currency && item.currency !== input.currencyCode) throw new EnterpriseRetailError("RETAIL_CURRENCY_MISMATCH", 409, { catalogItemId: item.id });
    const requestedPrice = new Prisma.Decimal(line.unitPrice);
    const catalogPrice = item.indicativeSalePrice ? new Prisma.Decimal(item.indicativeSalePrice) : null;
    const discount = new Prisma.Decimal(line.discountAmount || 0);
    const tax = new Prisma.Decimal(line.taxAmount || 0);
    if (!catalogPrice) overrides.push({ catalogItemId: item.id, reason: "PRICE_MISSING" });
    else if (!requestedPrice.equals(catalogPrice)) overrides.push({ catalogItemId: item.id, reason: "PRICE" });
    if (!discount.isZero()) overrides.push({ catalogItemId: item.id, reason: "DISCOUNT" });
    if (!tax.isZero()) overrides.push({ catalogItemId: item.id, reason: "TAX" });
    return {
      ...line,
      unitPrice: catalogPrice && requestedPrice.equals(catalogPrice) ? Number(catalogPrice.toString()) : line.unitPrice,
    };
  });

  if (overrides.length && !options.allowOverride) {
    throw new EnterpriseRetailError("RETAIL_PRICE_OVERRIDE_FORBIDDEN", 403, { overrideCount: overrides.length });
  }
  if (overrides.length && reason.length < 3) {
    throw new EnterpriseRetailError("RETAIL_PRICE_OVERRIDE_REASON_REQUIRED", 400, { overrideCount: overrides.length });
  }
  return { input: { ...input, lines }, overrideApplied: overrides.length > 0, overrideReason: overrides.length ? reason : null, overrides };
}

async function assertExternalReferenceAvailable(
  organizationId: string,
  kind: "MOBILE_MONEY" | "TELCO",
  providerCode: string,
  externalReference: string,
) {
  const existing = kind === "MOBILE_MONEY"
    ? await prisma.enterpriseMobileMoneyTransaction.findFirst({ where: { organizationId, providerCode, externalReference }, select: { id: true } })
    : await prisma.enterpriseTelcoTopup.findFirst({ where: { organizationId, providerCode, externalReference }, select: { id: true } });
  if (existing) throw new EnterpriseRetailError("RETAIL_EXTERNAL_REFERENCE_DUPLICATE", 409, { providerCode });
}

export async function prepareCommercialMobileMoney(organizationId: string, input: MobileMoneyInput) {
  const externalReference = input.externalReference?.trim();
  if (!externalReference) throw new EnterpriseRetailError("RETAIL_EXTERNAL_REFERENCE_REQUIRED", 400);
  const country = await organizationCountry(organizationId);
  const customerPhone = normalizeRetailPhone(input.customerPhone, country);
  await assertExternalReferenceAvailable(organizationId, "MOBILE_MONEY", input.providerCode, externalReference);
  return { ...input, customerPhone, externalReference, floatAccountId: null };
}

export async function prepareCommercialTelcoTopup(organizationId: string, input: TelcoTopupInput) {
  const externalReference = input.externalReference?.trim() || null;
  if (input.status === "SUCCESS" && !externalReference) throw new EnterpriseRetailError("RETAIL_EXTERNAL_REFERENCE_REQUIRED", 400);
  const country = await organizationCountry(organizationId);
  const destinationPhone = normalizeRetailPhone(input.destinationPhone, country);
  if (externalReference) await assertExternalReferenceAvailable(organizationId, "TELCO", input.providerCode, externalReference);
  return { ...input, destinationPhone, externalReference, operatorFloatAccountId: null };
}

type CurrencyMetric = { currencyCode: string; count: number; amount: string };

export async function getRetailMetricsByCurrency(
  organizationId: string,
  from: Date,
  to: Date,
  moduleCode?: RetailModuleCode,
) {
  const includeSales = !moduleCode || moduleCode === "RETAIL_POS";
  const includeMobileMoney = !moduleCode || moduleCode === "MOBILE_MONEY_AGENCY";
  const includeTelco = !moduleCode || moduleCode === "TELCO_TOPUPS";

  const [sales, mobileMoney, topups] = await Promise.all([
    includeSales
      ? prisma.enterpriseRetailSale.groupBy({
          by: ["currencyCode"],
          where: { organizationId, status: "COMPLETED", soldAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { grandTotal: true },
        })
      : Promise.resolve([]),
    includeMobileMoney
      ? prisma.enterpriseMobileMoneyTransaction.groupBy({
          by: ["currencyCode", "transactionType"],
          where: { organizationId, status: "CONFIRMED", occurredAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { principalAmount: true, providerCommissionAmount: true },
        })
      : Promise.resolve([]),
    includeTelco
      ? prisma.enterpriseTelcoTopup.groupBy({
          by: ["currencyCode"],
          where: { organizationId, status: "SUCCESS", occurredAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { saleAmount: true, marginAmount: true },
        })
      : Promise.resolve([]),
  ]);

  const saleMetrics: CurrencyMetric[] = sales.map((row) => ({ currencyCode: row.currencyCode, count: row._count._all, amount: (row._sum.grandTotal || new Prisma.Decimal(0)).toFixed() }));
  const mobileByCurrency = new Map<string, { currencyCode: string; deposits: string; withdrawals: string; commission: Prisma.Decimal; count: number }>();
  for (const row of mobileMoney) {
    const current = mobileByCurrency.get(row.currencyCode) || { currencyCode: row.currencyCode, deposits: "0", withdrawals: "0", commission: new Prisma.Decimal(0), count: 0 };
    const principal = row._sum.principalAmount || new Prisma.Decimal(0);
    if (row.transactionType === "DEPOSIT") current.deposits = principal.toFixed();
    if (row.transactionType === "WITHDRAWAL") current.withdrawals = principal.toFixed();
    current.commission = current.commission.plus(row._sum.providerCommissionAmount || 0);
    current.count += row._count._all;
    mobileByCurrency.set(row.currencyCode, current);
  }
  const telcoMetrics = topups.map((row) => ({
    currencyCode: row.currencyCode,
    count: row._count._all,
    revenue: (row._sum.saleAmount || new Prisma.Decimal(0)).toFixed(),
    margin: (row._sum.marginAmount || new Prisma.Decimal(0)).toFixed(),
  }));
  return {
    sales: saleMetrics,
    mobileMoney: Array.from(mobileByCurrency.values()).map((row) => ({ currencyCode: row.currencyCode, count: row.count, deposits: row.deposits, withdrawals: row.withdrawals, commission: row.commission.toFixed() })),
    telco: telcoMetrics,
  };
}