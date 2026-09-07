import { invalidateTenantReadCaches } from "@/lib/read-cache";

export const FINANCE_OVERVIEW_CACHE_NAMESPACE = "finance-overview";
export const FINANCE_OVERVIEW_CACHE_SCHEMA_VERSION = "v1";
export const FINANCE_OVERVIEW_CACHE_TTL_SECONDS = 15;

const FINANCE_OVERVIEW_EVENT_PREFIXES = [
  "SALES_INVOICE_",
  "SUPPLIER_INVOICE_",
  "PAYMENT_",
  "CASH_SESSION_",
  "RECONCILIATION_",
  "JOURNAL_ENTRY_",
  "FINANCIAL_CLOSE_",
  "ENTERPRISE_APPROVAL_",
  "ENTERPRISE_BUDGET_",
  "ENTERPRISE_EXPENSE_",
] as const;

export type FinanceOverviewDomainEvent = {
  organizationId: string;
  eventType: string;
};

export function financeOverviewEventInvalidatesCache(eventType: string) {
  return FINANCE_OVERVIEW_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
}

export async function invalidateFinanceOverviewReadCacheForEvents(events: FinanceOverviewDomainEvent[]) {
  const organizationIds = new Set(
    events
      .filter((event) => financeOverviewEventInvalidatesCache(event.eventType))
      .map((event) => event.organizationId),
  );

  return invalidateTenantReadCaches(
    [...organizationIds].map((organizationId) => ({
      namespace: FINANCE_OVERVIEW_CACHE_NAMESPACE,
      organizationId,
      schemaVersion: FINANCE_OVERVIEW_CACHE_SCHEMA_VERSION,
    })),
  );
}
