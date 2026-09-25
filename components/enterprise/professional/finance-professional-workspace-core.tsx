"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Eye, FilePlus2, FolderOpen, RefreshCcw } from "lucide-react";
import { ProfessionalWorkflowComments } from "@/components/enterprise/professional/professional-workflow-comments";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

export type FinancePagination = { page: number; pageSize: number; total: number; pageCount: number };
export type FinanceRecord = {
  id: string; status?: string; revision?: number; number?: string; reference?: string; code?: string; name?: string; title?: string; currencyCode?: string;
  amount?: string | number; unallocatedAmount?: string | number; grandTotal?: string | number; outstandingAmount?: string | number; originalAmount?: string | number; operationalBalance?: string | number;
  availableBalance?: string | number; openingAmount?: string | number; countedClosingAmount?: string | number | null; invoiceDate?: string; creditDate?: string; dueDate?: string | null; paymentDate?: string;
  transferDate?: string; statementDate?: string; openedAt?: string; createdAt?: string; updatedAt?: string; businessPartyId?: string | null; supplierId?: string | null;
  salesInvoiceId?: string; supplierInvoiceId?: string;
  [key: string]: unknown;
};

type FinanceCollectionPayload<T extends FinanceRecord> = { items: T[]; pagination: FinancePagination; metrics?: Record<string, number>; message?: string; error?: string };
export type FinanceLookupParty = { id: string; code?: string; legalName: string; displayName?: string | null; roles?: Array<{ roleCode: string }> };
export type FinanceLookupSupplier = { id: string; legalName: string; displayName?: string | null };
export type FinanceLookupMember = { id: string; label: string; email?: string; role?: string; positionTitle?: string | null };
export type FinanceLookupSite = { id: string; code: string; name: string };
export type FinanceLookupEmployee = { id: string; employeeNumber: string; displayName: string };
export type FinanceOperationalLookups = {
  parties: FinanceLookupParty[]; suppliers: FinanceLookupSupplier[]; members: FinanceLookupMember[]; sites: FinanceLookupSite[]; employees: FinanceLookupEmployee[];
  payrollPeriods: Array<{ id: string; code: string; name: string; status: string }>;
  projects: Array<{ id: string; reference: string; name: string; status: string }>;
  functionalCurrencyCode?: string | null;
  businessDate?: string;
};
export type FinanceAccountLookup = { id: string; code: string; name: string; accountType: string; currencyCode: string; maskedReference?: string | null; operationalBalance?: string | number; availableBalance?: string | number; status: string; revision: number };
export type LedgerAccountLookup = { id: string; code: string; nameFr: string; nameEn: string; accountType: string };
export type OpenBalanceLookup = { id: string; businessPartyId?: string | null; supplierId?: string | null; currencyCode: string; outstandingAmount: string | number; status: string; salesInvoice?: { number?: string } | null; supplierInvoice?: { number?: string } | null };
export type BankStatementLookup = { id: string; reference: string; currencyCode: string; statementDate: string; status: string; financialAccountId: string };

const EMPTY_LOOKUPS: FinanceOperationalLookups = { parties: [], suppliers: [], members: [], sites: [], employees: [], payrollPeriods: [], projects: [] };

function apiError(
  body: { error?: string; message?: string; details?: unknown } | null,
  fallbackCode = "FINANCE_OPERATION_FAILED",
  status = 500,
) {
  const code = body?.error || fallbackCode;
  const error = new Error(code) as Error & {
    code: string;
    clientMessage: string | null;
    details: unknown;
    status: number;
  };
  error.name = "FinanceApiError";
  error.code = code;
  error.clientMessage = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
  error.details = body?.details;
  error.status = status;
  return error;
}

export function useFinanceCollection<T extends FinanceRecord>({ endpoint, page, pageSize = 25, search, status, refreshKey }: { endpoint: string; page: number; pageSize?: number; search?: string; status?: string; refreshKey: number }) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<FinancePagination>({ page: 1, pageSize, total: 0, pageCount: 1 });
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search?.trim()) params.set("search", search.trim());
    if (status?.trim()) params.set("status", status.trim());
    return params.toString();
  }, [page, pageSize, search, status]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as FinanceCollectionPayload<T> | null;
      if (!response.ok || !body?.items || !body.pagination) throw apiError(body, "FINANCE_COLLECTION_READ_FAILED", response.status);
      setItems(body.items); setPagination(body.pagination); setMetrics(body.metrics || {});
    } catch (loadError) {
      setItems([]);
      setError(safeFinanceError(loadError));
    } finally { setLoading(false); }
  }, [endpoint, query]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return { items, pagination, metrics, loading, error, reload: load };
}

async function readCollection<T>(endpoint: string): Promise<T[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { items?: T[]; error?: string; message?: string; details?: unknown } | null;
  if (!response.ok || !body) throw apiError(body, "FINANCE_LOOKUP_READ_FAILED", response.status);
  return body.items || [];
}

export function useFinanceLookups(organizationId: string, moduleCode: string, refreshKey: number) {
  const [lookups, setLookups] = useState<FinanceOperationalLookups>(EMPTY_LOOKUPS);
  const [accounts, setAccounts] = useState<FinanceAccountLookup[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountLookup[]>([]);
  const [receivables, setReceivables] = useState<OpenBalanceLookup[]>([]);
  const [payables, setPayables] = useState<OpenBalanceLookup[]>([]);
  const [payments, setPayments] = useState<FinanceRecord[]>([]);
  const [bankStatements, setBankStatements] = useState<BankStatementLookup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true; setError("");
    const operational = fetch(`/api/enterprise/${organizationId}/operational-lookups?module=${encodeURIComponent(moduleCode)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as FinanceOperationalLookups & { error?: string; message?: string; details?: unknown } | null;
      if (!response.ok || !body) throw apiError(body, "FINANCE_LOOKUP_READ_FAILED", response.status);
      return body;
    });
    const work: Array<Promise<unknown>> = [operational, readCollection<FinanceAccountLookup>(`/api/enterprise/${organizationId}/financial-accounts?page=1&pageSize=200&status=ACTIVE`)];
    work.push(moduleCode === "FINANCE_TREASURY" ? readCollection<LedgerAccountLookup>(`/api/enterprise/${organizationId}/ledger-accounts?page=1&pageSize=500&status=ACTIVE`) : Promise.resolve([]));
    if (moduleCode === "FINANCE_PAYMENTS") {
      work.push(readCollection<OpenBalanceLookup>(`/api/enterprise/${organizationId}/receivables?page=1&pageSize=500&status=OPEN`));
      work.push(readCollection<OpenBalanceLookup>(`/api/enterprise/${organizationId}/payables?page=1&pageSize=500&status=OPEN`));
    } else work.push(Promise.resolve([]), Promise.resolve([]));
    if (moduleCode === "FINANCE_RECONCILIATION") {
      work.push(readCollection<FinanceRecord>(`/api/enterprise/${organizationId}/payments?page=1&pageSize=500&status=CONFIRMED`));
      work.push(readCollection<BankStatementLookup>(`/api/enterprise/${organizationId}/bank-statements?page=1&pageSize=200`));
    } else work.push(Promise.resolve([]), Promise.resolve([]));

    void Promise.all(work).then(([operationalBody, accountItems, ledgerItems, receivableItems, payableItems, paymentItems, statementItems]) => {
      if (!active) return;
      setLookups(operationalBody as FinanceOperationalLookups); setAccounts(accountItems as FinanceAccountLookup[]); setLedgerAccounts(ledgerItems as LedgerAccountLookup[]);
      setReceivables(receivableItems as OpenBalanceLookup[]); setPayables(payableItems as OpenBalanceLookup[]); setPayments(paymentItems as FinanceRecord[]); setBankStatements(statementItems as BankStatementLookup[]);
    }).catch((lookupError) => { if (active) setError(safeFinanceError(lookupError)); });
    return () => { active = false; };
  }, [moduleCode, organizationId, refreshKey]);
  return { lookups, accounts, ledgerAccounts, receivables, payables, payments, bankStatements, error };
}

export async function financeMutation(endpoint: string, payload: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => null) as { error?: string; [key: string]: unknown } | null;
  if (!response.ok) throw apiError(body);
  return body || {};
}

export function financeRecordTitle(item: FinanceRecord, locale: FinanceLocale) {
  return String(item.number || item.reference || item.code || item.name || item.title || (locale === "fr" ? "Opération financière" : "Financial operation"));
}
export function financeRecordAmount(item: FinanceRecord, locale: FinanceLocale) {
  const value = item.outstandingAmount ?? item.unallocatedAmount ?? item.grandTotal ?? item.amount ?? item.operationalBalance ?? item.availableBalance ?? item.openingAmount;
  if (value === undefined || value === null) return null;
  return financeMoney(value, String(item.currencyCode || "USD"), locale);
}
export function financeRecordDate(item: FinanceRecord, locale: FinanceLocale) { return financeDate(item.invoiceDate || item.creditDate || item.dueDate || item.paymentDate || item.transferDate || item.statementDate || item.openedAt || item.createdAt || item.updatedAt, locale); }
export function financeRecordDescription(item: FinanceRecord, locale: FinanceLocale) {
  const parts: string[] = [];
  const direction = typeof item.direction === "string" ? financeEnumLabel(item.direction, locale) : "";
  const paymentType = typeof item.paymentType === "string" ? financeEnumLabel(item.paymentType, locale) : "";
  const accountType = typeof item.accountType === "string" ? financeEnumLabel(item.accountType, locale) : "";
  const financialAccount = item.financialAccount as { code?: string; name?: string } | undefined;
  const source = item.sourceFinancialAccount as { code?: string; name?: string } | undefined;
  const target = item.targetFinancialAccount as { code?: string; name?: string } | undefined;
  if (direction) parts.push(direction); if (paymentType) parts.push(paymentType); if (accountType) parts.push(accountType);
  if (financialAccount?.name) parts.push(`${financialAccount.code || ""} ${financialAccount.name}`.trim());
  if (source?.name && target?.name) parts.push(`${source.name} → ${target.name}`);
  if (item.maskedReference) parts.push(String(item.maskedReference));
  if (item.reference && item.number) parts.push(String(item.reference));
  return parts.join(" · ") || (locale === "fr" ? "Ouvrir pour consulter les détails métier." : "Open to view business details.");
}

export function FinanceRecordList<T extends FinanceRecord>({ items, locale, emptyTitle, emptyDescription, onOpen, actions }: { items: T[]; locale: FinanceLocale; emptyTitle: string; emptyDescription: string; onOpen: (item: T) => void; actions?: (item: T) => ReactNode }) {
  if (!items.length) return <EmptyState compact title={emptyTitle} description={emptyDescription} />;
  return <BusinessList ariaLabel={emptyTitle}>{items.map((item) => <BusinessListItem key={item.id} title={financeRecordTitle(item, locale)} meta={`${financeRecordDate(item, locale)}${financeRecordAmount(item, locale) ? ` · ${financeRecordAmount(item, locale)}` : ""}`} description={financeRecordDescription(item, locale)} status={item.status ? <StatusBadge tone={financeStatusTone(item.status)}>{financeStatusLabel(item.status, locale)}</StatusBadge> : undefined} onOpen={() => onOpen(item)} openLabel={`${locale === "fr" ? "Ouvrir" : "Open"} ${financeRecordTitle(item, locale)}`} actions={actions ? actions(item) : <Button size="sm" variant="outline" onClick={() => onOpen(item)}><Eye className="h-4 w-4" />{locale === "fr" ? "Détail" : "Details"}</Button>} />)}</BusinessList>;
}

export function FinancePaginationControls({ pagination, page, onPage, locale }: { pagination: FinancePagination; page: number; onPage: (page: number) => void; locale: FinanceLocale }) {
  const countLabel = locale === "fr" ? "élément(s)" : "item(s)";
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{pagination.total} {countLabel} · {locale === "fr" ? "Page" : "Page"} {pagination.page}/{pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>{locale === "fr" ? "Précédent" : "Previous"}</Button><Button variant="outline" disabled={page >= pagination.pageCount} onClick={() => onPage(Math.min(pagination.pageCount, page + 1))}>{locale === "fr" ? "Suivant" : "Next"}</Button></div></div>;
}

export function FinanceDetailGrid({ children }: { children: ReactNode }) { return <dl className="grid gap-3 rounded-xl border-y border-dtsc-border py-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>; }
export function FinanceDetailValue({ label, children, value }: { label: string; children?: ReactNode; value?: ReactNode }) { return <div className="min-w-0"><dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-dtsc-ink">{children ?? value ?? "—"}</dd></div>; }

const ENTITY_TYPE_BY_MODULE: Record<string, string> = { FINANCE_PAYMENTS: "EnterprisePayment", FINANCE_TREASURY: "EnterpriseFinancialAccount", FINANCE_CASH: "EnterpriseCashSession", FINANCE_BANK: "EnterpriseBankStatement", FINANCE_RECONCILIATION: "EnterpriseReconciliationSession" };

export function financeCollaborationEntityType(moduleCode: string, record: FinanceRecord) {
  if (moduleCode === "FINANCE_RECEIVABLES") {
    if (record.creditDate && record.salesInvoiceId) return "EnterpriseSalesCreditNote";
    if (record.originalAmount !== undefined && record.salesInvoiceId) return "EnterpriseReceivable";
    return "EnterpriseSalesInvoice";
  }
  if (moduleCode === "FINANCE_PAYABLES") {
    if (record.creditDate && record.supplierInvoiceId) return "EnterpriseSupplierCreditNote";
    if (record.originalAmount !== undefined && record.supplierInvoiceId) return "EnterprisePayable";
    return "EnterpriseSupplierInvoice";
  }
  return ENTITY_TYPE_BY_MODULE[moduleCode] || null;
}

export function FinanceCollaboration({ organizationId, moduleCode, record, locale }: { organizationId: string; moduleCode: string; record: FinanceRecord; locale: FinanceLocale }) {
  const entityType = financeCollaborationEntityType(moduleCode, record);
  if (!entityType) return null;
  const sourceReference = financeRecordTitle(record, locale);
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
  const documentQuery = `sourceEntityType=${encodeURIComponent(entityType)}&sourceEntityId=${encodeURIComponent(record.id)}&sourceReference=${encodeURIComponent(sourceReference)}`;
  const documentsHref = `/enterprise-modules/DOCUMENTS?${documentQuery}`;
  const uploadHref = `${documentsHref}&action=upload`;

  return (
    <section className="grid min-w-0 gap-3 border-t border-dtsc-border pt-5" aria-label={t("financeCollaborationTitle")}>
      <div className="min-w-0">
        <h3 className="text-base font-black text-dtsc-ink sm:text-lg">{t("financeCollaborationTitle")}</h3>
      </div>

      <details className="group min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
        <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 rounded-2xl p-4 transition-colors hover:bg-dtsc-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue/40 [&::-webkit-details-marker]:hidden">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dtsc-blue/10 text-dtsc-blue">
            <FolderOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-dtsc-ink">{t("financialDocuments")}</span>
            <span className="mt-1 block text-sm leading-6 text-dtsc-muted">{t("financialDocumentsDescription")}</span>
          </span>
          <ChevronDown className="mt-2 h-5 w-5 shrink-0 text-dtsc-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-dtsc-border px-3 pb-4 pt-3 sm:px-4">
          <div className="mb-3 inline-flex min-h-8 items-center rounded-full bg-dtsc-soft px-3 text-xs font-black text-dtsc-muted">
            {t("financialDocumentsPrivacy")}
          </div>
          <div data-responsive-actions>
            <Link className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-dtsc-border px-4 py-2 text-center text-sm font-black text-dtsc-blue transition-colors hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue/40" href={documentsHref}>
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="break-words">{t("viewLinkedDocuments")}</span>
            </Link>
            <Link className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-dtsc-blue px-4 py-2 text-center text-sm font-black text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue/40" href={uploadHref}>
              <FilePlus2 className="h-4 w-4 shrink-0" />
              <span className="break-words">{t("addLinkedDocument")}</span>
            </Link>
          </div>
        </div>
      </details>

      <ProfessionalWorkflowComments
        endpoint={`/api/enterprise/${organizationId}/finance-comments/${encodeURIComponent(entityType)}/${encodeURIComponent(record.id)}`}
        title={t("financeConversation")}
        description={t("financeConversationDescription")}
        collapsible
        defaultOpen={false}
      />
    </section>
  );
}

export function ReloadButton({ onClick, locale, loading }: { onClick: () => void; locale: FinanceLocale; loading?: boolean }) {
  return <Button variant="outline" onClick={onClick} disabled={loading}><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{locale === "fr" ? "Actualiser" : "Refresh"}</Button>;
}