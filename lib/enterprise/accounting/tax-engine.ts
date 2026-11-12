import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";

/** Shared, tenant-scoped rate resolution for Retail/POS and common Finance invoices.
 * Automatic taxes are OPT-IN, restricted to explicitly taxable lines, and
 * limited to a single unambiguous jurisdiction-matching active standard tax.
 * Cross-border, exempt and special-sector cases require an explicit treatment.
 */
type TaxReadDb = Pick<Prisma.TransactionClient, "organization" | "enterpriseSite" | "enterpriseTaxCode" | "enterpriseFinanceConfiguration">;
export type ResolvedDefaultSalesTax = { id: string; code: string; rate: Prisma.Decimal };

export async function resolveDefaultSalesTaxes(db: TaxReadDb, input: {
  organizationId: string;
  effectiveAt: Date;
  siteId?: string | null;
}): Promise<ResolvedDefaultSalesTax[]> {
  const configuration = await db.enterpriseFinanceConfiguration.findUnique({
    where: { organizationId: input.organizationId },
    select: { taxPolicyJson: true },
  });
  const taxPolicy = configuration?.taxPolicyJson;
  if (!taxPolicy || typeof taxPolicy !== "object" || Array.isArray(taxPolicy)
    || (taxPolicy as Record<string, unknown>).automaticSalesTaxEnabled !== true) return [];
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

// Explicit fiscal selections are validated by the same pure policy in Finance
// and POS. An unqualified jurisdiction or a withholding tax may never be
// silently treated as VAT on the invoice's amount payable.
export function validatedInvoiceTaxRate(input: {
  category: string;
  treatment: string;
  rate: Prisma.Decimal;
  taxJurisdiction: string | null;
  invoiceJurisdiction: string | null;
}): Prisma.Decimal | null {
  const territory = normalizeTaxCountryCode(input.taxJurisdiction);
  if (input.taxJurisdiction && (!territory || !input.invoiceJurisdiction || territory !== input.invoiceJurisdiction)) return null;
  if (!input.rate.isFinite() || input.rate.isNegative() || input.rate.gt(1)) return null;
  if (input.category === "WITHHOLDING") return null; // Settlement/withholding liability, not output VAT.
  if (["EXEMPT", "ZERO_RATED", "OUT_OF_SCOPE"].includes(input.treatment)
      || ["EXEMPT", "ZERO_RATED"].includes(input.category)) return new Prisma.Decimal(0);
  return input.treatment === "STANDARD" ? input.rate : null;
}
