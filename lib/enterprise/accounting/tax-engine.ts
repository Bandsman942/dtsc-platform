import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import { money } from "@/lib/enterprise/accounting/helpers";
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

/**
 * Explicit, tenant-scoped per-line tax breakdown for the canonical Finance
 * invoices. Values are snapshotted at document creation, NOT inserted into
 * EnterpriseTaxLine until the invoice is actually issued / posted.
 * A documented compound base requires a configured, active TaxRule.
 */
export type CalculatedDocumentTax = {
  taxCodeId: string;
  category: string;
  rate: Prisma.Decimal;
  base: Prisma.Decimal;
  amount: Prisma.Decimal;
  jurisdiction: string | null;
  treatment: string;
  templateVersion: string | null;
  evidenceReference: string | null;
  basisMode: "NET" | "SEQUENTIAL";
  applicationOrder: number;
  recoverableAccountId: string | null;
};

export async function calculateDocumentTaxApplications(
  tx: Pick<Prisma.TransactionClient, "enterpriseTaxCode">,
  input: {
    organizationId: string;
    effectiveAt: Date;
    invoiceJurisdiction: string | null;
    taxCodeIds: string[];
    netAmount: Prisma.Decimal;
    sourceType: "SALES_INVOICE" | "SUPPLIER_INVOICE";
    calculationMode?: "NET" | "SEQUENTIAL";
    evidenceReference?: string | null;
  },
): Promise<CalculatedDocumentTax[]> {
  const ids = input.taxCodeIds;
  if (ids.length > 5 || new Set(ids).size !== ids.length) throw new EnterpriseAccountingError("TAX_LINE_SELECTION_INVALID", 409);
  if (!ids.length) return [];
  const mode = input.calculationMode || "NET";
  const proof = input.evidenceReference?.trim() || null;
  if (mode === "SEQUENTIAL" && (!proof || ids.length < 2)) throw new EnterpriseAccountingError("TAX_COMPOUND_PROOF_REQUIRED", 409);
  const codes = await tx.enterpriseTaxCode.findMany({
    where: { organizationId: input.organizationId, id: { in: ids }, isActive: true },
    include: {
      rates: { where: {
        status: "ACTIVE", effectiveFrom: { lte: input.effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveAt } }],
      }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      rules: { where: { isActive: true, sourceType: input.sourceType }, orderBy: { priority: "desc" } },
    },
  });
  if (codes.length !== ids.length) throw new EnterpriseAccountingError("TAX_CODE_INACTIVE_OR_OUT_OF_TENANT", 409);
  const byId = new Map(codes.map((code) => [code.id, code]));
  const result: CalculatedDocumentTax[] = [];
  let runningTax = new Prisma.Decimal(0);
  for (const [index, taxCodeId] of ids.entries()) {
    const code = byId.get(taxCodeId)!;
    const rate = code.rates[0]?.rate;
    if (!rate) throw new EnterpriseAccountingError("TAX_RATE_NOT_EFFECTIVE", 409);
    const verified = validatedInvoiceTaxRate({
      category: code.category, treatment: code.taxTreatment, rate,
      taxJurisdiction: code.jurisdiction, invoiceJurisdiction: input.invoiceJurisdiction,
    });
    if (verified === null) throw new EnterpriseAccountingError("TAX_JURISDICTION_OR_TREATMENT_UNSUPPORTED", 409);
    if ((code.taxTreatment !== "STANDARD" || ["EXEMPT", "ZERO_RATED"].includes(code.category)) && !proof) {
      throw new EnterpriseAccountingError("TAX_SPECIAL_TREATMENT_PROOF_REQUIRED", 409);
    }
    if (mode === "SEQUENTIAL" && index > 0) {
      const allowed = code.rules.some((rule) => {
        const criteria = rule.criteriaJson;
        return criteria && typeof criteria === "object" && !Array.isArray(criteria)
          && criteria.calculationMode === "SEQUENTIAL"
          && typeof criteria.legalReference === "string" && criteria.legalReference.trim().length >= 6;
      });
      if (!allowed) throw new EnterpriseAccountingError("TAX_COMPOUND_RULE_REQUIRED", 409);
    }
    const base = mode === "SEQUENTIAL" && index > 0 ? money(input.netAmount.plus(runningTax)) : input.netAmount;
    const amount = money(base.times(verified));
    runningTax = money(runningTax.plus(amount));
    result.push({
      taxCodeId, category: code.category, rate: verified, base, amount,
      jurisdiction: code.jurisdiction, treatment: code.taxTreatment,
      templateVersion: code.sourceTemplateVersion, evidenceReference: proof,
      basisMode: mode, applicationOrder: index, recoverableAccountId: code.recoverableAccountId,
    });
  }
  return result;
}

// TaxLine is the operational tax journal: never insert a draft's estimated tax.
export async function recordPostedTaxApplicationsTx(
  tx: Pick<Prisma.TransactionClient, "enterpriseTaxLine">,
  input: {
    organizationId: string;
    sourceEntityType: "EnterpriseSalesInvoiceItem" | "EnterpriseSupplierInvoiceItem";
    currencyCode: string;
    items: Array<{ id: string; taxBreakdownJson: Prisma.JsonValue | null; taxRecoveryRequested?: boolean }>;
  },
) {
  type Snapshot = { taxCodeId: string; rate: string; base: string; amount: string;
    jurisdiction: string | null; treatment: string; templateVersion: string | null;
    evidenceReference: string | null; basisMode: string; applicationOrder: number; effectiveAt: string };
  const posted = input.items.flatMap((item) => {
    if (item.taxBreakdownJson === null) return [];
    if (!Array.isArray(item.taxBreakdownJson)) throw new EnterpriseAccountingError("TAX_SNAPSHOT_CORRUPT", 409);
    return item.taxBreakdownJson.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EnterpriseAccountingError("TAX_SNAPSHOT_CORRUPT", 409);
      const snapshot = raw as Snapshot;
      if (typeof snapshot.taxCodeId !== "string" || typeof snapshot.amount !== "string" || typeof snapshot.base !== "string"
        || typeof snapshot.rate !== "string" || typeof snapshot.effectiveAt !== "string") throw new EnterpriseAccountingError("TAX_SNAPSHOT_CORRUPT", 409);
      const direction = input.sourceEntityType === "EnterpriseSalesInvoiceItem" ? "OUTPUT"
        : item.taxRecoveryRequested ? "INPUT" : "INPUT_NONRECOVERABLE";
      return {
        organizationId: input.organizationId,
        sourceEntityType: input.sourceEntityType, sourceEntityId: item.id,
        taxCodeId: snapshot.taxCodeId, taxableAmount: new Prisma.Decimal(snapshot.base),
        taxRate: new Prisma.Decimal(snapshot.rate), taxAmount: new Prisma.Decimal(snapshot.amount),
        currencyCode: input.currencyCode, direction,
        jurisdiction: snapshot.jurisdiction, taxTreatment: snapshot.treatment,
        evidenceReference: snapshot.evidenceReference, templateVersion: snapshot.templateVersion,
        basisMode: snapshot.basisMode, applicationOrder: snapshot.applicationOrder,
        effectiveAt: new Date(snapshot.effectiveAt),
      };
    });
  });
  if (posted.length) await tx.enterpriseTaxLine.createMany({ data: posted, skipDuplicates: true });
}

export function snapshotCalculatedTaxes(applications: CalculatedDocumentTax[], effectiveAt: Date) {
  return applications.map((entry) => ({
    taxCodeId: entry.taxCodeId, rate: entry.rate.toFixed(8), base: entry.base.toFixed(6),
    amount: entry.amount.toFixed(6), jurisdiction: entry.jurisdiction,
    treatment: entry.treatment, templateVersion: entry.templateVersion,
    evidenceReference: entry.evidenceReference, basisMode: entry.basisMode,
    applicationOrder: entry.applicationOrder, effectiveAt: effectiveAt.toISOString(),
  }));
}
