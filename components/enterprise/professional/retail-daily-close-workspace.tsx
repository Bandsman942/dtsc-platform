"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  customerFacingError,
  customerFacingFinancialAccountType,
  customerFacingStatusLabel,
} from "@/lib/customer-facing-language";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { getRetailUserGuide } from "@/lib/user-guides/retail-telco-mobile-money-guides";

type FinancialAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  currencyCode: string;
  operationalBalance: string | number;
  siteId: string | null;
};

type CashSession = {
  id: string;
  number: string;
  status: string;
  openingAmount: string | number;
  openedAt: string;
  financialAccountId: string;
  financialAccount: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    operationalBalance: string | number;
  };
  _count: { movements: number; counts: number; discrepancies: number };
};

type DailyCloseLine = {
  id: string;
  accountType: string;
  currencyCode: string;
  systemClosingBalance: string | number;
  declaredBalance: string | number;
  differenceAmount: string | number;
  varianceReason: string | null;
};

type DailyClose = {
  id: string;
  number: string;
  businessDate: string;
  status: string;
  revision: number;
  notes?: string | null;
  lines: DailyCloseLine[];
};

type Dashboard = {
  access: { canWrite: boolean; canManage: boolean };
  accounts: FinancialAccount[];
  cashSession: CashSession | null;
  range: { from: string; to: string };
};

type CloseListResponse = {
  items: DailyClose[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

function moneyValue(value: string | number | null | undefined, currency?: string) {
  const amount = Number(value || 0);
  const locale = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en") ? "en-US" : "fr-FR";
  const formatted = Number.isFinite(amount) ? amount.toLocaleString(locale, { maximumFractionDigits: 2 }) : "0";
  return currency ? `${formatted} ${currency}` : formatted;
}

function parseDenominations(value: string) {
  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [denomination, quantity] = chunk.split(/[x×*]/).map((part) => part.trim());
      return { denomination: Number(denomination || 0), quantity: Number(quantity || 0) };
    })
    .filter((item) => item.denomination > 0 && Number.isInteger(item.quantity) && item.quantity >= 0);
}

function statusTone(status: string) {
  if (["APPROVED", "CLOSED", "COMPLETED"].includes(status)) return "success" as const;
  if (["SUBMITTED", "PENDING_VALIDATION", "CLOSING"].includes(status)) return "warning" as const;
  if (["REJECTED", "FAILED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function Select({ name, defaultValue, required, disabled, children }: { name: string; defaultValue?: string; required?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"
    >
      {children}
    </select>
  );
}

export function RetailDailyCloseWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [closeList, setCloseList] = useState<CloseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const mutationKeys = useRef<Record<string, string>>({});
  const guide = useMemo(() => getRetailUserGuide("RETAIL_DAILY_CLOSE", locale), [locale]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const [dashboardResponse, closesResponse] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_DAILY_CLOSE`, { cache: "no-store" }),
        fetch(`/api/enterprise/${organizationId}/retail/daily-close?${params.toString()}`, { cache: "no-store" }),
      ]);
      const dashboardBody = await dashboardResponse.json().catch(() => null) as (Dashboard & { message?: string; error?: string }) | null;
      const closesBody = await closesResponse.json().catch(() => null) as (CloseListResponse & { message?: string; error?: string }) | null;
      if (!dashboardResponse.ok || !dashboardBody) throw new Error(dashboardBody?.message || dashboardBody?.error || "RETAIL_DAILY_CLOSE_LOAD_FAILED");
      if (!closesResponse.ok || !closesBody) throw new Error(closesBody?.message || closesBody?.error || "RETAIL_DAILY_CLOSE_LOAD_FAILED");
      setDashboard(dashboardBody);
      setCloseList(closesBody);
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: "La clôture journalière n’est pas disponible pour le moment. Actualisez puis réessayez.",
        en: "Daily close is not available right now. Refresh and try again.",
      }));
    } finally {
      setLoading(false);
    }
  }, [locale, organizationId, refreshKey, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function stableKey(action: string) {
    if (!mutationKeys.current[action]) mutationKeys.current[action] = crypto.randomUUID();
    return mutationKeys.current[action];
  }

  async function post(action: string, endpoint: string, payload: Record<string, unknown>, success: string, idempotent = false) {
    if (busyAction) return null;
    setBusyAction(action);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(idempotent ? { ...payload, idempotencyKey: stableKey(action) } : payload),
      });
      const body = await response.json().catch(() => null) as ({ message?: string; error?: string } & Record<string, unknown>) | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_DAILY_CLOSE_ACTION_FAILED");
      if (idempotent) delete mutationKeys.current[action];
      setMessage(success);
      setRefreshKey((value) => value + 1);
      return body || {};
    } catch (caught) {
      setMessage(customerFacingError(caught, locale, {
        fr: "Cette action n’a pas pu être terminée. Vérifiez les informations puis réessayez.",
        en: "This action could not be completed. Check the information and try again.",
      }));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  const closeAccounts = useMemo(
    () => (dashboard?.accounts || []).filter((account) => ["CASH", "MOBILE_MONEY", "CLEARING"].includes(account.accountType)),
    [dashboard],
  );
  const cashAccounts = useMemo(
    () => (dashboard?.accounts || []).filter((account) => account.accountType === "CASH"),
    [dashboard],
  );
  const closes = closeList?.items || [];
  const pendingCount = closes.filter((item) => item.status === "SUBMITTED").length;
  const varianceCount = closes.reduce((sum, item) => sum + item.lines.filter((line) => Math.abs(Number(line.differenceAmount || 0)) > 0.005).length, 0);

  async function submitClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = closeAccounts
      .filter((account) => form.get(`include-${account.id}`) === "on")
      .map((account) => ({
        financialAccountId: account.id,
        accountType: account.accountType,
        declaredBalance: Number(form.get(`declared-${account.id}`) || 0),
        varianceReason: String(form.get(`reason-${account.id}`) || "").trim() || null,
        denominations: account.accountType === "CASH" ? parseDenominations(String(form.get(`denominations-${account.id}`) || "")) : [],
      }));
    if (!lines.length) {
      setMessage(locale === "en" ? "Select at least one account to close." : "Sélectionnez au moins un compte à clôturer.");
      return;
    }
    const businessDate = String(form.get("businessDate") || new Date().toISOString().slice(0, 10));
    await post(
      "daily-close-submit",
      `/api/enterprise/${organizationId}/retail/daily-close`,
      {
        businessDate: new Date(`${businessDate}T12:00:00`).toISOString(),
        notes: String(form.get("notes") || "").trim() || null,
        lines,
      },
      locale === "en" ? "Close submitted for independent review." : "Clôture soumise à une validation indépendante.",
      true,
    );
  }

  async function decide(item: DailyClose, decision: "APPROVE" | "REJECT") {
    const reason = decision === "REJECT"
      ? window.prompt(locale === "en" ? "Why is this close rejected?" : "Pourquoi cette clôture est-elle refusée ?")
      : null;
    if (decision === "REJECT" && !reason?.trim()) return;
    await post(
      `daily-close-${decision.toLowerCase()}-${item.id}`,
      `/api/enterprise/${organizationId}/retail/daily-close/${item.id}/decision`,
      { revision: item.revision, decision, reason: reason?.trim() || null },
      decision === "APPROVE"
        ? (locale === "en" ? "Close approved." : "Clôture validée.")
        : (locale === "en" ? "Close rejected." : "Clôture refusée."),
    );
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`${locale === "en" ? "Shop control" : "Contrôle Shop"} · ${organizationName}`}
        title={locale === "en" ? definition.labelEn : definition.labelFr}
        description={locale === "en"
          ? "Count the till and operational balances, explain variances, then submit the day for independent review."
          : "Comptez la caisse et les soldes opérationnels, justifiez les écarts puis soumettez la journée à une validation indépendante."}
        primaryAction={(
          <div data-responsive-actions>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>{locale === "en" ? "User guide" : "Guide utilisateur"}</Button>
            <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setRefreshKey((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" />{locale === "en" ? "Refresh" : "Actualiser"}
            </Button>
          </div>
        )}
      />
      <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />

      {dashboard ? (
        <ModuleMetrics label={locale === "en" ? "Daily close indicators" : "Indicateurs de clôture"}>
          <ModuleMetric label={locale === "en" ? "Till" : "Caisse"} value={dashboard.cashSession?.status === "OPEN" ? (locale === "en" ? "Open" : "Ouverte") : (locale === "en" ? "Not open" : "Non ouverte")} />
          <ModuleMetric label={locale === "en" ? "Balances to review" : "Soldes à contrôler"} value={closeAccounts.length} />
          <ModuleMetric label={locale === "en" ? "Awaiting review" : "À valider"} value={pendingCount} />
          <ModuleMetric label={locale === "en" ? "Variances in view" : "Écarts visibles"} value={varianceCount} />
        </ModuleMetrics>
      ) : null}

      <ModuleToolbar
        controls={(
          <div className="flex min-w-0 gap-2 overflow-x-auto [touch-action:pan-x]">
            {["ALL", "SUBMITTED", "APPROVED", "REJECTED"].map((status) => (
              <Button key={status} size="sm" variant={statusFilter === status ? "default" : "outline"} onClick={() => setStatusFilter(status)}>
                {status === "ALL" ? (locale === "en" ? "All closes" : "Toutes") : customerFacingStatusLabel(status, locale)}
              </Button>
            ))}
          </div>
        )}
        summary={locale === "en" ? "Finance remains the source of truth for tills, balances and treasury." : "Finance reste la source de vérité des caisses, soldes et de la trésorerie."}
      />

      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold text-dtsc-ink">{message}</div> : null}
        {error ? <ProfessionalError message={error} /> : loading ? <ProfessionalLoading rows={5} /> : !dashboard ? (
          <EmptyState title={locale === "en" ? "Daily close unavailable" : "Clôture indisponible"} description={locale === "en" ? "Refresh this page to try again." : "Actualisez cette page pour réessayer."} />
        ) : (
          <div className="grid min-w-0 gap-5">
            <ModuleSection
              title={locale === "en" ? "Till & treasury handoff" : "Caisse & passage vers Finance"}
              description={locale === "en" ? "Use Finance to manage the underlying accounts; use this workspace to perform the Shop day-end control." : "Utilisez Finance pour gérer les comptes ; utilisez cet espace pour effectuer le contrôle de fin de journée du Shop."}
            >
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className={`min-w-0 rounded-2xl border p-4 ${dashboard.cashSession?.status === "OPEN" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                  {dashboard.cashSession?.status === "OPEN" ? (
                    <>
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-black text-dtsc-ink">{dashboard.cashSession.financialAccount.name} · {dashboard.cashSession.financialAccount.currencyCode}</p>
                          <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                            {locale === "en" ? "Opening float" : "Fonds d’ouverture"}: {moneyValue(dashboard.cashSession.openingAmount, dashboard.cashSession.financialAccount.currencyCode)} · {locale === "en" ? "current balance" : "solde actuel"}: {moneyValue(dashboard.cashSession.financialAccount.operationalBalance, dashboard.cashSession.financialAccount.currencyCode)}
                          </p>
                        </div>
                        <StatusBadge tone="success">{customerFacingStatusLabel(dashboard.cashSession.status, locale)}</StatusBadge>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{locale === "en" ? "No active till. Open your till before recording cash activity." : "Aucune caisse active. Ouvrez votre caisse avant d’enregistrer des opérations en espèces."}</p>
                  )}
                </div>
                <div data-responsive-actions>
                  <Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_CASH">{locale === "en" ? "Cash management" : "Gestion de caisse"}</Link></Button>
                  <Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_TREASURY">{locale === "en" ? "Treasury" : "Trésorerie"}</Link></Button>
                </div>
              </div>

              {!dashboard.cashSession && dashboard.access.canWrite ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await post(
                      "open-till",
                      `/api/enterprise/${organizationId}/retail/cash-sessions`,
                      {
                        financialAccountId: String(form.get("financialAccountId") || ""),
                        openingAmount: String(form.get("openingAmount") || "0"),
                      },
                      locale === "en" ? "Till opened." : "Caisse ouverte.",
                    );
                  }}
                  className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.45fr)_auto] sm:items-end"
                >
                  <Field label={locale === "en" ? "Till" : "Caisse"}>
                    <Select name="financialAccountId" required disabled={Boolean(busyAction)}>
                      <option value="">—</option>
                      {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
                    </Select>
                  </Field>
                  <Field label={locale === "en" ? "Opening float" : "Fonds d’ouverture"}>
                    <Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} />
                  </Field>
                  <Button disabled={Boolean(busyAction) || !cashAccounts.length}><Banknote className="h-4 w-4" />{locale === "en" ? "Open till" : "Ouvrir la caisse"}</Button>
                </form>
              ) : null}
            </ModuleSection>

            <ModuleSection
              title={locale === "en" ? "Balances to count" : "Soldes à compter"}
              description={locale === "en" ? "Only the accounts relevant to the Shop close are presented here. Their setup remains in Finance." : "Seuls les comptes utiles à la clôture du Shop sont présentés ici. Leur paramétrage reste dans Finance."}
            >
              {closeAccounts.length ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {closeAccounts.map((account) => (
                    <div key={account.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                      <p className="break-words font-black text-dtsc-ink">{account.name}</p>
                      <p className="mt-1 text-xs font-semibold text-dtsc-muted">{customerFacingFinancialAccountType(account.accountType, locale)} · {account.currencyCode}</p>
                      <p className="mt-3 text-xl font-black text-dtsc-ink">{moneyValue(account.operationalBalance, account.currencyCode)}</p>
                      <p className="text-xs font-semibold text-dtsc-muted">{locale === "en" ? "Current operational balance" : "Solde opérationnel actuel"}</p>
                    </div>
                  ))}
                </div>
              ) : <EmptyState compact title={locale === "en" ? "No balance to close" : "Aucun solde à clôturer"} description={locale === "en" ? "Configure the relevant cash or payment account in Finance first." : "Configurez d’abord le compte de caisse ou de paiement correspondant dans Finance."} />}
            </ModuleSection>

            <ModuleSection
              title={locale === "en" ? "Submit the daily close" : "Soumettre la clôture journalière"}
              description={locale === "en" ? "Select the balances you counted. Every variance should have a clear business reason before review." : "Sélectionnez les soldes comptés. Tout écart doit avoir une justification claire avant validation."}
            >
              <form onSubmit={(event) => void submitClose(event)} className="grid min-w-0 gap-4">
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <Field label={locale === "en" ? "Business date" : "Date d’exploitation"}><Input name="businessDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
                  <Field label={locale === "en" ? "Close notes" : "Notes de clôture"}><Input name="notes" maxLength={2000} /></Field>
                </div>
                <div className="grid min-w-0 gap-3">
                  {closeAccounts.map((account) => (
                    <div key={account.id} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1fr)] md:items-end">
                      <label className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-black text-dtsc-ink">
                        <input type="checkbox" name={`include-${account.id}`} />
                        <span className="min-w-0 break-words">{account.name}<span className="block text-xs font-semibold text-dtsc-muted">{customerFacingFinancialAccountType(account.accountType, locale)} · {account.currencyCode}</span></span>
                      </label>
                      <Field label={locale === "en" ? "Declared balance" : "Solde déclaré"}><Input name={`declared-${account.id}`} type="number" min="0" step="0.01" defaultValue={String(account.operationalBalance)} /></Field>
                      {account.accountType === "CASH" ? (
                        <Field label={locale === "en" ? "Denominations" : "Coupures"}><Input name={`denominations-${account.id}`} placeholder="50000x2,20000x3" /></Field>
                      ) : (
                        <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs font-semibold text-dtsc-muted">
                          {locale === "en" ? "System balance" : "Solde système"}: {moneyValue(account.operationalBalance, account.currencyCode)}
                        </div>
                      )}
                      <Field label={locale === "en" ? "Variance reason" : "Motif d’écart"}><Input name={`reason-${account.id}`} maxLength={1000} /></Field>
                    </div>
                  ))}
                </div>
                <Button className="w-fit" disabled={Boolean(busyAction) || !dashboard.access.canWrite || !closeAccounts.length}>
                  <ClipboardCheck className="h-4 w-4" />{busyAction === "daily-close-submit" ? (locale === "en" ? "Submitting…" : "Soumission…") : (locale === "en" ? "Submit for review" : "Soumettre à validation")}
                </Button>
              </form>
            </ModuleSection>

            <ModuleSection
              title={locale === "en" ? "Daily close history" : "Historique des clôtures"}
              description={closeList ? `${closeList.pagination.total} ${locale === "en" ? "close(s)" : "clôture(s)"}` : undefined}
            >
              {closes.length ? (
                <BusinessList ariaLabel={locale === "en" ? "Daily close history" : "Historique des clôtures"}>
                  {closes.map((item) => {
                    const varianceLines = item.lines.filter((line) => Math.abs(Number(line.differenceAmount || 0)) > 0.005);
                    const description = item.lines.map((line) => {
                      const label = customerFacingFinancialAccountType(line.accountType, locale);
                      const declared = moneyValue(line.declaredBalance, line.currencyCode);
                      const difference = moneyValue(line.differenceAmount, line.currencyCode);
                      return `${label}: ${locale === "en" ? "declared" : "déclaré"} ${declared} · ${locale === "en" ? "variance" : "écart"} ${difference}${line.varianceReason ? ` · ${line.varianceReason}` : ""}`;
                    }).join(" | ");
                    return (
                      <BusinessListItem
                        key={item.id}
                        title={item.number}
                        status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                        meta={`${formatEnterpriseDate(item.businessDate, locale)} · ${varianceLines.length ? `${varianceLines.length} ${locale === "en" ? "variance(s)" : "écart(s)"}` : (locale === "en" ? "No variance" : "Aucun écart")}`}
                        description={description}
                        actions={dashboard.access.canManage && item.status === "SUBMITTED" ? (
                          <div data-responsive-actions>
                            <Button size="sm" disabled={Boolean(busyAction)} onClick={() => void decide(item, "APPROVE")}><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Approve" : "Valider"}</Button>
                            <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void decide(item, "REJECT")}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button>
                          </div>
                        ) : undefined}
                      />
                    );
                  })}
                </BusinessList>
              ) : <EmptyState compact title={locale === "en" ? "No daily close" : "Aucune clôture"} description={locale === "en" ? "Submitted closes will appear here with their variances and review status." : "Les clôtures soumises apparaîtront ici avec leurs écarts et leur statut de validation."} />}
            </ModuleSection>
          </div>
        )}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
