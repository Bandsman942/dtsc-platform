"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

type ModuleCode = "FINANCE_ACCOUNTING" | "FINANCE_TAX" | "FINANCE_CLOSE" | "FINANCE_STATEMENTS" | "FINANCE_ASSETS";
export type AccountingReferenceKind =
  | "chart"
  | "fiscal-year"
  | "fiscal-period"
  | "journal"
  | "ledger-account"
  | "business-party"
  | "project"
  | "department"
  | "site"
  | "inventory-item"
  | "asset"
  | "currency";

export type FinanceAccountingReferenceOption = {
  id: string;
  label: string;
  code?: string | null;
  status?: string | null;
  currency?: string | null;
  amount?: string | number | null;
  accountType?: string | null;
  chartId?: string | null;
};

type ApiBody = { items?: unknown[] };

function mapOptions(kind: AccountingReferenceKind, items: unknown[], locale?: string | null): FinanceAccountingReferenceOption[] {
  const en = locale === "en";
  if (kind === "chart") return (items as Array<{ id: string; code: string; nameFr: string; nameEn: string; status: string }>).map((item) => ({ id: item.id, code: item.code, status: item.status, label: `${item.code} · ${en ? item.nameEn : item.nameFr}` }));
  if (kind === "fiscal-year") return (items as Array<{ id: string; code: string; status: string }>).map((item) => ({ id: item.id, code: item.code, status: item.status, label: `${item.code} · ${item.status}` }));
  if (kind === "fiscal-period") return (items as Array<{ id: string; code: string; status: string; fiscalYear?: { code?: string | null } }>).map((item) => ({ id: item.id, code: item.code, status: item.status, label: `${item.fiscalYear?.code ? `${item.fiscalYear.code} · ` : ""}${item.code} · ${item.status}` }));
  if (kind === "journal") return (items as Array<{ id: string; code: string; nameFr: string; nameEn: string; journalType: string }>).map((item) => ({ id: item.id, code: item.code, label: `${item.code} · ${en ? item.nameEn : item.nameFr} · ${item.journalType}` }));
  if (kind === "ledger-account") return (items as Array<{ id: string; code: string; nameFr: string; nameEn: string; accountType: string; currencyCode?: string | null; chartId?: string | null }>).map((item) => ({ id: item.id, code: item.code, accountType: item.accountType, chartId: item.chartId, currency: item.currencyCode, label: `${item.code} · ${en ? item.nameEn : item.nameFr}${item.currencyCode ? ` · ${item.currencyCode}` : ""}` }));
  if (kind === "business-party") return (items as Array<{ id: string; code: string; legalName: string; displayName?: string | null }>).map((item) => ({ id: item.id, code: item.code, label: `${item.code} · ${item.displayName || item.legalName}` }));
  if (kind === "project") return (items as Array<{ id: string; reference: string; name: string; status: string }>).map((item) => ({ id: item.id, code: item.reference, status: item.status, label: `${item.reference} · ${item.name}` }));
  if (kind === "department") return (items as Array<{ id: string; departmentCode: string; labelFr: string; labelEn: string }>).map((item) => ({ id: item.id, code: item.departmentCode, label: `${item.departmentCode} · ${en ? item.labelEn : item.labelFr}` }));
  if (kind === "site") return (items as Array<{ id: string; code: string; name: string; city?: string | null }>).map((item) => ({ id: item.id, code: item.code, label: `${item.code} · ${item.name}${item.city ? ` · ${item.city}` : ""}` }));
  if (kind === "inventory-item") return (items as Array<{ id: string; catalogItem: { code: string; sku?: string | null; name: string } }>).map((item) => ({ id: item.id, code: item.catalogItem.code, label: `${item.catalogItem.code}${item.catalogItem.sku ? ` · ${item.catalogItem.sku}` : ""} · ${item.catalogItem.name}` }));
  if (kind === "asset") return (items as Array<{ id: string; code: string; name: string; serialNumber?: string | null; currency?: string | null; indicativeValue?: string | number | null }>).map((item) => ({ id: item.id, code: item.code, currency: item.currency, amount: item.indicativeValue, label: `${item.code} · ${item.name}${item.serialNumber ? ` · ${item.serialNumber}` : ""}${item.currency ? ` · ${item.currency}` : ""}` }));
  return (items as Array<{ id: string; code: string; name: string }>).map((item) => ({ id: item.code, code: item.code, currency: item.code, label: `${item.code} · ${item.name}` }));
}

export function FinanceAccountingReferenceSelect({
  organizationId,
  moduleCode,
  kind,
  name,
  label,
  locale,
  required = false,
  disabled = false,
  parentId,
  status,
  accountType,
  directPosting = false,
  emptyLabel,
  onOptionChange,
  compact = false,
}: {
  organizationId: string;
  moduleCode: ModuleCode;
  kind: AccountingReferenceKind;
  name: string;
  label: string;
  locale?: string | null;
  required?: boolean;
  disabled?: boolean;
  parentId?: string;
  status?: string;
  accountType?: string;
  directPosting?: boolean;
  emptyLabel?: string;
  onOptionChange?: (option: FinanceAccountingReferenceOption | null) => void;
  compact?: boolean;
}) {
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<FinanceAccountingReferenceOption[]>([]);
  const [selected, setSelected] = useState<FinanceAccountingReferenceOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSelected(null); }, [accountType, directPosting, kind, moduleCode, parentId, status]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true); setFailed(false);
      try {
        const query = new URLSearchParams({ module: moduleCode, kind });
        if (search.trim()) query.set("search", search.trim());
        if (parentId?.trim()) query.set("parentId", parentId.trim());
        if (status?.trim()) query.set("status", status.trim());
        if (accountType?.trim()) query.set("accountType", accountType.trim());
        if (directPosting) query.set("directPosting", "true");
        const response = await fetch(`/api/enterprise/${organizationId}/accounting-reference-options?${query.toString()}`, { cache: "no-store" });
        const body = await response.json().catch(() => null) as ApiBody | null;
        if (!response.ok || !body) throw new Error("ACCOUNTING_REFERENCE_LOOKUP_FAILED");
        if (!cancelled) setItems(mapOptions(kind, body.items || [], locale));
      } catch {
        if (!cancelled) { setItems([]); setFailed(true); }
      } finally { if (!cancelled) setLoading(false); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [accountType, directPosting, kind, locale, moduleCode, organizationId, parentId, search, status]);

  const options = useMemo(() => !selected || items.some((item) => item.id === selected.id) ? items : [selected, ...items], [items, selected]);
  const selectClass = compact
    ? "h-9 w-full min-w-[10rem] max-w-full truncate rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-xs text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
    : "h-11 w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 md:text-sm";

  return <div className={compact ? "grid min-w-0 gap-1" : "grid min-w-0 gap-2"}>
    <Input
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      disabled={disabled}
      aria-label={en ? `Search ${label}` : `Rechercher ${label}`}
      placeholder={en ? `Search ${label.toLowerCase()}…` : `Rechercher ${label.toLowerCase()}…`}
      className={compact ? "h-8 min-w-[10rem] px-2 text-xs" : undefined}
    />
    <select name={name} value={selected?.id || ""} required={required} disabled={disabled || loading} onChange={(event) => { const next = options.find((item) => item.id === event.target.value) || null; setSelected(next); onOptionChange?.(next); }} className={selectClass}>
      <option value="">{loading ? (en ? "Loading…" : "Chargement…") : emptyLabel || (en ? "Select…" : "Sélectionner…")}</option>
      {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {failed ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{en ? "Reference search is temporarily unavailable." : "La recherche de références est momentanément indisponible."}</p> : null}
  </div>;
}
