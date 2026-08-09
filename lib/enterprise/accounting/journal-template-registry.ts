import type { Prisma } from "@prisma/client";
import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";

export type RecommendedJournalDefinition = {
  code: string;
  nameFr: string;
  nameEn: string;
  journalType: string;
  sequencePrefix: string;
  requiresApproval: boolean;
  postingEvents: readonly string[];
};

export const RECOMMENDED_ACCOUNTING_JOURNALS = Object.freeze([
  { code: "VE", nameFr: "Journal des ventes", nameEn: "Sales journal", journalType: "SALES", sequencePrefix: "VE", requiresApproval: false, postingEvents: ["SALES_INVOICE_POSTED", "SALES_CREDIT_NOTE_POSTED", "RETAIL_POS_SALE_POSTED", "RETAIL_POS_SALE_REVERSED"] },
  { code: "AC", nameFr: "Journal des achats", nameEn: "Purchases journal", journalType: "PURCHASES", sequencePrefix: "AC", requiresApproval: true, postingEvents: ["SUPPLIER_INVOICE_POSTED", "SUPPLIER_CREDIT_NOTE_POSTED"] },
  { code: "BQ", nameFr: "Journal de banque", nameEn: "Bank journal", journalType: "BANK", sequencePrefix: "BQ", requiresApproval: false, postingEvents: ["BANK_CHARGE_POSTED"] },
  { code: "CA", nameFr: "Journal de caisse", nameEn: "Cash journal", journalType: "CASH", sequencePrefix: "CA", requiresApproval: false, postingEvents: ["CASH_VARIANCE_POSTED"] },
  { code: "MM", nameFr: "Journal Mobile Money", nameEn: "Mobile Money journal", journalType: "MOBILE_MONEY", sequencePrefix: "MM", requiresApproval: false, postingEvents: [] },
  { code: "PA", nameFr: "Journal de paie", nameEn: "Payroll journal", journalType: "PAYROLL", sequencePrefix: "PA", requiresApproval: true, postingEvents: ["PAYROLL_APPROVED", "PAYROLL_PAYMENT_CONFIRMED"] },
  { code: "ST", nameFr: "Journal des stocks", nameEn: "Inventory journal", journalType: "INVENTORY", sequencePrefix: "ST", requiresApproval: false, postingEvents: ["INVENTORY_RECEIPT_VALUED", "INVENTORY_ISSUE_VALUED", "RETAIL_POS_INVENTORY_RETURN", "PHARMACY_CUSTOMER_RETURN", "PHARMACY_SUPPLIER_RETURN", "PHARMACY_LOSS", "PHARMACY_EXPIRY_WRITE_OFF", "PHARMACY_ADJUSTMENT", "PHARMACY_RECALL_WRITE_OFF"] },
  { code: "IM", nameFr: "Journal des immobilisations", nameEn: "Assets journal", journalType: "ASSETS", sequencePrefix: "IM", requiresApproval: true, postingEvents: ["ASSET_CAPITALIZED", "ASSET_DEPRECIATION_POSTED"] },
  { code: "OD", nameFr: "Opérations diverses", nameEn: "General adjustments", journalType: "ADJUSTMENT", sequencePrefix: "OD", requiresApproval: true, postingEvents: ["PAYMENT_ALLOCATION_CONFIRMED", "HEALTH_WRITE_OFF_APPROVED"] },
  { code: "GE", nameFr: "Journal général", nameEn: "General journal", journalType: "GENERAL", sequencePrefix: "GE", requiresApproval: true, postingEvents: ["EXPENSE_APPROVED"] },
  { code: "OU", nameFr: "Journal d'ouverture", nameEn: "Opening journal", journalType: "OPENING", sequencePrefix: "OU", requiresApproval: true, postingEvents: ["OPENING_BALANCE_POSTED"] },
  { code: "TX", nameFr: "Journal fiscal", nameEn: "Tax journal", journalType: "TAX", sequencePrefix: "TX", requiresApproval: true, postingEvents: [] },
] satisfies readonly RecommendedJournalDefinition[]);

export function requiredJournalTypes() {
  return Array.from(new Set(RECOMMENDED_ACCOUNTING_JOURNALS.filter((journal) => journal.postingEvents.length > 0).map((journal) => journal.journalType)));
}

export async function applyRecommendedJournals(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
) {
  const existing = await tx.enterpriseJournal.findMany({ where: { organizationId }, select: { code: true } });
  const existingCodes = new Set(existing.map((journal) => journal.code));
  const missing = RECOMMENDED_ACCOUNTING_JOURNALS.filter((journal) => !existingCodes.has(journal.code));
  if (missing.length) {
    await tx.enterpriseJournal.createMany({
      data: missing.map((journal) => ({
        organizationId,
        code: journal.code,
        nameFr: journal.nameFr,
        nameEn: journal.nameEn,
        journalType: journal.journalType,
        sequencePrefix: journal.sequencePrefix,
        requiresApproval: journal.requiresApproval,
        createdByUserId: actorUserId,
      })),
    });
  }
  const duplicates = await tx.enterpriseJournal.groupBy({
    by: ["journalType"],
    where: { organizationId, isActive: true },
    _count: { _all: true },
  });
  if (duplicates.some((row) => row._count._all > 20)) {
    throw new EnterpriseAccountingError("ACCOUNTING_JOURNAL_CONFIGURATION_INVALID", 409);
  }
  return tx.enterpriseJournal.findMany({ where: { organizationId }, orderBy: [{ journalType: "asc" }, { code: "asc" }] });
}
