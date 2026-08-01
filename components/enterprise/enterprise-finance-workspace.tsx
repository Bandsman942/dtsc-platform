"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Circle, Database, RefreshCw, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Endpoint = { key: string; labelFr: string; labelEn: string; path: string };
type ApiPayload = {
  items?: Array<Record<string, unknown>>;
  metrics?: Record<string, unknown>;
  pagination?: { page?: number; pageSize?: number; total?: number; pageCount?: number };
  configuration?: Record<string, unknown> | null;
  checklist?: Record<string, boolean>;
  ready?: boolean;
};

type Props = {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canManage: boolean;
};

const ENDPOINTS: Record<string, Endpoint[]> = {
  FINANCE_OVERVIEW: [{ key: "configuration", labelFr: "Préparation financière", labelEn: "Finance readiness", path: "finance/configuration" }],
  FINANCE_RECEIVABLES: [
    { key: "receivables", labelFr: "Créances", labelEn: "Receivables", path: "receivables" },
    { key: "sales-invoices", labelFr: "Factures clients", labelEn: "Sales invoices", path: "sales-invoices" },
    { key: "sales-credit-notes", labelFr: "Avoirs clients", labelEn: "Sales credit notes", path: "sales-credit-notes" },
  ],
  FINANCE_PAYABLES: [
    { key: "payables", labelFr: "Dettes", labelEn: "Payables", path: "payables" },
    { key: "supplier-invoices", labelFr: "Factures fournisseurs", labelEn: "Supplier invoices", path: "supplier-invoices" },
    { key: "supplier-credit-notes", labelFr: "Avoirs fournisseurs", labelEn: "Supplier credit notes", path: "supplier-credit-notes" },
  ],
  FINANCE_PAYMENTS: [{ key: "payments", labelFr: "Paiements", labelEn: "Payments", path: "payments" }],
  FINANCE_TREASURY: [
    { key: "financial-accounts", labelFr: "Comptes financiers", labelEn: "Financial accounts", path: "financial-accounts" },
    { key: "account-transfers", labelFr: "Transferts", labelEn: "Transfers", path: "account-transfers" },
  ],
  FINANCE_CASH: [{ key: "cash-sessions", labelFr: "Sessions de caisse", labelEn: "Cash sessions", path: "cash-sessions" }],
  FINANCE_BANK: [{ key: "bank-statements", labelFr: "Relevés bancaires", labelEn: "Bank statements", path: "bank-statements" }],
  FINANCE_RECONCILIATION: [{ key: "reconciliations", labelFr: "Rapprochements", labelEn: "Reconciliations", path: "reconciliations" }],
  FINANCE_ACCOUNTING: [
    { key: "fiscal-years", labelFr: "Exercices", labelEn: "Fiscal years", path: "fiscal-years" },
    { key: "fiscal-periods", labelFr: "Périodes", labelEn: "Fiscal periods", path: "fiscal-periods" },
    { key: "ledger-accounts", labelFr: "Plan comptable", labelEn: "Ledger accounts", path: "ledger-accounts" },
    { key: "journals", labelFr: "Journaux", labelEn: "Journals", path: "journals" },
    { key: "journal-entries", labelFr: "Écritures", labelEn: "Journal entries", path: "journal-entries" },
    { key: "opening-balances", labelFr: "Soldes d’ouverture", labelEn: "Opening balances", path: "opening-balances" },
  ],
  FINANCE_TAX: [{ key: "taxes", labelFr: "Codes et taux", labelEn: "Tax codes and rates", path: "taxes" }],
  FINANCE_CLOSE: [{ key: "financial-close", labelFr: "Clôtures", labelEn: "Financial closes", path: "financial-close" }],
  FINANCE_STATEMENTS: [{ key: "financial-statements", labelFr: "États publiés", labelEn: "Generated statements", path: "financial-statements" }],
  FINANCE_ASSETS: [{ key: "assets", labelFr: "Immobilisations", labelEn: "Assets", path: "assets" }],
  FINANCE_INVENTORY: [{ key: "inventory-valuation", labelFr: "Valorisation", labelEn: "Valuation", path: "inventory-valuation" }],
};

const DEEP_LINK_KEYS = ["invoiceId", "supplierInvoiceId", "paymentId", "journalEntryId", "cashSessionId", "sessionId", "periodId", "assetId", "movementId"];

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "toString" in value) return String(value);
  return "";
}

function titleFor(item: Record<string, unknown>) {
  return asText(item.number || item.reference || item.code || item.name || item.title || item.statementType || item.periodCode || item.id) || "Élément financier";
}

function subtitleFor(item: Record<string, unknown>) {
  return asText(item.description || item.businessPartyId || item.supplierId || item.accountType || item.journalType || item.currencyCode || item.status);
}

function dateFor(item: Record<string, unknown>, locale: string) {
  const raw = item.updatedAt || item.createdAt || item.invoiceDate || item.paymentDate || item.accountingDate || item.transferDate || item.statementDate || item.generatedAt || item.startDate;
  if (typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR");
}

function moneyFor(item: Record<string, unknown>, locale: string) {
  const value = item.outstandingAmount ?? item.grandTotal ?? item.amount ?? item.originalAmount ?? item.operationalBalance ?? item.totalDebit ?? item.value ?? item.netTaxAmount;
  const currency = asText(item.currencyCode || item.functionalCurrencyCode);
  if (value === undefined || value === null || !currency) return null;
  const numeric = Number(asText(value));
  if (!Number.isFinite(numeric)) return null;
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric);
}

function metricLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function EnterpriseFinanceWorkspace({ organizationId, organizationName, definition, locale, canManage }: Props) {
  const language = locale === "en" ? "en" : "fr";
  const endpoints = useMemo(() => ENDPOINTS[definition.code] || [], [definition.code]);
  const searchParams = useSearchParams();
  const deepLinkId = DEEP_LINK_KEYS.map((key) => searchParams.get(key)).find(Boolean) || null;
  const [activeKey, setActiveKey] = useState(endpoints[0]?.key || "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<ApiPayload>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [presentationCurrency, setPresentationCurrency] = useState("");
  const [valuationMethod, setValuationMethod] = useState("WEIGHTED_AVERAGE");
  const [tolerance, setTolerance] = useState("0.01");
  const [automaticPosting, setAutomaticPosting] = useState(false);
  const [statementType, setStatementType] = useState("TRIAL_BALANCE");
  const [statementStart, setStatementStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [statementEnd, setStatementEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [publishStatement, setPublishStatement] = useState(false);
  const activeEndpoint = endpoints.find((endpoint) => endpoint.key === activeKey) || endpoints[0];

  const load = useCallback(async () => {
    if (!activeEndpoint) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (status.trim()) params.set("status", status.trim());
      const response = await fetch(`/api/enterprise/${organizationId}/${activeEndpoint.path}?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || (language === "en" ? "Unable to load finance data." : "Chargement des données financières impossible."));
      setPayload(body);
      const config = body.configuration as Record<string, unknown> | null | undefined;
      if (config) {
        setCurrency(asText(config.functionalCurrencyCode) || "USD");
        setPresentationCurrency(asText(config.presentationCurrencyCode));
        setValuationMethod(asText(config.inventoryValuationMethod) || "WEIGHTED_AVERAGE");
        setTolerance(asText(config.reconciliationTolerance) || "0.01");
        setAutomaticPosting(Boolean(config.automaticPostingEnabled));
      }
    } catch (loadError) {
      setPayload({});
      setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [activeEndpoint, language, organizationId, page, search, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setSearch(""); setStatus(""); setPayload({}); }, [activeKey]);

  async function saveConfiguration() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const revision = Number(asText(payload.configuration?.revision)) || undefined;
      const response = await fetch(`/api/enterprise/${organizationId}/finance/configuration`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          functionalCurrencyCode: currency,
          presentationCurrencyCode: presentationCurrency || null,
          inventoryValuationMethod: valuationMethod,
          reconciliationTolerance: tolerance,
          automaticPostingEnabled: automaticPosting,
          revision,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Enregistrement impossible.");
      setNotice(language === "en" ? "Finance configuration saved." : "Configuration financière enregistrée.");
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  async function generateStatement() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/financial-statements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statementType, periodStart: statementStart, periodEnd: statementEnd, currencyCode: currency, publish: publishStatement }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Génération impossible.");
      setNotice(language === "en" ? "Financial statement generated." : "État financier généré.");
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Génération impossible."); }
    finally { setSaving(false); }
  }

  const items = payload.items || [];
  const pageCount = Math.max(1, payload.pagination?.pageCount || 1);
  const endpointLabel = activeEndpoint ? (language === "en" ? activeEndpoint.labelEn : activeEndpoint.labelFr) : "Finance";

  if (!activeEndpoint) return <div className="p-6">Module financier non configuré.</div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8">
      <header className="rounded-3xl border bg-card/70 p-5 shadow-sm backdrop-blur sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{organizationName} · {language === "en" ? "Finance" : "Finances"}</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{language === "en" ? definition.labelEn : definition.labelFr}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">{language === "en" ? definition.descriptionEn : definition.descriptionFr}</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="self-start rounded-full lg:self-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {language === "en" ? "Refresh" : "Actualiser"}
          </Button>
        </div>
      </header>

      <nav className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Finance workspace sections">
        {endpoints.map((endpoint) => (
          <button key={endpoint.key} type="button" onClick={() => setActiveKey(endpoint.key)} className={`shrink-0 snap-start rounded-full border px-4 py-2 text-sm font-medium transition ${endpoint.key === activeEndpoint.key ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
            {language === "en" ? endpoint.labelEn : endpoint.labelFr}
          </button>
        ))}
      </nav>

      {payload.checklist ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(payload.checklist).map(([key, valid]) => (
            <article key={key} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                {valid ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
                <div><p className="text-sm font-medium">{metricLabel(key)}</p><p className="mt-1 text-xs text-muted-foreground">{valid ? (language === "en" ? "Configured" : "Configuré") : (language === "en" ? "Required" : "À configurer")}</p></div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {payload.metrics && Object.keys(payload.metrics).length ? (
        <section className="flex snap-x gap-3 overflow-x-auto pb-2" aria-label="Finance KPIs">
          {Object.entries(payload.metrics).map(([key, value]) => (
            <article key={key} className="min-w-44 snap-start rounded-2xl border bg-card p-4"><p className="text-xs font-medium text-muted-foreground">{metricLabel(key)}</p><p className="mt-2 text-xl font-semibold">{asText(value) || "0"}</p></article>
          ))}
        </section>
      ) : null}

      {definition.code === "FINANCE_OVERVIEW" && canManage ? (
        <section className="rounded-3xl border bg-card/70 p-5 sm:p-6">
          <div className="flex items-center gap-3"><Settings2 className="h-5 w-5" /><div><h2 className="font-semibold">{language === "en" ? "Finance configuration" : "Configuration financière"}</h2><p className="text-sm text-muted-foreground">{language === "en" ? "The functional currency becomes controlled after the first posted entries." : "La devise fonctionnelle devient contrôlée après les premières écritures comptabilisées."}</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">{language === "en" ? "Functional currency" : "Devise fonctionnelle"}<Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1" /></label>
            <label className="text-sm">{language === "en" ? "Presentation currency" : "Devise de présentation"}<Input value={presentationCurrency} maxLength={3} onChange={(event) => setPresentationCurrency(event.target.value.toUpperCase())} className="mt-1" /></label>
            <label className="text-sm">{language === "en" ? "Inventory valuation" : "Valorisation du stock"}<select value={valuationMethod} onChange={(event) => setValuationMethod(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="WEIGHTED_AVERAGE">{language === "en" ? "Weighted average" : "Coût moyen pondéré"}</option><option value="FIFO">FIFO</option></select></label>
            <label className="text-sm">{language === "en" ? "Reconciliation tolerance" : "Tolérance de rapprochement"}<Input value={tolerance} inputMode="decimal" onChange={(event) => setTolerance(event.target.value)} className="mt-1" /></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={automaticPosting} onChange={(event) => setAutomaticPosting(event.target.checked)} />{language === "en" ? "Enable automatic posting after required approvals" : "Activer la comptabilisation automatique après les validations requises"}</label>
          <Button className="mt-5 rounded-full" onClick={() => void saveConfiguration()} disabled={saving}>{saving ? (language === "en" ? "Saving…" : "Enregistrement…") : (language === "en" ? "Save configuration" : "Enregistrer la configuration")}</Button>
        </section>
      ) : null}

      {definition.code === "FINANCE_STATEMENTS" && canManage ? (
        <section className="rounded-3xl border bg-card/70 p-5 sm:p-6">
          <h2 className="font-semibold">{language === "en" ? "Generate a financial statement" : "Générer un état financier"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Type<select value={statementType} onChange={(event) => setStatementType(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="TRIAL_BALANCE">{language === "en" ? "Trial balance" : "Balance générale"}</option><option value="GENERAL_LEDGER">{language === "en" ? "General ledger" : "Grand livre"}</option><option value="JOURNALS">{language === "en" ? "Journals" : "Journaux"}</option><option value="INCOME_STATEMENT">{language === "en" ? "Income statement" : "Compte de résultat"}</option><option value="BALANCE_SHEET">{language === "en" ? "Balance sheet" : "Bilan"}</option><option value="CASH_FLOW">{language === "en" ? "Cash flow" : "Tableau des flux de trésorerie"}</option><option value="TREASURY">{language === "en" ? "Treasury statement" : "Situation de trésorerie"}</option><option value="AR_AGING">{language === "en" ? "Aged receivables" : "Ancienneté des créances"}</option><option value="AP_AGING">{language === "en" ? "Aged payables" : "Ancienneté des dettes"}</option><option value="BUDGET_VS_ACTUAL">{language === "en" ? "Budget vs actual" : "Budget comparé au réalisé"}</option><option value="TAX">{language === "en" ? "Tax summary" : "Synthèse fiscale"}</option><option value="ASSET_REGISTER">{language === "en" ? "Asset register" : "Registre des actifs"}</option><option value="INVENTORY_VALUATION">{language === "en" ? "Inventory valuation" : "Valorisation du stock"}</option></select></label>
            <label className="text-sm">{language === "en" ? "Start" : "Début"}<Input type="date" value={statementStart} onChange={(event) => setStatementStart(event.target.value)} className="mt-1" /></label>
            <label className="text-sm">{language === "en" ? "End" : "Fin"}<Input type="date" value={statementEnd} onChange={(event) => setStatementEnd(event.target.value)} className="mt-1" /></label>
            <label className="text-sm">{language === "en" ? "Currency" : "Devise"}<Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1" /></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={publishStatement} onChange={(event) => setPublishStatement(event.target.checked)} />{language === "en" ? "Publish immutable snapshot" : "Publier une version non modifiable"}</label>
          <Button className="mt-5 rounded-full" onClick={() => void generateStatement()} disabled={saving}>{saving ? (language === "en" ? "Generating…" : "Génération…") : (language === "en" ? "Generate" : "Générer")}</Button>
        </section>
      ) : null}

      {notice ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">{notice}</div> : null}
      {error ? <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}

      {definition.code !== "FINANCE_OVERVIEW" ? (
        <section className="rounded-3xl border bg-card/70 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div><h2 className="text-lg font-semibold">{endpointLabel}</h2><p className="text-sm text-muted-foreground">{language === "en" ? "Posted, approved and draft records remain separated by status and organization." : "Les éléments comptabilisés, approuvés et brouillons restent séparés par statut et entreprise."}</p></div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
              <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={language === "en" ? "Search…" : "Rechercher…"} className="rounded-full pl-9" /></div>
              <Input value={status} onChange={(event) => { setStatus(event.target.value.toUpperCase()); setPage(1); }} placeholder={language === "en" ? "Status" : "Statut"} className="rounded-full sm:w-40" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {loading && items.length === 0 ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />) : items.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center"><Database className="h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">{language === "en" ? "No finance data" : "Aucune donnée financière"}</p><p className="mt-1 text-sm text-muted-foreground">{language === "en" ? "Authorized transactions will appear here." : "Les opérations autorisées apparaîtront ici."}</p></div>
            ) : items.map((item) => {
              const itemId = asText(item.id);
              const highlighted = Boolean(deepLinkId && itemId === deepLinkId);
              return (
                <article id={`finance-${itemId}`} key={itemId} className={`rounded-2xl border bg-background/60 p-4 transition ${highlighted ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/40"}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="truncate font-semibold">{titleFor(item)}</h3>{subtitleFor(item) ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitleFor(item)}</p> : null}</div><div className="flex shrink-0 flex-wrap items-center gap-2">{moneyFor(item, language) ? <span className="text-sm font-semibold tabular-nums">{moneyFor(item, language)}</span> : null}{asText(item.status) ? <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{asText(item.status)}</span> : null}{dateFor(item, language) ? <span className="text-xs text-muted-foreground">{dateFor(item, language)}</span> : null}</div></div>
                </article>
              );
            })}
          </div>
          <footer className="mt-5 flex items-center justify-between border-t pt-4"><p className="text-xs text-muted-foreground">{payload.pagination?.total ?? items.length} {language === "en" ? "item(s)" : "élément(s)"}</p><div className="flex items-center gap-2"><Button variant="outline" size="icon" className="rounded-full" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-20 text-center text-sm">{page} / {pageCount}</span><Button variant="outline" size="icon" className="rounded-full" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button></div></footer>
        </section>
      ) : null}
    </div>
  );
}
