"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRightLeft, Plus, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";

type Rate = {
  id: string;
  sourceCurrencyCode: string;
  targetCurrencyCode: string;
  rateDate: string;
  source: string;
  rate: string | number;
  precision: number;
  status: string;
  createdAt: string;
};

type Payload = {
  configuration: { functionalCurrencyCode: string; presentationCurrencyCode: string | null; readinessStatus: string } | null;
  currencies: Array<{ code: string; name: string; symbol: string | null; precision: number }>;
  rates: Rate[];
};

const copy = {
  fr: {
    eyebrow: "Finance · Gouvernance des devises",
    title: "Taux de change",
    description: "Configurez des taux datés et auditables. DTSC conserve la devise d’origine et ne consolide jamais des devises différentes sans taux applicable.",
    functional: "Devise fonctionnelle",
    presentation: "Devise de présentation",
    activeRates: "Taux actifs",
    history: "Historique des taux",
    newRate: "Nouveau taux",
    sourceCurrency: "Devise source",
    targetCurrency: "Devise cible",
    rate: "Taux",
    rateDate: "Date d’effet",
    source: "Source",
    precision: "Précision",
    save: "Enregistrer le taux",
    deactivate: "Désactiver",
    refresh: "Actualiser",
    back: "Retour à la Trésorerie",
    noRates: "Aucun taux de change",
    noRatesDescription: "Ajoutez le premier taux avant toute consolidation multi-devise.",
    immutable: "Un taux publié n’est pas modifié. Pour le corriger, désactivez-le avec un motif puis créez une nouvelle version datée.",
    inverse: "DTSC utilise d’abord la paire directe ; à défaut, il peut utiliser l’inverse du taux opposé et conserve ce sens dans la résolution.",
    deactivatePrompt: "Motif de désactivation du taux",
    created: "Le taux de change a été enregistré.",
    deactivated: "Le taux a été désactivé sans supprimer l’historique.",
    loadError: "Chargement des taux impossible.",
    operationError: "L’opération sur le taux de change a échoué.",
  },
  en: {
    eyebrow: "Finance · Currency governance",
    title: "Exchange rates",
    description: "Configure dated, auditable rates. DTSC preserves original currencies and never consolidates different currencies without an applicable rate.",
    functional: "Functional currency",
    presentation: "Presentation currency",
    activeRates: "Active rates",
    history: "Rate history",
    newRate: "New rate",
    sourceCurrency: "Source currency",
    targetCurrency: "Target currency",
    rate: "Rate",
    rateDate: "Effective date",
    source: "Source",
    precision: "Precision",
    save: "Save rate",
    deactivate: "Deactivate",
    refresh: "Refresh",
    back: "Back to Treasury",
    noRates: "No exchange rate",
    noRatesDescription: "Add the first rate before any multi-currency consolidation.",
    immutable: "A published rate is not edited. To correct it, deactivate it with a reason and create a new dated version.",
    inverse: "DTSC resolves the direct pair first; if absent, it may use the inverse opposite pair and keeps that direction in the resolution.",
    deactivatePrompt: "Reason for deactivating this rate",
    created: "The exchange rate was saved.",
    deactivated: "The rate was deactivated without deleting history.",
    loadError: "Unable to load exchange rates.",
    operationError: "The exchange-rate operation failed.",
  },
} as const;

const sources = ["MANUAL", "CENTRAL_BANK", "COMMERCIAL_BANK", "PROVIDER", "CONTRACTUAL", "IMPORTED"] as const;

function formatRate(value: string | number, precision = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString(undefined, { maximumFractionDigits: Math.min(12, Math.max(2, precision)) });
}

function CurrencySelect({ name, currencies, required }: { name: string; currencies: Payload["currencies"]; required?: boolean }) {
  return (
    <select name={name} required={required} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
      <option value="">—</option>
      {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}
    </select>
  );
}

export function EnterpriseExchangeRatesWorkspace({ organizationId, organizationName, canManage }: { organizationId: string; organizationName: string; canManage: boolean }) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const t = copy[locale];
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/exchange-rates`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (Payload & { message?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || t.loadError);
      setPayload(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [organizationId, refreshKey, t.loadError]);

  useEffect(() => { void load(); }, [load]);

  const activeRates = useMemo(() => payload?.rates.filter((item) => item.status === "ACTIVE") || [], [payload]);

  async function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/exchange-rates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceCurrencyCode: String(form.get("sourceCurrencyCode") || ""),
          targetCurrencyCode: String(form.get("targetCurrencyCode") || ""),
          rate: String(form.get("rate") || ""),
          rateDate: String(form.get("rateDate") || ""),
          source: String(form.get("source") || "MANUAL"),
          precision: Number(form.get("precision") || 12),
        }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || t.operationError);
      event.currentTarget.reset();
      setMessage(t.created);
      setRefreshKey((value) => value + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t.operationError);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(rate: Rate) {
    if (busy) return;
    const reason = window.prompt(t.deactivatePrompt);
    if (!reason?.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/exchange-rates/${rate.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || t.operationError);
      setMessage(t.deactivated);
      setRefreshKey((value) => value + 1);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : t.operationError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${t.eyebrow} · ${organizationName}`}
        title={t.title}
        description={t.description}
        primaryAction={<Button variant="outline" disabled={busy} onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />{t.refresh}</Button>}
        secondaryActions={<Link href="/enterprise-modules/FINANCE_TREASURY" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink"><ArrowLeft className="h-4 w-4" />{t.back}</Link>}
      />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : null}
        {loading ? <ProfessionalLoading rows={5} /> : !payload ? null : <>
          <ModuleMetrics label={locale === "fr" ? "Configuration monétaire" : "Currency configuration"}>
            <ModuleMetric label={t.functional} value={payload.configuration?.functionalCurrencyCode || "—"} />
            <ModuleMetric label={t.presentation} value={payload.configuration?.presentationCurrencyCode || payload.configuration?.functionalCurrencyCode || "—"} />
            <ModuleMetric label={t.activeRates} value={activeRates.length} />
          </ModuleMetrics>

          <ModuleSection title={t.newRate} description={t.immutable}>
            {canManage ? <form onSubmit={createRate} className="grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 lg:grid-cols-3">
              <Field label={t.sourceCurrency}><CurrencySelect name="sourceCurrencyCode" currencies={payload.currencies} required /></Field>
              <Field label={t.targetCurrency}><CurrencySelect name="targetCurrencyCode" currencies={payload.currencies} required /></Field>
              <Field label={t.rate}><Input name="rate" type="number" inputMode="decimal" min="0.000000000001" step="0.000000000001" required /></Field>
              <Field label={t.rateDate}><Input name="rateDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
              <Field label={t.source}><select name="source" defaultValue="MANUAL" className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">{sources.map((source) => <option key={source} value={source}>{source.replaceAll("_", " ")}</option>)}</select></Field>
              <Field label={t.precision}><Input name="precision" type="number" min="2" max="12" defaultValue="12" required /></Field>
              <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-sm font-semibold text-dtsc-muted"><span><ShieldCheck className="mr-2 inline h-4 w-4" />{t.inverse}</span><Button type="submit" disabled={busy}><Plus className="h-4 w-4" />{t.save}</Button></div>
            </form> : <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">{locale === "fr" ? "Vous pouvez consulter les taux, mais leur administration exige un rôle de gestion Finance." : "You may view rates, but managing them requires a Finance management role."}</div>}
          </ModuleSection>

          <ModuleSection title={t.history} description={t.inverse}>
            {payload.rates.length ? <div className="grid min-w-0 gap-3">{payload.rates.map((rate) => <article key={rate.id} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-cyan-600" /><p className="break-words font-black text-dtsc-ink">1 {rate.sourceCurrencyCode} = {formatRate(rate.rate, rate.precision)} {rate.targetCurrencyCode}</p><StatusBadge tone={rate.status === "ACTIVE" ? "success" : "neutral"}>{rate.status}</StatusBadge></div>
                <p className="mt-1 text-xs font-semibold text-dtsc-muted">{new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(new Date(rate.rateDate))} · {rate.source.replaceAll("_", " ")} · p={rate.precision}</p>
              </div>
              {canManage && rate.status === "ACTIVE" ? <Button type="button" variant="outline" disabled={busy} onClick={() => void deactivate(rate)}><XCircle className="h-4 w-4" />{t.deactivate}</Button> : null}
            </article>)}</div> : <EmptyState compact title={t.noRates} description={t.noRatesDescription} />}
          </ModuleSection>
        </>}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
