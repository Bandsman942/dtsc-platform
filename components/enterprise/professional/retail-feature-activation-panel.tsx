"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { type RetailWorkspaceKey, translateRetailWorkspace } from "@/lib/i18n";

type Props = { organizationId: string; locale: "fr" | "en" };
type Feature = "siteStaffIsolationEnabled" | "invoiceCheckoutEnabled";
type Check = "RETAIL_ACTIVE" | "SITES_CONFIGURED" | "WAREHOUSES_PER_SITE" | "ACCOUNTS_PER_SITE" | "STAFF_PER_SITE" | "INVOICERS_PER_SITE" | "CASHIERS_PER_SITE" | "FINANCE_READY" | "ISOLATION_ACTIVE";
type ActivationState = {
  revision: number | null;
  flags: Record<Feature, boolean>;
  checks: Record<Check, boolean>;
  prerequisites: Record<Feature, { ready: boolean; missing: Check[] }>;
  counts: { sites: number; assignedStaff: number };
  history: Array<{ id: string; action: string; at: string; actorName: string | null; feature: Feature | null; reason: string | null }>;
  historyPagination: { page: number; total: number; pageCount: number };
};
type Failure = { error?: string; message?: string; reasonCode?: string; details?: { missing?: Check[] } };

const FEATURES: Feature[] = ["siteStaffIsolationEnabled", "invoiceCheckoutEnabled"];
const FEATURE_LABELS: Record<Feature, RetailWorkspaceKey> = {
  siteStaffIsolationEnabled: "retailActivationSiteIsolation",
  invoiceCheckoutEnabled: "retailActivationInvoiceCheckout",
};
const FEATURE_DESCRIPTIONS: Record<Feature, RetailWorkspaceKey> = {
  siteStaffIsolationEnabled: "retailActivationSiteIsolationDescription",
  invoiceCheckoutEnabled: "retailActivationInvoiceCheckoutDescription",
};
const CHECK_LABELS: Record<Check, RetailWorkspaceKey> = {
  RETAIL_ACTIVE: "retailActivationCheckRetail",
  SITES_CONFIGURED: "retailActivationCheckSites",
  WAREHOUSES_PER_SITE: "retailActivationCheckWarehouses",
  ACCOUNTS_PER_SITE: "retailActivationCheckAccounts",
  STAFF_PER_SITE: "retailActivationCheckStaff",
  INVOICERS_PER_SITE: "retailActivationCheckInvoicers",
  CASHIERS_PER_SITE: "retailActivationCheckCashiers",
  FINANCE_READY: "retailActivationCheckFinance",
  ISOLATION_ACTIVE: "retailActivationCheckIsolation",
};
const CHECK_LINKS: Record<Check, string> = {
  RETAIL_ACTIVE: "/enterprise-modules/RETAIL_POS?section=readiness#shop-point-of-sale-configuration",
  SITES_CONFIGURED: "/enterprise-modules/SITES_WAREHOUSES#sites",
  WAREHOUSES_PER_SITE: "/enterprise-modules/SITES_WAREHOUSES#warehouses",
  ACCOUNTS_PER_SITE: "/enterprise-modules/FINANCE_TREASURY#cash-accounts",
  STAFF_PER_SITE: "/enterprise-modules/RETAIL_POS?section=staff#retail-site-staff-access",
  INVOICERS_PER_SITE: "/enterprise-modules/RETAIL_POS?section=staff#retail-site-staff-access",
  CASHIERS_PER_SITE: "/enterprise-modules/RETAIL_POS?section=staff#retail-site-staff-access",
  FINANCE_READY: "/enterprise-modules/FINANCE_ACCOUNTING#accounting-readiness",
  ISOLATION_ACTIVE: "/enterprise-modules/RETAIL_POS?section=activation#retail-feature-activation",
};
const ERRORS: Record<string, RetailWorkspaceKey> = {
  RETAIL_FEATURE_ACTIVATION_CONFLICT: "retailActivationConflict",
  RETAIL_FEATURE_ACTIVATION_UNCHANGED: "retailActivationConflict",
  RETAIL_FEATURE_ACTIVATION_NOT_READY: "retailActivationNotReady",
  RETAIL_FEATURE_ISOLATION_DEPENDENCY: "retailActivationIsolationDependency",
  RETAIL_FEATURE_ISOLATION_ROLLBACK_UNSAFE: "retailActivationIsolationRollbackUnsafe",
  RETAIL_FEATURE_INVOICE_ROLLBACK_BLOCKED: "retailActivationInvoiceRollbackBlocked",
  STEP_UP_REQUIRED: "retailActivationStepupRequired",
};

export function RetailFeatureActivationPanel({ organizationId, locale }: Props) {
  const t = useCallback((key: RetailWorkspaceKey) => translateRetailWorkspace(locale, key), [locale]);
  const [state, setState] = useState<ActivationState | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ feature: Feature; enabled: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");

  const load = useCallback(async (historyPage: number) => {
    setBusy("load");
    setLoadError("");
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/feature-activation?page=${historyPage}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as ActivationState | Failure | null;
      if (!response.ok || !body || !("flags" in body)) throw new Error(t("retailActivationLoadError"));
      setState(body as ActivationState);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("retailActivationLoadError"));
    } finally {
      setBusy(null);
    }
  }, [organizationId, t]);

  useEffect(() => { void load(page); }, [load, page]);

  const close = () => {
    if (busy === "save") return;
    setPending(null);
    setReason("");
    setPassword("");
    setTotp("");
  };

  async function submit() {
    if (!pending || busy || state?.revision == null || reason.trim().length < 8 || !password) return;
    setBusy("save");
    try {
      const stepup = await fetch("/api/auth/step-up", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, ...(totp.trim() ? { code: totp.trim() } : {}) }),
      });
      const stepupResult = await stepup.json().catch(() => null) as Failure | null;
      if (!stepup.ok) {
        const knownErrors: Record<string, RetailWorkspaceKey> = {
          "Mot de passe incorrect.": "retailActivationInvalidPassword",
          "Le code de sécurité est incorrect ou déjà utilisé.": "retailActivationInvalidCode",
          "Trop de tentatives de sécurité.": "retailActivationTooManyAttempts",
          "Reconnectez-vous pour continuer.": "retailActivationSessionExpired",
        };
        throw new Error(t(knownErrors[stepupResult?.error || ""] || "retailActivationStepupRequired"));
      }
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/feature-activation`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: pending.feature, enabled: pending.enabled, revision: state.revision, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => null) as Failure | null;
      if (!response.ok) throw new Error(t(ERRORS[result?.error || result?.reasonCode || ""] || "retailActivationSaveError"));
      const success = pending.enabled ? t("retailActivationEnabledSuccess") : t("retailActivationDisabledSuccess");
      setPending(null);
      setPassword("");
      setTotp("");
      setReason("");
      setPage(1);
      await load(1);
      toastSuccess(success);
    } catch (error) {
      toastError(error instanceof Error ? error.message : t("retailActivationSaveError"));
      // Credentials are never retained following a failed security check.
      setPassword("");
      setTotp("");
    } finally {
      setBusy(null);
    }
  }

  const status = (enabled: boolean) => enabled ? t("retailActivationEnabled") : t("retailActivationDisabled");
  return (
    <section id="retail-feature-activation" data-testid="retail-feature-activation" className="scroll-mt-24 rounded-3xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black text-dtsc-ink"><ShieldCheck className="h-5 w-5 shrink-0 text-teal-600" />{t("retailActivationTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("retailActivationDescription")}</p>
        </div>
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void load(page)}><RefreshCw className="h-4 w-4" />{t("refresh")}</Button>
      </div>

      {loadError ? <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{loadError === "RETAIL_FEATURE_ACTIVATION_READ_FAILED" ? t("retailActivationLoadError") : loadError}</p> : null}
      {!state ? <p className="mt-3 text-sm text-dtsc-muted" role="status">{busy === "load" ? t("retailActivationLoading") : t("retailActivationLoadError")}</p> : (
        <>
          <p className="mt-3 text-xs font-semibold text-dtsc-muted">{t("retailActivationCounts")} · {state.counts.sites} {t("retailActivationSites")} · {state.counts.assignedStaff} {t("retailActivationAssignments")}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {FEATURES.map((feature) => {
              const enabled = state.flags[feature];
              const prerequisites = state.prerequisites[feature];
              const blocked = !enabled && !prerequisites.ready;
              return (
                <article key={feature} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 font-black text-dtsc-ink">{t(FEATURE_LABELS[feature])}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${enabled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{status(enabled)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-dtsc-muted">{t(FEATURE_DESCRIPTIONS[feature])}</p>
                  {prerequisites.missing.length ? (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"><CircleAlert className="h-4 w-4" />{t("retailActivationMissing")}</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-dtsc-ink">{prerequisites.missing.map((check) => <li key={check}><Link href={CHECK_LINKS[check]} className="font-semibold text-dtsc-blue underline underline-offset-2 hover:no-underline">{t(CHECK_LABELS[check])}</Link></li>)}</ul>
                    </div>
                  ) : <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{t("retailActivationReady")}</p>}
                  <Button type="button" variant={enabled ? "outline" : "default"} className="mt-4 w-full" disabled={Boolean(busy) || blocked || state.revision === null} onClick={() => setPending({ feature, enabled: !enabled })}>{enabled ? t("retailActivationDisableButton") : t("retailActivationEnableButton")}</Button>
                  {blocked ? <p className="mt-2 text-xs text-dtsc-muted">{t("retailActivationResolveFirst")}</p> : null}
                </article>
              );
            })}
          </div>
          <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Clock3 className="h-4 w-4" />{t("retailActivationHistory")}</h3>
            <p className="mt-1 text-xs text-dtsc-muted">{t("retailActivationHistoryDescription")}</p>
            {!state.history.length ? <p className="mt-3 text-sm text-dtsc-muted">{t("retailActivationNoHistory")}</p> : (
              <ol className="mt-3 space-y-2">{state.history.map((entry) => <li key={entry.id} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm">
                <p className="font-semibold text-dtsc-ink">{entry.feature && FEATURE_LABELS[entry.feature] ? t(FEATURE_LABELS[entry.feature]) : t("retailActivationUnknownFeature")} · {entry.action === "ENTERPRISE_RETAIL_FEATURE_ENABLED" ? t("retailActivationEnabled") : t("retailActivationDisabled")}</p>
                <p className="mt-1 break-words text-xs text-dtsc-muted">{entry.actorName || t("retailActivationUnknownActor")} · {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.at))}</p>
                {entry.reason ? <p className="mt-1 break-words text-sm text-dtsc-ink">{entry.reason}</p> : null}
              </li>)}</ol>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-dtsc-muted">{t("retailActivationPage")} {state.historyPagination.page}/{state.historyPagination.pageCount} · {state.historyPagination.total}</span>
              <div className="flex gap-2"><Button type="button" variant="outline" disabled={Boolean(busy) || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("retailActivationPrevious")}</Button><Button type="button" variant="outline" disabled={Boolean(busy) || page >= state.historyPagination.pageCount} onClick={() => setPage((current) => current + 1)}>{t("retailActivationNext")}</Button></div>
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(pending)} title={pending ? t(pending.enabled ? "retailActivationConfirmEnable" : "retailActivationConfirmDisable") : ""} description={pending ? t(FEATURE_LABELS[pending.feature]) : ""} onClose={close} footer={<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy === "save"} onClick={close}>{t("retailActivationCancel")}</Button><Button type="button" disabled={busy === "save" || reason.trim().length < 8 || !password.trim()} onClick={() => void submit()}>{busy === "save" ? t("retailActivationSaving") : t("retailActivationConfirm")}</Button></div>}>
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"><p className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4" />{t("retailActivationCriticalChange")}</p><p className="mt-1">{t(pending?.enabled ? "retailActivationEnableWarning" : "retailActivationDisableWarning")}</p></div>
          <label className="block text-sm font-semibold text-dtsc-ink">{t("retailActivationReason")}<textarea className="mt-1 min-h-24 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-normal text-dtsc-ink focus:outline-none focus:ring-2 focus:ring-dtsc-blue/30" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("retailActivationReasonPlaceholder")} /></label>
          <label className="block text-sm font-semibold text-dtsc-ink">{t("retailActivationPassword")}<PasswordInput className="mt-1" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} showPasswordLabel={t("retailActivationShowPassword")} hidePasswordLabel={t("retailActivationHidePassword")} /></label>
          <label className="block text-sm font-semibold text-dtsc-ink">{t("retailActivationTotp")}<Input className="mt-1" autoComplete="one-time-code" inputMode="text" maxLength={30} value={totp} onChange={(event) => setTotp(event.target.value)} placeholder={t("retailActivationTotpPlaceholder")} /></label>
          <p className="text-xs leading-5 text-dtsc-muted">{t("retailActivationTotpHint")}</p>
        </div>
      </Dialog>
    </section>
  );
}
