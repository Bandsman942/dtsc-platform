"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

type ReferenceKind =
  | "budget-line"
  | "supplier"
  | "purchase"
  | "document"
  | "customer"
  | "sales-order"
  | "fulfillment"
  | "contract"
  | "purchase-receipt"
  | "project"
  | "expense"
  | "asset"
  | "catalog-item"
  | "financial-account"
  | "payroll-run"
  | "employee"
  | "expense-account"
  | "ledger-account"
  | "member"
  | "site"
  | "currency"
  | "bank-statement"
  | "reconciliation-payment"
  | "treasury-transaction"
  | "journal-entry";

type OperationalFinanceModuleCode =
  | "FINANCE_RECEIVABLES"
  | "FINANCE_PAYABLES"
  | "FINANCE_PAYMENTS"
  | "FINANCE_TREASURY"
  | "FINANCE_CASH"
  | "FINANCE_BANK"
  | "FINANCE_RECONCILIATION";

export type FinanceReferenceOption = {
  id: string;
  label: string;
  supplierId?: string | null;
  businessPartyId?: string | null;
  salesOrderId?: string | null;
  purchaseId?: string | null;
  budgetLineId?: string | null;
  financialAccountId?: string | null;
  currency?: string | null;
  amount?: string | number | null;
};

type ApiBody = { items?: unknown[] };

const OPERATIONAL_KINDS = new Set<ReferenceKind>([
  "customer", "supplier", "sales-order", "fulfillment", "contract", "purchase", "purchase-receipt", "project", "expense", "asset", "catalog-item", "financial-account", "payroll-run", "employee", "expense-account",
]);
const TREASURY_MODULES = new Set<OperationalFinanceModuleCode>(["FINANCE_TREASURY", "FINANCE_CASH", "FINANCE_BANK", "FINANCE_RECONCILIATION"]);
const TREASURY_KINDS = new Set<ReferenceKind>(["financial-account", "ledger-account", "member", "site", "currency", "bank-statement", "reconciliation-payment", "treasury-transaction", "journal-entry"]);

function endpointFor(
  organizationId: string,
  kind: ReferenceKind,
  search: string,
  moduleCode?: OperationalFinanceModuleCode,
  parentId?: string,
) {
  if (moduleCode && TREASURY_MODULES.has(moduleCode) && TREASURY_KINDS.has(kind)) {
    const query = new URLSearchParams({ module: moduleCode, kind });
    if (search.trim()) query.set("search", search.trim());
    if (parentId?.trim()) query.set("parentId", parentId.trim());
    return `/api/enterprise/${organizationId}/treasury-lookups?${query.toString()}`;
  }
  if (moduleCode && OPERATIONAL_KINDS.has(kind)) {
    const query = new URLSearchParams({ module: moduleCode, kind });
    if (search.trim()) query.set("search", search.trim());
    if (parentId?.trim()) query.set("parentId", parentId.trim());
    return `/api/enterprise/${organizationId}/finance/reference-options?${query.toString()}`;
  }

  const query = new URLSearchParams({ page: "1", pageSize: "30" });
  if (search.trim()) query.set("search", search.trim());
  if (kind === "budget-line") {
    query.set("status", "ACTIVE");
    return `/api/enterprise/${organizationId}/budget-lines?${query.toString()}`;
  }
  if (kind === "supplier") {
    query.set("status", "ACTIVE");
    return `/api/enterprise/${organizationId}/suppliers?${query.toString()}`;
  }
  if (kind === "purchase") return `/api/enterprise/${organizationId}/purchases?${query.toString()}`;
  query.set("status", "ACTIVE");
  return `/api/enterprise/${organizationId}/documents?${query.toString()}`;
}

function mapOptions(kind: ReferenceKind, items: unknown[], locale?: string | null): FinanceReferenceOption[] {
  const en = locale === "en";
  if (kind === "budget-line") return (items as Array<{ id: string; name: string; code?: string | null; budget: { reference: string; title?: string; currency: string } }>).map((item) => ({ id: item.id, label: `${item.budget.reference} · ${item.code ? `${item.code} · ` : ""}${item.name} · ${item.budget.currency}`, currency: item.budget.currency }));
  if (kind === "supplier") return (items as Array<{ id: string; legalName: string; displayName?: string | null; businessPartyId?: string | null }>).map((item) => ({ id: item.id, label: item.displayName || item.legalName, businessPartyId: item.businessPartyId }));
  if (kind === "purchase") return (items as Array<{ id: string; reference: string; title: string; status: string; supplierId?: string | null; budgetLineId?: string | null; currency?: string | null; totalAmount?: string | number | null }>).filter((item) => !["REJECTED", "CANCELLED"].includes(item.status)).map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}`, supplierId: item.supplierId, budgetLineId: item.budgetLineId, currency: item.currency, amount: item.totalAmount }));
  if (kind === "document") return (items as Array<{ id: string; title: string; documentType?: string }>).map((item) => ({ id: item.id, label: item.documentType ? `${item.title} · ${item.documentType}` : item.title }));
  if (kind === "customer") return (items as Array<{ id: string; code?: string | null; legalName: string; displayName?: string | null }>).map((item) => ({ id: item.id, label: `${item.code || ""} ${item.displayName || item.legalName}`.trim(), businessPartyId: item.id }));
  if (kind === "sales-order") return (items as Array<{ id: string; reference: string; title: string; businessPartyId: string; currency?: string | null; totalAmount?: string | number | null }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}`, businessPartyId: item.businessPartyId, currency: item.currency, amount: item.totalAmount }));
  if (kind === "fulfillment") return (items as Array<{ id: string; reference: string; salesOrderId: string }>).map((item) => ({ id: item.id, label: item.reference, salesOrderId: item.salesOrderId }));
  if (kind === "contract") return (items as Array<{ id: string; reference: string; title: string; businessPartyId?: string | null; currency?: string | null; indicativeAmount?: string | number | null }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}`, businessPartyId: item.businessPartyId, currency: item.currency, amount: item.indicativeAmount }));
  if (kind === "purchase-receipt") return (items as Array<{ id: string; reference: string; purchaseId: string }>).map((item) => ({ id: item.id, label: item.reference, purchaseId: item.purchaseId }));
  if (kind === "project") return (items as Array<{ id: string; reference: string; name: string }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.name}` }));
  if (kind === "expense") return (items as Array<{ id: string; reference: string; title: string; currency: string; amount: string | number; supplierId?: string | null; purchaseId?: string | null }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.title} · ${item.currency}`, currency: item.currency, amount: item.amount, supplierId: item.supplierId, purchaseId: item.purchaseId }));
  if (kind === "asset") return (items as Array<{ id: string; code: string; name: string; serialNumber?: string | null; currency?: string | null; indicativeValue?: string | number | null; supplierId?: string | null; purchaseId?: string | null }>).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}${item.serialNumber ? ` · ${item.serialNumber}` : ""}`, currency: item.currency, amount: item.indicativeValue, supplierId: item.supplierId, purchaseId: item.purchaseId }));
  if (kind === "catalog-item") return (items as Array<{ id: string; code: string; sku?: string | null; name: string; currency?: string | null; amount?: string | number | null }>).map((item) => ({ id: item.id, label: `${item.code}${item.sku ? ` · ${item.sku}` : ""} · ${item.name}`, currency: item.currency, amount: item.amount }));
  if (kind === "financial-account") return (items as Array<{ id: string; code: string; name: string; accountType: string; currencyCode: string; maskedReference?: string | null }>).map((item) => ({ id: item.id, label: `${item.code} · ${item.name} · ${item.currencyCode}${item.maskedReference ? ` · ${item.maskedReference}` : ""}`, currency: item.currencyCode }));
  if (kind === "payroll-run") return (items as Array<{ id: string; reference: string; currency: string; netAmount: string | number; payrollPeriod: { code: string; name: string } }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.payrollPeriod.code} · ${item.payrollPeriod.name} · ${item.currency}`, currency: item.currency, amount: item.netAmount }));
  if (kind === "employee") return (items as Array<{ id: string; employeeNumber: string; displayName: string }>).map((item) => ({ id: item.id, label: `${item.employeeNumber} · ${item.displayName}` }));
  if (kind === "expense-account") return (items as Array<{ id: string; code: string; nameFr: string; nameEn: string }>).map((item) => ({ id: item.id, label: `${item.code} · ${en ? item.nameEn : item.nameFr}` }));
  if (kind === "ledger-account") return (items as Array<{ id: string; code: string; nameFr: string; nameEn: string; currencyCode?: string | null }>).map((item) => ({ id: item.id, label: `${item.code} · ${en ? item.nameEn : item.nameFr}${item.currencyCode ? ` · ${item.currencyCode}` : ""}`, currency: item.currencyCode }));
  if (kind === "member") return (items as Array<{ id: string; label: string; email?: string; positionTitle?: string | null }>).map((item) => ({ id: item.id, label: `${item.label}${item.positionTitle ? ` · ${item.positionTitle}` : ""}` }));
  if (kind === "site") return (items as Array<{ id: string; code: string; name: string }>).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  if (kind === "currency") return (items as Array<{ id: string; code: string; name: string }>).map((item) => ({ id: item.code, label: `${item.code} · ${item.name}`, currency: item.code }));
  if (kind === "bank-statement") return (items as Array<{ id: string; reference: string; currencyCode: string; financialAccountId: string; statementDate: string }>).map((item) => ({ id: item.id, label: `${item.reference} · ${item.currencyCode} · ${new Date(item.statementDate).toLocaleDateString(en ? "en" : "fr")}`, currency: item.currencyCode, financialAccountId: item.financialAccountId }));
  if (kind === "reconciliation-payment") return (items as Array<{ id: string; number: string; paymentType: string; direction: string; currencyCode: string; amount: string | number; externalReference?: string | null }>).map((item) => ({ id: item.id, label: `${item.number} · ${item.paymentType} · ${item.currencyCode} ${item.amount}${item.externalReference ? ` · ${item.externalReference}` : ""}`, currency: item.currencyCode, amount: item.amount }));
  if (kind === "treasury-transaction") return (items as Array<{ id: string; reference?: string | null; transactionType: string; direction: string; currencyCode: string; amount: string | number; transactionDate: string }>).map((item) => ({ id: item.id, label: `${item.reference || item.id} · ${item.transactionType} · ${item.currencyCode} ${item.amount} · ${new Date(item.transactionDate).toLocaleDateString(en ? "en" : "fr")}`, currency: item.currencyCode, amount: item.amount }));
  if (kind === "journal-entry") return (items as Array<{ id: string; number: string; reference?: string | null; description: string; accountingDate: string; functionalCurrencyCode: string; totalDebit: string | number }>).map((item) => ({ id: item.id, label: `${item.number}${item.reference ? ` · ${item.reference}` : ""} · ${item.description} · ${item.functionalCurrencyCode} ${item.totalDebit}`, currency: item.functionalCurrencyCode, amount: item.totalDebit }));
  return [];
}

export function FinanceReferenceSelect({ organizationId, kind, name, label, locale, required = false, disabled = false, emptyLabel, moduleCode, parentId, onOptionChange }: {
  organizationId: string;
  kind: ReferenceKind;
  name: string;
  label: string;
  locale?: string | null;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  moduleCode?: OperationalFinanceModuleCode;
  parentId?: string;
  onOptionChange?: (option: FinanceReferenceOption | null) => void;
}) {
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<FinanceReferenceOption[]>([]);
  const [selected, setSelected] = useState<FinanceReferenceOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSelected(null); }, [kind, moduleCode, parentId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true); setFailed(false);
      try {
        const response = await fetch(endpointFor(organizationId, kind, search, moduleCode, parentId), { cache: "no-store" });
        const body = await response.json().catch(() => null) as ApiBody | null;
        if (!response.ok || !body) throw new Error("LOOKUP_FAILED");
        if (!cancelled) setItems(mapOptions(kind, body.items || [], locale));
      } catch {
        if (!cancelled) { setItems([]); setFailed(true); }
      } finally { if (!cancelled) setLoading(false); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [kind, locale, moduleCode, organizationId, parentId, search]);

  const options = useMemo(() => !selected || items.some((item) => item.id === selected.id) ? items : [selected, ...items], [items, selected]);

  return <div className="grid min-w-0 gap-2">
    <Input value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled} aria-label={en ? `Search ${label}` : `Rechercher ${label}`} placeholder={en ? `Search ${label.toLowerCase()}…` : `Rechercher ${label.toLowerCase()}…`} />
    <select name={name} value={selected?.id || ""} required={required} disabled={disabled || loading} onChange={(event) => { const next = options.find((item) => item.id === event.target.value) || null; setSelected(next); onOptionChange?.(next); }} className="h-11 w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 md:text-sm">
      <option value="">{loading ? (en ? "Loading…" : "Chargement…") : emptyLabel || (en ? "Select…" : "Sélectionner…")}</option>
      {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {failed ? <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{en ? "References are temporarily unavailable. Try another search." : "Les références sont temporairement indisponibles. Essayez une autre recherche."}</p> : null}
    {!loading && !failed && search.trim() && items.length === 0 ? <p className="text-xs text-dtsc-muted">{en ? "No matching reference." : "Aucune référence correspondante."}</p> : null}
  </div>;
}
