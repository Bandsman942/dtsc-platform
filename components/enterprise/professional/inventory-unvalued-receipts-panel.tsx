"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useEnterpriseBusinessContext } from "@/components/enterprise/use-enterprise-business-context";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { financeDate, safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { translateEnterpriseFinance, type EnterpriseFinanceKey } from "@/lib/i18n";

type Receipt = {
  id: string;
  inventoryItemName: string;
  inventoryItemCode: string | null;
  warehouseName: string;
  quantity: string;
  occurredAt: string;
};
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type Props = {
  organizationId: string;
  locale: FinanceLocale;
  canManage: boolean;
  onPosted: () => Promise<void> | void;
};

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: 25, total: 0, pageCount: 1 };

/** Controlled, human-verified valuation of EXISTING stock movements. This
 * never creates a second stock receipt or assumes a made-up acquisition cost. */
export function InventoryUnvaluedReceiptsPanel({ organizationId, locale, canManage, onPosted }: Props) {
  const t = (key: EnterpriseFinanceKey) => translateEnterpriseFinance(locale, key);
  const { context } = useEnterpriseBusinessContext(organizationId);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState<Receipt[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useToastMessage(error, "error");
  useToastMessage(success, "success");

  useEffect(() => {
    if (context?.functionalCurrencyCode && !currencyCode) setCurrencyCode(context.functionalCurrencyCode);
  }, [context?.functionalCurrencyCode, currencyCode]);

  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    setLoading(true);
    fetch(`/api/enterprise/${organizationId}/inventory-unvalued-receipts?${params}`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || body.error || t("inventoryUnvaluedLoadFailed"));
        setItems(Array.isArray(body.items) ? body.items : []);
        setPagination(body.pagination || EMPTY_PAGINATION);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(safeFinanceError(cause, t("inventoryUnvaluedLoadFailed"), locale));
        setItems([]);
        setPagination(EMPTY_PAGINATION);
      })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [visible, organizationId, page, search, refreshKey, locale]);

  function choose(item: Receipt) {
    setSelected(item);
    setUnitCost("");
    setEvidenceChecked(false);
    setError("");
    setSuccess("");
  }

  async function valueReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canManage || !evidenceChecked || !unitCost.trim() || !/^[A-Z]{3}$/.test(currencyCode.trim().toUpperCase())) return;
    const numeric = Number(unitCost);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/stock-movements/${encodeURIComponent(selected.id)}/value-receipt`, {
        unitCost: unitCost.trim(),
        currencyCode: currencyCode.trim().toUpperCase(),
      });
      setSelected(null);
      setEvidenceChecked(false);
      setUnitCost("");
      setRefreshKey((value) => value + 1);
      setSuccess(t("inventoryUnvaluedPostedSuccess"));
      await onPosted();
    } catch (cause) {
      setError(safeFinanceError(cause, t("inventoryUnvaluedPostFailed"), locale));
    } finally { setSaving(false); }
  }

  return <section className="min-w-0 border-b border-dtsc-border pb-5">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-black text-dtsc-ink">{t("inventoryUnvaluedTitle")}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("inventoryUnvaluedDescription")}</p>
      </div>
      <Button variant="outline" onClick={() => { setVisible((value) => !value); setSelected(null); }}><Plus className="h-4 w-4" />{visible ? t("close") : t("inventoryUnvaluedOpen")}</Button>
    </div>
    {visible ? <div className="mt-4 grid min-w-0 gap-4">
      <label className="relative block min-w-0">
        <span className="sr-only">{t("inventoryUnvaluedSearch")}</span>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-dtsc-muted" />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelected(null); }} className="pl-9" placeholder={t("inventoryUnvaluedSearch")} />
      </label>
      {loading ? <p className="text-sm text-dtsc-muted" role="status">{t("processing")}</p>
        : items.length === 0 ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-sm text-dtsc-muted">{t("inventoryUnvaluedEmpty")}</p>
          : <div className="divide-y divide-dtsc-border border-y border-dtsc-border">{items.map((item) => (
            <article key={item.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-bold text-dtsc-ink">{item.inventoryItemName}{item.inventoryItemCode ? ` · ${item.inventoryItemCode}` : ""}</p>
                <p className="text-xs leading-6 text-dtsc-muted">{item.warehouseName} · {item.quantity} {t("quantity")} · {financeDate(item.occurredAt, locale)}</p>
              </div>
              {canManage ? <Button variant="outline" onClick={() => choose(item)} disabled={saving}>{t("inventoryUnvaluedEnterCost")}</Button> : null}
            </article>
          ))}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-dtsc-muted">
        <span>{pagination.total} {t("records")}</span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />{t("previous")}</Button>
          <span>{page}/{pagination.pageCount}</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((value) => value + 1)}>{t("next")}<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {selected && canManage ? <form onSubmit={valueReceipt} className="grid min-w-0 gap-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex min-w-0 gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0"><p className="font-black text-dtsc-ink">{selected.inventoryItemName}</p>
            <p className="mt-1 leading-6 text-dtsc-muted">{t("inventoryUnvaluedProofRequired")}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("inventoryUnvaluedUnitCost")}
            <Input type="number" min="0.000001" step="0.000001" required value={unitCost} onChange={(event) => setUnitCost(event.target.value)} disabled={saving} />
          </label>
          <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{t("currency")}
            <Input maxLength={3} minLength={3} pattern="[A-Za-z]{3}" required value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} disabled={saving} />
          </label>
        </div>
        {Number(unitCost) > 0 ? <p className="text-sm font-bold text-dtsc-ink">{t("inventoryUnvaluedEstimatedTotal")} : {(Number(unitCost) * Number(selected.quantity)).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 })} {currencyCode}</p> : null}
        <label className="flex min-w-0 items-start gap-2 text-sm text-dtsc-ink">
          <input type="checkbox" checked={evidenceChecked} onChange={(event) => setEvidenceChecked(event.target.checked)} required disabled={saving} className="mt-1 h-4 w-4" />
          <span>{t("inventoryUnvaluedAttestation")}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !evidenceChecked || !unitCost.trim() || Number(unitCost) <= 0}><CheckCircle2 className="h-4 w-4" />{saving ? t("processing") : t("inventoryUnvaluedPost")}</Button>
          <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={saving}>{t("cancel")}</Button>
        </div>
      </form> : null}
    </div> : null}
  </section>;
}
