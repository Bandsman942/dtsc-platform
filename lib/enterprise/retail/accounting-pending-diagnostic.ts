import { EnterpriseAccountingError } from "@/lib/enterprise/accounting/errors";
import type { RetailMutationMessageCode } from "@/lib/enterprise/retail/mutation-outcome";

export type RetailAccountingPendingDiagnostic = {
  errorCode: string;
  messageCode: RetailMutationMessageCode;
  actionHref: string;
};

const ACCOUNTING_SETUP_HREF = "/enterprise-modules/FINANCE_ACCOUNTING";
const EXCHANGE_RATE_HREF = "/enterprise-modules/FINANCE_TREASURY/exchange-rates";

function blockerMessageCode(blockers: unknown): RetailMutationMessageCode | null {
  if (!Array.isArray(blockers)) return null;
  const values = new Set(blockers.filter((value): value is string => typeof value === "string"));
  if (values.has("JOURNALS_REQUIRED")) return "RETAIL_ACCOUNTING_PENDING_JOURNAL";
  if (values.has("ORGANIZATION_MAPPINGS_REQUIRED") || values.has("TEMPLATE_SEMANTIC_COVERAGE_REQUIRED")) {
    return "RETAIL_ACCOUNTING_PENDING_MAPPING";
  }
  if (
    values.has("FUNCTIONAL_CURRENCY_REQUIRED")
    || values.has("CHART_REQUIRED")
    || values.has("ACTIVE_CHART_REQUIRED")
    || values.has("CHART_ACCOUNTS_REQUIRED")
    || values.has("TEMPLATE_LINEAGE_REQUIRED")
  ) {
    return "RETAIL_ACCOUNTING_PENDING_CONFIGURATION";
  }
  return null;
}

export function retailAccountingPendingDiagnostic(error: unknown): RetailAccountingPendingDiagnostic {
  const accountingError = error instanceof EnterpriseAccountingError ? error : null;
  const errorCode = accountingError?.code || "POSTING_FAILED";
  const configurationBlocker = accountingError?.code === "FINANCE_CONFIGURATION_NOT_READY"
    ? blockerMessageCode(accountingError.details?.blockers)
    : null;

  if (configurationBlocker) {
    return { errorCode, messageCode: configurationBlocker, actionHref: ACCOUNTING_SETUP_HREF };
  }

  switch (errorCode) {
    case "POSTING_JOURNAL_REQUIRED":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_JOURNAL", actionHref: ACCOUNTING_SETUP_HREF };
    case "FINANCE_PERIOD_NOT_FOUND":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_PERIOD_REQUIRED", actionHref: ACCOUNTING_SETUP_HREF };
    case "FINANCE_PERIOD_CLOSED":
    case "FINANCE_PERIOD_BLOCKS_DRAFT_MUTATION":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_PERIOD_CLOSED", actionHref: ACCOUNTING_SETUP_HREF };
    case "FINANCE_EXCHANGE_RATE_REQUIRED":
    case "FINANCE_EXCHANGE_RATE_INVALID":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_RATE", actionHref: EXCHANGE_RATE_HREF };
    case "POSTING_DIRECT_ACCOUNT_INVALID":
    case "POSTING_ACCOUNT_INACTIVE":
    case "POSTING_ACCOUNT_TYPE_INCOMPATIBLE":
    case "POSTING_ACCOUNT_SUBTYPE_INCOMPATIBLE":
    case "RETAIL_MOBILE_MONEY_FX_ACCOUNTS_INVALID":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_ACCOUNT", actionHref: ACCOUNTING_SETUP_HREF };
    case "POSTING_ACCOUNT_MAPPING_REQUIRED":
    case "POSTING_SEMANTIC_KEY_UNKNOWN":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_MAPPING", actionHref: ACCOUNTING_SETUP_HREF };
    case "FINANCE_CONFIGURATION_REQUIRED":
    case "FINANCE_CONFIGURATION_NOT_READY":
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_CONFIGURATION", actionHref: ACCOUNTING_SETUP_HREF };
    default:
      return { errorCode, messageCode: "RETAIL_ACCOUNTING_PENDING_UNKNOWN", actionHref: ACCOUNTING_SETUP_HREF };
  }
}

export function retailAccountingPendingDiagnosticFromCode(errorCode: string | null | undefined) {
  if (!errorCode) {
    return { errorCode: "POSTING_PENDING", messageCode: "RETAIL_ACCOUNTING_PENDING_UNKNOWN" as const, actionHref: ACCOUNTING_SETUP_HREF };
  }
  return retailAccountingPendingDiagnostic(new EnterpriseAccountingError(errorCode, 409));
}
