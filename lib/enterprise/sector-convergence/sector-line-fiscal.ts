import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDocumentTaxApplications, snapshotCalculatedTaxes } from "@/lib/enterprise/accounting/tax-engine";
import { normalizeTaxCountryCode } from "@/lib/enterprise/accounting/tax-jurisdictions";
import { money, sumDecimals } from "@/lib/enterprise/accounting/helpers";

/** Sector source and canonical Finance store the SAME server-derived fiscal
 * evidence. Patient identity / diagnosis and prescriptions are never serialized.
 * No use of today's rate is allowed while converging an existing document.
 */
type SectorInputLine = {
  taxCodeId?: string | null;
  additionalTaxCodeIds?: string[];
  taxCalculationMode?: "NET" | "SEQUENTIAL";
  taxEvidenceReference?: string;
};
export async function calculateSectorSourceTax(input: {
  organizationId: string; effectiveAt: Date; netAmounts: Prisma.Decimal[];
  globalDiscountAmount: Prisma.Decimal; lines: SectorInputLine[];
  declaredTaxAmount: Prisma.Decimal.Value;
}) {
  if (input.lines.length !== input.netAmounts.length) throw new Error("SECTOR_TAX_LINE_COUNT_INVALID");
  const netTotal = money(sumDecimals(input.netAmounts));
  if (input.globalDiscountAmount.isNegative() || input.globalDiscountAmount.gt(netTotal)) throw new Error("SECTOR_TAX_GLOBAL_DISCOUNT_INVALID");
  const hasSelections = input.lines.some((line) => Boolean(line.taxCodeId || line.additionalTaxCodeIds?.length));
  const org = hasSelections ? await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { country: true } }) : null;
  const jurisdiction = normalizeTaxCountryCode(org?.country);
  if (hasSelections && !jurisdiction) throw new Error("SECTOR_TAX_JURISDICTION_REQUIRED");
  const output = [];
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const codeIds = [...(line.taxCodeId ? [line.taxCodeId] : []), ...(line.additionalTaxCodeIds || [])];
    const base = netTotal.gt(0)
      ? money(input.netAmounts[i].minus(input.globalDiscountAmount.times(input.netAmounts[i]).div(netTotal)))
      : money(0);
    if (base.isNegative()) throw new Error("SECTOR_TAX_BASE_INVALID");
    const calculated = await calculateDocumentTaxApplications(prisma, {
      organizationId: input.organizationId, effectiveAt: input.effectiveAt, invoiceJurisdiction: jurisdiction,
      taxCodeIds: codeIds, netAmount: base, sourceType: "SALES_INVOICE",
      calculationMode: line.taxCalculationMode, evidenceReference: line.taxEvidenceReference,
    });
    output.push({
      taxCodeId: calculated[0]?.taxCodeId || null,
      taxRateApplied: calculated[0]?.rate || null,
      taxJurisdiction: calculated[0]?.jurisdiction || null,
      taxTemplateVersion: calculated[0]?.templateVersion || null,
      taxEvidenceReference: line.taxEvidenceReference || null,
      taxCalculationMode: line.taxCalculationMode || "NET",
      taxAmount: money(sumDecimals(calculated.map((x) => x.amount))),
      taxBreakdownJson: calculated.length ? snapshotCalculatedTaxes(calculated, input.effectiveAt) : Prisma.JsonNull,
    });
  }
  const total = money(sumDecimals(output.map((line) => line.taxAmount)));
  const declared = money(input.declaredTaxAmount);
  if (declared.gt(0) && !declared.equals(total)) throw new Error("SECTOR_TAX_HEADER_NOT_SUPPORTED_WITHOUT_LINE_EVIDENCE");
  return { total, lines: output };
}

type PersistedSectorFiscalLine = {
  taxAmount: Prisma.Decimal;
  taxCodeId: string | null;
  taxBreakdownJson: Prisma.JsonValue | null;
};
export function assertSectorLineTaxProvenance(
  lines: PersistedSectorFiscalLine[], headerTax: Prisma.Decimal, errorCode: string,
) {
  const total = money(sumDecimals(lines.map((line) => line.taxAmount)));
  if (total.isNegative() || !total.equals(money(headerTax))) throw new Error(errorCode);
  for (const line of lines) {
    if (line.taxAmount.isNegative()) throw new Error(errorCode);
    const snapshots = line.taxBreakdownJson;
    if (snapshots === null) { if (!line.taxAmount.isZero() || line.taxCodeId) throw new Error(errorCode); continue; }
    if (!Array.isArray(snapshots) || !snapshots.length || !line.taxCodeId) throw new Error(errorCode);
    const summed = [];
    for (const [index, raw] of snapshots.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)
        || typeof raw.taxCodeId !== "string" || typeof raw.amount !== "string"
        || typeof raw.base !== "string" || typeof raw.rate !== "string"
        || typeof raw.effectiveAt !== "string" || !Number.isFinite(Date.parse(raw.effectiveAt))
        || (index === 0 && raw.taxCodeId !== line.taxCodeId)) throw new Error(errorCode);
      const amount = new Prisma.Decimal(raw.amount);
      if (amount.isNegative() || !amount.isFinite()) throw new Error(errorCode);
      summed.push(amount);
    }
    if (!money(sumDecimals(summed)).equals(money(line.taxAmount))) throw new Error(errorCode);
  }
}
