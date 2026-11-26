import { Prisma } from "@prisma/client";
import type { AccountingChartTemplateDefinition } from "@/lib/enterprise/accounting/chart-template-types";
import type { PostingLineDraft } from "@/lib/enterprise/accounting/posting-types";

/**
 * Isolated design candidate for the merchandise subset of #1228. Never used
 * by posting-service, never registered as a published template, never persisted.
 * The complete reviewed dataset and controlled activation are still required.
 */
export const SYSCOHADA_MERCHANDISE_DRAFT_REFERENCE = "OHADA_SYSCOHADA@1.0.0" as const;
export const SYSCOHADA_MERCHANDISE_SOURCE = Object.freeze({
  uri: "https://www.ohada.com/uploads/actualite/3504/Guide-d-application-du-SYSCOHADA.pdf",
  sha256: "25c24c8b00be0eb53d7bdd7dce53c18ef9d46adbe2dbf16619996c0a75d4df0b",
  locator: "Guide d’application du SYSCOHADA, pages 23–24 et 76–77",
  verifiedAt: "2026-11-25",
  scope: "MERCHANDISE_ONLY",
  status: "PARTIAL_SOURCE_REVIEW",
} as const);

/** Candidate comparison only: the baseline stays intact. The complete dataset
 * pipeline must be satisfied separately before publication. */
export function buildMerchandiseChartDraft(baseline: AccountingChartTemplateDefinition): AccountingChartTemplateDefinition {
  if (baseline.code !== "OHADA_SYSCOHADA" || baseline.version !== "0.1.0" || baseline.status !== "PUBLISHED") {
    throw new Error("SYSCOHADA_DRAFT_BASELINE_INVALID");
  }
  if (baseline.accounts.some(account => account.code === "6031") ||
      baseline.semanticMappings.some(mapping => mapping.mappingKey === "GOODS_PURCHASES" || mapping.mappingKey === "GOODS_STOCK_VARIATION")) {
    throw new Error("SYSCOHADA_DRAFT_BASELINE_CHANGED");
  }
  if (!["601", "311", "471"].every(code => baseline.accounts.some(account => account.code === code))) {
    throw new Error("SYSCOHADA_DRAFT_BASELINE_ACCOUNT_MISSING");
  }
  if (!baseline.financialStatementMappings.some(mapping => mapping.statementType === "INCOME_STATEMENT" && mapping.lineCode === "IS_PURCHASES")) {
    throw new Error("SYSCOHADA_DRAFT_BASELINE_STATEMENT_MISSING");
  }
  return {
    ...baseline, version: "1.0.0", status: "DRAFT",
    nameFr: "SYSCOHADA — candidat partiel marchandises",
    nameEn: "SYSCOHADA — partial merchandise candidate",
    // Proposed comparison only, not an effective activation date.
    effectiveFrom: "2026-11-25",
    source: {
      kind: "DTSC_INTERNAL", authority: "DTSC — revue partielle",
      reference: SYSCOHADA_MERCHANDISE_SOURCE.locator,
      uri: SYSCOHADA_MERCHANDISE_SOURCE.uri, verifiedAt: SYSCOHADA_MERCHANDISE_SOURCE.verifiedAt,
    },
    accounts: [...baseline.accounts, {
      code: "6031", nameFr: "Variations des stocks de marchandises",
      nameEn: "Merchandise inventory variation", accountType: "EXPENSE", accountSubtype: "COST_OF_SALES",
      isControlAccount: false, isSystemAccount: true, allowDirectPosting: true,
    }],
    semanticMappings: [...baseline.semanticMappings,
      { mappingKey: "GOODS_PURCHASES", accountCode: "601" },
      { mappingKey: "GOODS_STOCK_VARIATION", accountCode: "6031" },
    ],
    financialStatementMappings: baseline.financialStatementMappings.map(mapping =>
      mapping.statementType === "INCOME_STATEMENT" && mapping.lineCode === "IS_PURCHASES"
        ? { ...mapping, accountCodes: [...mapping.accountCodes, "6031"] } : mapping),
  };
}

type CandidateEvent = "RECEIPT" | "SUPPLIER_INVOICE" | "ISSUE" | "CUSTOMER_RETURN" | "SUPPLIER_RETURN" | "SUPPLIER_CREDIT";
type CandidateInput = {
  event: CandidateEvent;
  merchandiseClass: "MERCHANDISE";
  valuationMethod: "WEIGHTED_AVERAGE";
  currencyCode: string;
  amount: string;
  /** Returns require an independently verified origin under the same draft. */
  originPolicyReference?: string;
};
const ExactAmount = Prisma.Decimal.clone({ precision: 48 });

/** Illustrative balanced lifecycle, not an executable posting builder.
 * Only equal acquisition/invoice cost, single currency and no tax/freight
 * differences are modeled. Historical/other-class returns fail closed. */
export function previewMerchandisePolicyLines(input: CandidateInput): PostingLineDraft[] {
  if (input.merchandiseClass !== "MERCHANDISE" || input.valuationMethod !== "WEIGHTED_AVERAGE" || !/^[A-Z]{3}$/.test(input.currencyCode)) {
    throw new Error("SYSCOHADA_DRAFT_SCOPE_UNSUPPORTED");
  }
  if (!/^\d+(?:\.\d{1,6})?$/.test(input.amount)) throw new Error("SYSCOHADA_DRAFT_AMOUNT_INVALID");
  const amount = new ExactAmount(input.amount);
  if (!amount.isFinite() || !amount.gt(0) || amount.gte("1000000000000000")) throw new Error("SYSCOHADA_DRAFT_AMOUNT_INVALID");
  const value = amount.toFixed();
  const pair = (debit: string, credit: string): PostingLineDraft[] => [
    { accountMappingKey: debit, description: "Merchandise policy simulation", debit: value, transactionCurrencyCode: input.currencyCode, transactionAmount: value },
    { accountMappingKey: credit, description: "Merchandise policy simulation", credit: value, transactionCurrencyCode: input.currencyCode, transactionAmount: value },
  ];
  if (["CUSTOMER_RETURN", "SUPPLIER_RETURN", "SUPPLIER_CREDIT"].includes(input.event) &&
      input.originPolicyReference !== SYSCOHADA_MERCHANDISE_DRAFT_REFERENCE) {
    throw new Error("SYSCOHADA_DRAFT_ORIGIN_POLICY_REQUIRED");
  }
  switch (input.event) {
    case "RECEIPT": return [...pair("GOODS_INVENTORY", "GOODS_STOCK_VARIATION"), ...pair("GOODS_PURCHASES", "GOODS_RECEIVED_CLEARING")];
    case "SUPPLIER_INVOICE": return pair("GOODS_RECEIVED_CLEARING", "ACCOUNTS_PAYABLE");
    case "ISSUE": return pair("GOODS_STOCK_VARIATION", "GOODS_INVENTORY");
    case "CUSTOMER_RETURN": return pair("GOODS_INVENTORY", "GOODS_STOCK_VARIATION");
    case "SUPPLIER_RETURN": return [...pair("GOODS_STOCK_VARIATION", "GOODS_INVENTORY"), ...pair("GOODS_RECEIVED_CLEARING", "GOODS_PURCHASES")];
    case "SUPPLIER_CREDIT": return pair("ACCOUNTS_PAYABLE", "GOODS_RECEIVED_CLEARING");
    default: throw new Error("SYSCOHADA_DRAFT_SCOPE_UNSUPPORTED");
  }
}
