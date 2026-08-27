"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Edit3, Plus, ShieldCheck } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalHelp, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { financeDate, financeEnumLabel, financeStatusTone, type FinanceLocale } from "@/components/enterprise/professional/finance-professional-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ContextActions } from "@/components/workspace/context-actions";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { translateExchangeRate, type ExchangeRateCopyKey } from "@/lib/i18n/enterprise-exchange-rates";

type Rate = { id: string; sourceCurrencyCode: string; targetCurrencyCode: string; rateDate: string; source: string; rate: string | number; precision: number; status: string; createdAt: string };
type Currency = { code: string; name: string; symbol?: string | null; precision: number };
type Payload = { rates: Rate[]; currencies: Currency[]; configuration?: { functionalCurrencyCode?: string | null; presentationCurrencyCode?: string | null } | null };
type RateFormDefaults = { sourceCurrencyCode: string; targetCurrencyCode: string; rateDate: string; source: string };
const SOURCE_VALUES = ["MANUAL", "CENTRAL_BANK", "COMMERCIAL_BANK", "PROVIDER", "CONTRACTUAL", "IMPORTED"] as const;

async function requestJson(endpoint: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown) {
  const response = await fetch(endpoint, { method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { message?: string; error?: string; [key: string]: unknown } | null;
  if (!response.ok) throw new Error(payload?.message || payload?.error || "EXCHANGE_RATE_OPERATION_FAILED");
  return payload || {};
}

const today = () => new Date().toISOString().slice(0, 10);

export function EnterpriseExchangeRatesWorkspace({ organizationId, organizationName, canManage }: { organizationId: string; organizationName: string; canManage: boolean }) {
  const appLocale = useAppLocale();
  const locale: FinanceLocale = appLocale === "en" ? "en" : "fr";
  const t = useCallback((key: ExchangeRateCopyKey) => translateExchangeRate(locale, key), [locale]);
  const [payload, setPayload] = useState<Payload>({ rates: [], currencies: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<Rate | null>(null);
  const [defaults, setDefaults] = useState<RateFormDefaults>({ sourceCurrencyCode: "", targetCurrencyCode: "", rateDate: today(), source: "MANUAL" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setPayload(await requestJson(`/api/enterprise/${organizationId}/exchange-rates`) as unknown as Payload); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : t("loadError")); }
    finally { setLoading(false); }
  }, [organizationId, t]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const currencyChoices = useMemo(() => payload.currencies.map((currency) => ({ id: currency.code, label: `${currency.code} · ${currency.name}` })), [payload.currencies]);
  const sourceChoices = SOURCE_VALUES.map((source) => ({ id: source, label: source === "MANUAL" ? t("manual") : source === "CENTRAL_BANK" ? t("centralBank") : source === "COMMERCIAL_BANK" ? t("commercialBank") : source === "PROVIDER" ? t("provider") : source === "CONTRACTUAL" ? t("contractual") : t("imported") }));

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  function openNewRate(prefill?: Partial<RateFormDefaults>) {
    setDefaults({ sourceCurrencyCode: prefill?.sourceCurrencyCode || "", targetCurrencyCode: prefill?.targetCurrencyCode || "", rateDate: prefill?.rateDate || today(), source: prefill?.source || "MANUAL" });
    setRateDialogOpen(true); setNotice(""); setError("");
  }

  async function publishRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/exchange-rates`, "POST", { sourceCurrencyCode: String(form.get("sourceCurrencyCode") || ""), targetCurrencyCode: String(form.get("targetCurrencyCode") || ""), rate: String(form.get("rate") || ""), rateDate: String(form.get("rateDate") || ""), source: String(form.get("source") || "MANUAL") });
      setRateDialogOpen(false); setNotice(t("created")); refresh();
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : t("operationError")); }
    finally { setBusy(false); }
  }

  async function continueCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !correctionTarget) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/enterprise/${organizationId}/exchange-rates/${correctionTarget.id}`, "PATCH", { reason: String(form.get("reason") || "") });
      const target = correctionTarget; setCorrectionTarget(null); refresh();
      openNewRate({ sourceCurrencyCode: target.sourceCurrencyCode, targetCurrencyCode: target.targetCurrencyCode, rateDate: String(target.rateDate).slice(0, 10), source: target.source });
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : t("operationError")); }
    finally { setBusy(false); }
  }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`${t("eyebrow")} · ${organizationName}`} title={t("title")} description={t("description")} primaryAction={canManage ? <Button onClick={() => openNewRate()}><Plus className="h-4 w-4" />{t("newRate")}</Button> : undefined} secondaryActions={<Link href="/enterprise-modules/FINANCE_TREASURY"><Button variant="outline"><ArrowLeft className="h-4 w-4" />{t("backTreasury")}</Button></Link>} />
    <ModuleContent>
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{notice}</div> : null}
      {error ? <ProfessionalError message={error} /> : null}
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-4 text-sm font-semibold leading-6 text-dtsc-muted"><ShieldCheck className="mr-2 inline h-4 w-4 text-cyan-600" />{t("fieldPolicy")}</div>
      <ModuleSection title={t("history")} description={t("historyDescription")} count={payload.rates.length}>
        {loading ? <ProfessionalLoading rows={5} /> : payload.rates.length ? <div className="grid gap-2">{payload.rates.map((rate) => <article key={rate.id} className="grid min-w-0 gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-dtsc-ink">{rate.sourceCurrencyCode} → {rate.targetCurrencyCode}</strong><StatusBadge tone={financeStatusTone(rate.status)}>{rate.status === "ACTIVE" ? t("active") : t("inactive")}</StatusBadge></div><p className="mt-1 text-sm font-semibold text-dtsc-muted">1 {rate.sourceCurrencyCode} = {String(rate.rate)} {rate.targetCurrencyCode} · {financeDate(rate.rateDate, locale)} · {financeEnumLabel(rate.source, locale)}</p></div>{canManage && rate.status === "ACTIVE" ? <ContextActions label={`${t("actions")} · ${rate.sourceCurrencyCode}/${rate.targetCurrencyCode}`} actions={[{ id: "correct", label: t("correction"), icon: Edit3, onSelect: () => setCorrectionTarget(rate) }]} /> : null}</article>)}</div> : <div className="rounded-xl border border-dashed border-dtsc-border p-6 text-center"><p className="font-black text-dtsc-ink">{t("noRates")}</p><p className="mt-1 text-sm text-dtsc-muted">{t("noRatesDescription")}</p></div>}
      </ModuleSection>
      <ProfessionalHelp moduleCode="FINANCE_TREASURY" />
    </ModuleContent>

    <Dialog open={rateDialogOpen} onClose={() => setRateDialogOpen(false)} title={defaults.sourceCurrencyCode ? t("correctionRate") : t("newRate")} description={t("fieldPolicy")} className="h-[94dvh] w-[min(96vw,56rem)] max-w-3xl overflow-x-hidden">
      <form onSubmit={publishRate} className="grid gap-5"><div className="grid min-w-0 gap-4 md:grid-cols-2"><Field label={t("sourceCurrency")} help={t("sourceCurrencyHelp")} required><NativeSelect name="sourceCurrencyCode" items={currencyChoices} defaultValue={defaults.sourceCurrencyCode} required /></Field><Field label={t("targetCurrency")} help={t("targetCurrencyHelp")} required><NativeSelect name="targetCurrencyCode" items={currencyChoices} defaultValue={defaults.targetCurrencyCode} required /></Field><Field label={t("rate")} help={t("rateHelp")} required><Input name="rate" type="number" inputMode="decimal" min="0.000000000001" step="0.000000000001" required /></Field><Field label={t("rateDate")} help={t("rateDateHelp")} required><Input name="rateDate" type="date" defaultValue={defaults.rateDate} required /></Field><Field label={t("source")} help={t("sourceHelp")} required><NativeSelect name="source" items={sourceChoices} defaultValue={defaults.source} required /></Field></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface/95 py-3"><Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy || currencyChoices.length < 2}><Plus className="h-4 w-4" />{t("publish")}</Button></div></form>
    </Dialog>

    <Dialog open={Boolean(correctionTarget)} onClose={() => setCorrectionTarget(null)} title={t("correction")} description={t("correctionWarning")} className="w-[min(96vw,44rem)] max-w-xl overflow-x-hidden">
      {correctionTarget ? <form onSubmit={continueCorrection} className="grid gap-4"><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-dtsc-muted">{t("correctionWarning")}</div><Field label={t("correctionReason")} help={t("correctionReasonHelp")} required><Input name="reason" minLength={4} maxLength={1000} required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCorrectionTarget(null)}>{t("cancel")}</Button><Button type="submit" disabled={busy}><Edit3 className="h-4 w-4" />{t("continueCorrection")}</Button></div></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}
