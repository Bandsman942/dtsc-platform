"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Edit3, Plus, Power, RotateCcw, ShieldCheck } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { financeMutation } from "@/components/enterprise/professional/finance-professional-workspace-shared";
import { safeFinanceError, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { translateEnterpriseCurrency, type EnterpriseCurrencyCopyKey } from "@/lib/i18n/enterprise-currencies";

type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  precision: number;
  roundingMode: string;
  isActive: boolean;
  scope: "GLOBAL" | "ORGANIZATION";
  canManage: boolean;
  isInUse: boolean;
};

type Payload = { items?: Currency[]; error?: string; message?: string };

const ROUNDING_VALUES = ["HALF_UP", "HALF_EVEN", "UP", "DOWN"] as const;

export function EnterpriseCurrenciesWorkspace({ organizationId, organizationName, canManage }: { organizationId: string; organizationName: string; canManage: boolean }) {
  const appLocale = useAppLocale();
  const locale: FinanceLocale = appLocale === "en" ? "en" : "fr";
  const t = useCallback((key: EnterpriseCurrencyCopyKey) => translateEnterpriseCurrency(locale, key), [locale]);
  const [items, setItems] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useToastMessage(message, "success");
  useToastMessage(error, "error");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/currencies?includeInactive=true`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as Payload | null;
      if (!response.ok || !body) throw new Error(body?.error || "FINANCE_CURRENCY_LIST_FAILED");
      setItems(Array.isArray(body.items) ? body.items : []);
    } catch (loadError) {
      setItems([]);
      setError(safeFinanceError(loadError, t("error"), locale));
    } finally {
      setLoading(false);
    }
  }, [locale, organizationId, t]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  function refresh(success: string) {
    setMessage(success);
    setRefreshKey((value) => value + 1);
  }

  function openCreate() {
    setEditing(null);
    setError("");
    setMessage("");
    setFormOpen(true);
  }

  function openEdit(currency: Currency) {
    setEditing(currency);
    setError("");
    setMessage("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await financeMutation(`/api/enterprise/${organizationId}/currencies/${editing.id}`, {
          name: String(form.get("name") || ""),
          symbol: String(form.get("symbol") || "") || null,
          precision: Number(form.get("precision") || 2),
          roundingMode: String(form.get("roundingMode") || "HALF_UP"),
        }, "PATCH");
        setFormOpen(false);
        setEditing(null);
        refresh(t("updated"));
      } else {
        await financeMutation(`/api/enterprise/${organizationId}/currencies`, {
          code: String(form.get("code") || "").toUpperCase(),
          name: String(form.get("name") || ""),
          symbol: String(form.get("symbol") || "") || null,
          precision: Number(form.get("precision") || 2),
          roundingMode: String(form.get("roundingMode") || "HALF_UP"),
        });
        setFormOpen(false);
        refresh(t("created"));
      }
    } catch (mutationError) {
      setError(safeFinanceError(mutationError, undefined, locale));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(currency: Currency, isActive: boolean) {
    if (busy || !currency.canManage) return;
    setBusy(true);
    setError("");
    try {
      await financeMutation(`/api/enterprise/${organizationId}/currencies/${currency.id}`, { isActive }, "PATCH");
      refresh(isActive ? t("reactivated") : t("deactivated"));
    } catch (mutationError) {
      setError(safeFinanceError(mutationError, undefined, locale));
    } finally {
      setBusy(false);
    }
  }

  const roundingItems = ROUNDING_VALUES.map((id) => ({
    id,
    label: id === "HALF_UP" ? t("halfUp") : id === "HALF_EVEN" ? t("halfEven") : id === "UP" ? t("up") : t("down"),
  }));
  const precisionItems = Array.from({ length: 7 }, (_, value) => ({ id: String(value), label: String(value) }));
  const globalItems = items.filter((currency) => currency.scope === "GLOBAL");
  const organizationItems = items.filter((currency) => currency.scope === "ORGANIZATION");

  function renderCurrency(currency: Currency) {
    return <article key={currency.id} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-dtsc-ink">{currency.code} · {currency.name}</strong>
          <StatusBadge tone={currency.isActive ? "success" : "neutral"}>{currency.isActive ? t("active") : t("inactive")}</StatusBadge>
          <StatusBadge tone={currency.scope === "GLOBAL" ? "info" : "neutral"}>{currency.scope === "GLOBAL" ? t("global") : t("organization")}</StatusBadge>
          {currency.isInUse ? <StatusBadge tone="warning">{t("inUse")}</StatusBadge> : null}
        </div>
        <p className="mt-1 text-sm font-semibold text-dtsc-muted">{currency.symbol || "—"} · {t("precision")} {currency.precision} · {currency.roundingMode}</p>
      </div>
      {canManage && currency.canManage ? <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(currency)} disabled={busy}><Edit3 className="h-4 w-4" />{t("edit")}</Button>
        {currency.isActive ? <Button type="button" size="sm" variant="outline" onClick={() => void setActive(currency, false)} disabled={busy || currency.isInUse} title={currency.isInUse ? t("inUse") : t("deactivate")}><Power className="h-4 w-4" />{t("deactivate")}</Button> : <Button type="button" size="sm" variant="outline" onClick={() => void setActive(currency, true)} disabled={busy}><RotateCcw className="h-4 w-4" />{t("reactivate")}</Button>}
      </div> : <span className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{t("readOnly")}</span>}
    </article>;
  }

  return <ModuleWorkspace>
    <ModuleHeader
      eyebrow={`${t("eyebrow")} · ${organizationName}`}
      title={t("title")}
      description={t("description")}
      count={`${items.filter((item) => item.isActive).length}`}
      primaryAction={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" />{t("add")}</Button> : undefined}
      secondaryActions={<Link href="/enterprise-modules/FINANCE_OVERVIEW"><Button variant="outline"><ArrowLeft className="h-4 w-4" />{t("back")}</Button></Link>}
    />
    <ModuleContent>
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-4 text-sm font-semibold leading-6 text-dtsc-muted"><ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-600" />{t("organizationDescription")}</div>
      {error ? <ProfessionalError message={error} /> : null}
      {loading ? <ProfessionalLoading rows={5} /> : <>
        <ModuleSection title={t("organization")} description={t("organizationDescription")} count={organizationItems.length}>
          {organizationItems.length ? <div className="grid gap-2">{organizationItems.map(renderCurrency)}</div> : <div className="rounded-xl border border-dashed border-dtsc-border p-6 text-center"><p className="font-black text-dtsc-ink">{t("noCurrencies")}</p><p className="mt-1 text-sm text-dtsc-muted">{t("noCurrenciesDescription")}</p></div>}
        </ModuleSection>
        <ModuleSection title={t("global")} description={t("globalDescription")} count={globalItems.length}>
          <div className="grid gap-2">{globalItems.map(renderCurrency)}</div>
        </ModuleSection>
      </>}
    </ModuleContent>

    <Dialog open={formOpen} onClose={() => { if (!busy) { setFormOpen(false); setEditing(null); } }} title={editing ? t("edit") : t("add")} description={t("description")} className="h-[94dvh] w-[min(96vw,54rem)] max-w-3xl overflow-x-hidden">
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <Field label={t("code")} help={t("codeHelp")} required><Input name="code" defaultValue={editing?.code || ""} maxLength={3} minLength={3} pattern="[A-Za-z]{3}" disabled={Boolean(editing) || busy} required /></Field>
          <Field label={t("name")} help={t("nameHelp")} required><Input name="name" defaultValue={editing?.name || ""} minLength={2} maxLength={120} disabled={busy} required /></Field>
          <Field label={t("symbol")} help={t("symbolHelp")}><Input name="symbol" defaultValue={editing?.symbol || ""} maxLength={12} disabled={busy} /></Field>
          <Field label={t("precision")} help={t("precisionHelp")} required><NativeSelect name="precision" items={precisionItems} defaultValue={String(editing?.precision ?? 2)} disabled={busy} /></Field>
          <Field label={t("roundingMode")} help={t("roundingModeHelp")} required><NativeSelect name="roundingMode" items={roundingItems} defaultValue={editing?.roundingMode || "HALF_UP"} disabled={busy} /></Field>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3">
          <Button type="button" variant="outline" onClick={() => { setFormOpen(false); setEditing(null); }} disabled={busy}>{t("cancel")}</Button>
          <Button type="submit" disabled={busy}>{editing ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editing ? t("save") : t("create")}</Button>
        </div>
      </form>
    </Dialog>
  </ModuleWorkspace>;
}
