import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";

/** Shared, tenant-scoped rate resolution for Retail/POS and common Finance invoices.
 * Automatic taxes are OPT-IN, restricted to explicitly taxable lines, and
 * limited to a single unambiguous jurisdiction-matching active standard tax.
 * Cross-border, exempt and special-sector cases require an explicit treatment.
 */
type TaxReadDb = Pick<Prisma.TransactionClient, "organization" | "enterpriseSite" | "enterpriseTaxCode">;
export type ResolvedDefaultSalesTax = { id: string; code: string; rate: Prisma.Decimal };

export async function resolveDefaultSalesTaxes(db: TaxReadDb, input: {
  organizationId: string;
  effectiveAt: Date;
  siteId?: string | null;
}): Promise<ResolvedDefaultSalesTax[]> {
  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { country: true },
  });
  const site = input.siteId ? await db.enterpriseSite.findFirst({
    where: { organizationId: input.organizationId, id: input.siteId, archivedAt: null, status: "ACTIVE" },
    select: { countryCode: true },
  }) : null;
  // An unknown/inactive site may never fall back to a different tax territory.
  if (input.siteId && !site) return [];
  const jurisdiction = normalizeTaxCountryCode(site?.countryCode || organization?.country);
  if (!jurisdiction) return [];
  const codes = await db.enterpriseTaxCode.findMany({
    where: {
      organizationId: input.organizationId,
      jurisdiction,
      isActive: true,
      autoApply: true,
      taxTreatment: "STANDARD",
      category: { in: ["VAT", "GST", "SALES_TAX"] },
    },
    select: {
      id: true,
      code: true,
      rates: {
        where: {
          status: "ACTIVE",
          effectiveFrom: { lte: input.effectiveAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveAt } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { rate: true },
      },
    },
  });
  return codes.flatMap((entry) => entry.rates[0] ? [{ id: entry.id, code: entry.code, rate: entry.rates[0].rate }] : []);
}

export async function resolveDefaultSalesTaxesForRetail(input: {
  organizationId: string;
  effectiveAt: Date;
  siteId?: string | null;
}) {
  return resolveDefaultSalesTaxes(prisma, input);
}
