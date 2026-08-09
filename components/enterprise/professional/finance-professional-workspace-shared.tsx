"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, FileUp, RefreshCcw } from "lucide-react";
import { ProfessionalWorkflowComments } from "@/components/enterprise/professional/professional-workflow-comments";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import { financeDate, financeEnumLabel, financeMoney, financeStatusLabel, financeStatusTone, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";

export type FinancePagination = { page: number; pageSize: number; total: number; pageCount: number };
export type FinanceRecord = {
  id: string; status?: string; revision?: number; number?: string; reference?: string; code?: string; name?: string; title?: string; currencyCode?: string;
  amount?: string | number; unallocatedAmount?: string | number; grandTotal?: string | number; outstandingAmount?: string | number; operationalBalance?: string | number;
  availableBalance?: string | number; openingAmount?: string | number; countedClosingAmount?: string | number | null; invoiceDate?: string; paymentDate?: string;
  transferDate?: string; statementDate?: string; openedAt?: string; createdAt?: string; updatedAt?: string; businessPartyId?: string | null; supplierId?: string | null;
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
};
export type FinanceAccountLookup = { id: string; code: string; name: string; accountType: string; currencyCode: string; maskedReference?: string | null; operationalBalance?: string | number; availableBalance?: string | number; status: string; revision: number };
export type LedgerAccountLookup = { id: string; code: string; nameFr: string; nameEn: string; accountType: string };
export type OpenBalanceLookup = { id: string; businessPartyId?: string | null; supplierId?: string | null; currencyCode: string; outstandingAmount: string | number; status: string; salesInvoice?: { number?: string } | null; supplierInvoice?: { number?: string } | null };
export type BankStatementLookup = { id: string; reference: string; currencyCode: string; statementDate: string; status: string; financialAccountId: string };

const EMPTY_LOOKUPS: FinanceOperationalLookups = { parties: [], suppliers: [], members: [], sites: [], employees: [], payrollPeriods: [], projects: [] };

function apiError(body: { error?: string } | null, fallbackCode = "FINANCE_OPERATION_FAILED") {
  return new Error(body?.error || fallbackCode);
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
      if (!response.ok || !body?.items || !body.pagination) throw apiError(body, "FINANCE_COLLECTION_READ_FAILED");
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
  const body = await response.json().catch(() => null) as { items?: T[]; error?: string } | null;
  if (!response.ok || !body) throw apiError(body, "FINANCE_LOOKUP_READ_FAILED");
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
      const body = await response.json().catch(() => null) as FinanceOperationalLookups & { error?: string } | null;
      if (!response.ok || !body) throw apiError(body, "FINANCE_LOOKUP_READ_FAILED");
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
export function financeRecordDate(item: FinanceRecord, locale: FinanceLocale) { return financeDate(item.invoiceDate || item.paymentDate || item.transferDate || item.statementDate || item.openedAt || item.createdAt || item.updatedAt, locale); }
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
export function FinanceDetailValue({ label, children }: { label: string; children: ReactNode }) { return <div className="min-w-0"><dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-dtsc-ink">{children}</dd></div>; }

const ENTITY_TYPE_BY_MODULE: Record<string, string> = { FINANCE_RECEIVABLES: "EnterpriseSalesInvoice", FINANCE_PAYABLES: "EnterpriseSupplierInvoice", FINANCE_PAYMENTS: "EnterprisePayment", FINANCE_TREASURY: "EnterpriseFinancialAccount", FINANCE_CASH: "EnterpriseCashSession", FINANCE_BANK: "EnterpriseBankStatement", FINANCE_RECONCILIATION: "EnterpriseReconciliationSession" };

export function FinanceCollaboration({ organizationId, moduleCode, record, locale }: { organizationId: string; moduleCode: string; record: FinanceRecord; locale: FinanceLocale }) {
  const entityType = ENTITY_TYPE_BY_MODULE[moduleCode];
  if (!entityType) return null;
  const sourceReference = financeRecordTitle(record, locale);
  return <><section className="border-t border-dtsc-border pt-5"><h3 className="font-black text-dtsc-ink">{locale === "fr" ? "Documents financiers" : "Financial documents"}</h3><p className="mt-1 text-sm leading-6 text-dtsc-muted">{locale === "fr" ? "Les justificatifs sont téléversés dans le stockage privé commun, versionnés et liés à cette opération." : "Supporting documents are uploaded to shared private storage, versioned and linked to this operation."}</p><Link className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue" href={`/enterprise-modules/DOCUMENTS?sourceEntityType=${encodeURIComponent(entityType)}&sourceEntityId=${encodeURIComponent(record.id)}&sourceReference=${encodeURIComponent(sourceReference)}&action=upload`}><FileUp className="h-4 w-4" />{locale === "fr" ? "Téléverser ou ouvrir les documents liés" : "Upload or open linked documents"}</Link></section><ProfessionalWorkflowComments endpoint={`/api/enterprise/${organizationId}/finance-comments/${encodeURIComponent(entityType)}/${encodeURIComponent(record.id)}`} title={locale === "fr" ? "Commentaires financiers" : "Finance comments"} description={locale === "fr" ? "Les décisions structurées restent dans le workflow ; ce fil sert aux précisions, demandes de correction et justifications." : "Structured decisions remain in the workflow; this thread is for clarifications, correction requests and explanations."} /></>;
}

export function ReloadButton({ onClick, locale, loading }: { onClick: () => void; locale: FinanceLocale; loading?: boolean }) {
  return <Button variant="outline" onClick={onClick} disabled={loading}><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{locale === "fr" ? "Actualiser" : "Refresh"}</Button>;
}