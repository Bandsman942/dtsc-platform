"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialStatementReportDialog } from "@/components/reports/financial-statement-report-dialog";
import { Input } from "@/components/ui/input";
import {
  financeDate,
  financeEnumLabel,
  financeMoney,
  financeStatusLabel,
  financeStatusTone,
  safeFinanceError,
  type FinanceLocale,
} from "@/components/enterprise/professional/finance-professional-ui";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Item = Record<string, unknown> & { id: string; status?: string; revision?: number };
type Pagination = { page: number; pageSize: number; total: number; pageCount: number };
type Payload = {
  items?: Item[];
  metrics?: Record<string, number>;
  pagination?: Pagination;
  availableAssets?: Item[];
  scope?: string;
  valuationMethod?: string;
  disclaimer?: string;
};
type LookupState = { charts: Item[]; years: Item[]; periods: Item[]; journals: Item[]; accounts: Item[]; assets: Item[] };
type FormState = Record<string, string | boolean>;
type SectionDefinition = { key: string; labelFr: string; labelEn: string; endpoint: string };
type Props = { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; definition: EnterpriseModuleDefinition; locale?: string | null; canManage: boolean };

const EMPTY_LOOKUPS: LookupState = { charts: [], years: [], periods: [], journals: [], accounts: [], assets: [] };
const EMPTY_SECTIONS: SectionDefinition[] = [];
const EMPTY_ITEMS: Item[] = [];
const DEFAULT_FORM: FormState = {
  code: "", nameFr: "", nameEn: "", startDate: "", endDate: "", fiscalYearId: "", chartId: "", parentId: "",
  accountType: "ASSET", accountSubtype: "", currencyCode: "USD", isControlAccount: false, allowDirectPosting: true,
  journalType: "GENERAL", sequencePrefix: "", requiresApproval: true, journalId: "", fiscalPeriodId: "", accountingDate: "",
  reference: "", description: "", debitAccountId: "", creditAccountId: "", amount: "", category: "VAT", jurisdiction: "",
  payableAccountId: "", recoverableAccountId: "", rate: "", effectiveFrom: "", statementType: "TRIAL_BALANCE",
  periodStart: "", periodEnd: "", publish: false, assetId: "", originalCost: "", residualValue: "0", usefulLifeMonths: "60",
  inServiceDate: "", assetAccountId: "", accumulatedDepreciationAccountId: "", depreciationExpenseAccountId: "",
  capitalizationSourceType: "OPERATIONAL_ASSET", throughDate: "", reason: "",
};

const SECTIONS: Record<string, SectionDefinition[]> = {
  FINANCE_ACCOUNTING: [
    { key: "overview", labelFr: "Vue d’ensemble", labelEn: "Overview", endpoint: "accounting-professional?view=overview" },
    { key: "charts", labelFr: "Plans comptables", labelEn: "Charts of accounts", endpoint: "charts-of-accounts" },
    { key: "accounts", labelFr: "Comptes", labelEn: "Accounts", endpoint: "ledger-accounts" },
    { key: "years", labelFr: "Exercices", labelEn: "Fiscal years", endpoint: "fiscal-years" },
    { key: "periods", labelFr: "Périodes", labelEn: "Periods", endpoint: "fiscal-periods" },
    { key: "journals", labelFr: "Journaux", labelEn: "Journals", endpoint: "journals" },
    { key: "entries", labelFr: "Écritures", labelEn: "Journal entries", endpoint: "journal-entries" },
    { key: "ledger", labelFr: "Grand livre", labelEn: "General ledger", endpoint: "accounting-professional?view=general-ledger" },
    { key: "trial", labelFr: "Balance générale", labelEn: "Trial balance", endpoint: "accounting-professional?view=trial-balance" },
    { key: "rules", labelFr: "Règles de comptabilisation", labelEn: "Posting rules", endpoint: "accounting-professional?view=posting-rules" },
    { key: "anomalies", labelFr: "Anomalies", labelEn: "Anomalies", endpoint: "accounting-professional?view=anomalies" },
  ],
  FINANCE_TAX: [{ key: "taxes", labelFr: "Codes et taux fiscaux", labelEn: "Tax codes and rates", endpoint: "taxes" }],
  FINANCE_CLOSE: [{ key: "close", labelFr: "Clôtures financières", labelEn: "Financial closes", endpoint: "financial-close" }],
  FINANCE_STATEMENTS: [{ key: "statements", labelFr: "Versions générées et publiées", labelEn: "Generated and published versions", endpoint: "financial-statements" }],
  FINANCE_ASSETS: [{ key: "assets", labelFr: "Registre des immobilisations", labelEn: "Fixed asset register", endpoint: "asset-accounting" }],
  FINANCE_INVENTORY: [{ key: "inventory", labelFr: "Valorisation du stock", labelEn: "Inventory valuation", endpoint: "inventory-valuation" }],
};

const BUSINESS_LABELS: Record<string, { fr: string; en: string }> = {
  ASSET: { fr: "Actif", en: "Asset" }, LIABILITY: { fr: "Passif", en: "Liability" }, EQUITY: { fr: "Capitaux propres", en: "Equity" },
  REVENUE: { fr: "Produits", en: "Revenue" }, EXPENSE: { fr: "Charges", en: "Expense" }, OTHER_INCOME: { fr: "Autres produits", en: "Other income" },
  OTHER_EXPENSE: { fr: "Autres charges", en: "Other expense" }, GENERAL: { fr: "Opérations diverses", en: "General" }, SALES: { fr: "Ventes", en: "Sales" },
  PURCHASES: { fr: "Achats", en: "Purchases" }, PAYROLL: { fr: "Paie", en: "Payroll" }, INVENTORY: { fr: "Stock", en: "Inventory" },
  ASSETS: { fr: "Immobilisations", en: "Fixed assets" }, TAX: { fr: "Fiscalité", en: "Tax" }, OPENING: { fr: "Ouverture", en: "Opening" },
  ADJUSTMENT: { fr: "Ajustement", en: "Adjustment" }, TRIAL_BALANCE: { fr: "Balance générale", en: "Trial balance" }, GENERAL_LEDGER: { fr: "Grand livre", en: "General ledger" },
  JOURNALS: { fr: "Journaux", en: "Journals" }, INCOME_STATEMENT: { fr: "Compte de résultat", en: "Income statement" }, BALANCE_SHEET: { fr: "Bilan", en: "Balance sheet" },
  CASH_FLOW: { fr: "Tableau des flux de trésorerie", en: "Cash flow statement" }, ASSET_REGISTER: { fr: "Registre des immobilisations", en: "Fixed asset register" },
  INVENTORY_VALUATION: { fr: "Valorisation du stock", en: "Inventory valuation" }, VAT: { fr: "Taxe sur la valeur ajoutée", en: "Value-added tax" },
  SALES_TAX: { fr: "Taxe sur les ventes", en: "Sales tax" }, WITHHOLDING: { fr: "Retenue à la source", en: "Withholding tax" }, EXEMPT: { fr: "Exonéré", en: "Exempt" },
  ZERO_RATED: { fr: "Taux zéro", en: "Zero-rated" }, STRAIGHT_LINE: { fr: "Linéaire", en: "Straight-line" }, WEIGHTED_AVERAGE: { fr: "Coût moyen pondéré", en: "Weighted average" },
  unbalancedPostedEntries: { fr: "Écritures comptabilisées déséquilibrées", en: "Unbalanced posted entries" },
  criticalJournalDrafts: { fr: "Écritures non finalisées", en: "Non-final journal entries" },
  failedPostingBatches: { fr: "Comptabilisations en échec", en: "Failed posting batches" },
  openCashSessions: { fr: "Sessions de caisse ouvertes", en: "Open cash sessions" },
  pendingReconciliations: { fr: "Rapprochements à terminer", en: "Pending reconciliations" },
  nonFinalSalesInvoices: { fr: "Factures clients non finalisées", en: "Non-final sales invoices" },
  nonFinalSupplierInvoices: { fr: "Factures fournisseurs non finalisées", en: "Non-final supplier invoices" },
  unreconciledTreasuryTransactions: { fr: "Opérations de trésorerie non rapprochées", en: "Unreconciled treasury transactions" },
  approvedPayrollRuns: { fr: "Paies approuvées non comptabilisées", en: "Approved payroll runs not posted" },
  unresolvedClearingAccounts: { fr: "Comptes d’attente non soldés", en: "Unresolved clearing accounts" },
};

function businessLabel(value: unknown, locale: FinanceLocale) {
  const valueText = String(value || "");
  if (!valueText) return "";
  const known = BUSINESS_LABELS[valueText];
  if (known) return locale === "fr" ? known.fr : known.en;
  const financeKnown = financeEnumLabel(valueText, locale);
  if (financeKnown !== valueText) return financeKnown;
  return valueText.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function text(item: Item, key: string) { const value = item[key]; return value === null || value === undefined ? "" : String(value); }
function nestedText(item: Item, parent: string, key: string) { const value = item[parent]; return value && typeof value === "object" && key in value ? String((value as Record<string, unknown>)[key] || "") : ""; }
function endpointWithQuery(base: string, page: number, search: string, status: string) {
  const separator = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (search.trim()) params.set("search", search.trim());
  if (status.trim()) params.set("status", status.trim());
  return `${base}${separator}${params.toString()}`;
}
async function requestJson(endpoint: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const response = await fetch(endpoint, { method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(payload?.message || payload?.error || "L’opération comptable n’a pas pu être terminée."));
  return payload || {};
}
function today() { return new Date().toISOString().slice(0, 10); }

function itemTitle(item: Item, activeKey: string, locale: FinanceLocale) {
  if (activeKey === "assets") return nestedText(item, "asset", "name") || nestedText(item, "asset", "code") || (locale === "fr" ? "Immobilisation" : "Fixed asset");
  if (activeKey === "ledger") return `${text(item, "accountCode")} · ${locale === "fr" ? text(item, "accountNameFr") : text(item, "accountNameEn")}`;
  if (activeKey === "trial") return `${text(item, "code")} · ${locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}`;
  if (activeKey === "rules") return text(item, "mappingKey");
  if (activeKey === "anomalies") return text(item, "reference") || businessLabel(item.postingEvent, locale);
  if (activeKey === "inventory") return text(item, "inventoryItemName") || text(item, "itemName") || text(item, "inventoryItemId") || (locale === "fr" ? "Article valorisé" : "Valued item");
  if (activeKey === "statements") return businessLabel(item.statementType, locale);
  return text(item, "number") || text(item, "code") || text(item, "nameFr") || text(item, "nameEn") || text(item, "reference") || (locale === "fr" ? "Élément comptable" : "Accounting item");
}
function itemDescription(item: Item, activeKey: string, locale: FinanceLocale) {
  if (activeKey === "entries") return `${nestedText(item, "journal", "code")} · ${nestedText(item, "fiscalPeriod", "code")} · ${text(item, "description")}`;
  if (activeKey === "accounts") return `${businessLabel(item.accountType, locale)}${item.accountSubtype ? ` · ${businessLabel(item.accountSubtype, locale)}` : ""}`;
  if (activeKey === "periods") return `${financeDate(item.startDate, locale)} → ${financeDate(item.endDate, locale)} · ${nestedText(item, "fiscalYear", "code")}`;
  if (activeKey === "years") return `${financeDate(item.startDate, locale)} → ${financeDate(item.endDate, locale)}`;
  if (activeKey === "journals") return `${businessLabel(item.journalType, locale)}${item.requiresApproval ? ` · ${locale === "fr" ? "Validation indépendante" : "Independent approval"}` : ""}`;
  if (activeKey === "ledger") return `${financeDate(item.accountingDate, locale)} · ${text(item, "journalCode")} · ${text(item, "description")}`;
  if (activeKey === "trial") return businessLabel(item.accountType, locale);
  if (activeKey === "rules") return `${text(item, "sourceModule")} · ${text(item, "accountCode")} ${locale === "fr" ? text(item, "accountNameFr") : text(item, "accountNameEn")}`;
  if (activeKey === "anomalies") return `${businessLabel(item.postingEvent, locale)} · ${text(item, "errorCode") || (locale === "fr" ? "Erreur de comptabilisation" : "Posting error")}`;
  if (activeKey === "taxes") return `${businessLabel(item.category, locale)}${item.jurisdiction ? ` · ${text(item, "jurisdiction")}` : ""}`;
  if (activeKey === "close") return nestedText(item, "fiscalPeriod", "code");
  if (activeKey === "statements") return `${financeDate(item.periodStart, locale)} → ${financeDate(item.periodEnd, locale)} · ${text(item, "currencyCode")}`;
  if (activeKey === "assets") return `${businessLabel(item.depreciationMethod, locale)} · ${text(item, "usefulLifeMonths")} ${locale === "fr" ? "mois" : "months"}`;
  if (activeKey === "inventory") return `${text(item, "quantity")} × ${financeMoney(item.weightedAverageUnitCost, text(item, "currencyCode") || "USD", locale)}`;
  return text(item, "description") || text(item, "nameEn") || "";
}
function amountSummary(item: Item, activeKey: string, locale: FinanceLocale) {
  const currency = text(item, "currencyCode") || text(item, "functionalCurrencyCode") || "USD";
  if (activeKey === "entries") return `${financeMoney(item.totalDebit, currency, locale)} = ${financeMoney(item.totalCredit, currency, locale)}`;
  if (activeKey === "ledger") return `${locale === "fr" ? "Débit" : "Debit"} ${financeMoney(item.debit, currency, locale)} · ${locale === "fr" ? "Crédit" : "Credit"} ${financeMoney(item.credit, currency, locale)}`;
  if (activeKey === "trial") return `${locale === "fr" ? "Solde" : "Balance"} ${financeMoney(item.balance, currency, locale)}`;
  if (activeKey === "assets") return financeMoney(item.originalCost, currency, locale);
  if (activeKey === "inventory") return financeMoney(item.value, currency, locale);
  return "";
}

export function EnterpriseAdvancedFinanceWorkspace({ organizationId, organizationName, organizationLogoUrl, definition, locale: rawLocale, canManage }: Props) {
  const locale: FinanceLocale = rawLocale === "en" ? "en" : "fr";
  const sections = SECTIONS[definition.code] || EMPTY_SECTIONS;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requestedTab = searchParams.get("tab");
  const defaultKey = requestedTab && sections.some((section) => section.key === requestedTab) ? requestedTab : sections[0]?.key || "overview";
  const [activeKey, setActiveKey] = useState(defaultKey);
  const activeSection = sections.find((section) => section.key === activeKey) || sections[0];
  const [payload, setPayload] = useState<Payload>({ items: [], pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 } });
  const [lookups, setLookups] = useState<LookupState>(EMPTY_LOOKUPS);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, accountingDate: today(), throughDate: today(), inServiceDate: today(), effectiveFrom: today(), periodStart: today(), periodEnd: today() });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reversalEntryId, setReversalEntryId] = useState("");
  const [reopenClose, setReopenClose] = useState<Item | null>(null);

  const resetSectionState = useCallback(() => {
    setPage(1); setSearch(""); setStatus(""); setShowForm(false); setReversalEntryId(""); setReopenClose(null);
  }, []);

  useEffect(() => {
    const nextKey = requestedTab && sections.some((section) => section.key === requestedTab) ? requestedTab : sections[0]?.key || "overview";
    if (nextKey !== activeKey) { setActiveKey(nextKey); resetSectionState(); }
  }, [activeKey, requestedTab, resetSectionState, sections]);

  function selectSection(key: string) {
    setActiveKey(key);
    resetSectionState();
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const load = useCallback(async () => {
    if (!activeSection) return;
    setLoading(true); setError("");
    try {
      const endpoint = `/api/enterprise/${organizationId}/${endpointWithQuery(activeSection.endpoint, page, search, status)}`;
      const body = await requestJson(endpoint) as Payload;
      setPayload({ ...body, items: Array.isArray(body.items) ? body.items : [], pagination: body.pagination || { page: 1, pageSize: 25, total: Array.isArray(body.items) ? body.items.length : 0, pageCount: 1 } });
      if (Array.isArray(body.availableAssets)) setLookups((current) => ({ ...current, assets: body.availableAssets || [] }));
    } catch (loadError) {
      setPayload({ items: [], pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 } });
      setError(safeFinanceError(loadError, locale === "fr" ? "Chargement comptable impossible." : "Unable to load accounting data."));
    } finally { setLoading(false); }
  }, [activeSection, locale, organizationId, page, search, status]);

  const loadLookups = useCallback(async () => {
    const base = `/api/enterprise/${organizationId}`;
    const requests = await Promise.allSettled([
      requestJson(`${base}/charts-of-accounts`), requestJson(`${base}/fiscal-years`), requestJson(`${base}/fiscal-periods`),
      requestJson(`${base}/journals`), requestJson(`${base}/ledger-accounts?page=1&pageSize=500`), requestJson(`${base}/asset-accounting?page=1&pageSize=250`),
    ]);
    const itemsAt = (index: number) => requests[index].status === "fulfilled" && Array.isArray((requests[index] as PromiseFulfilledResult<Record<string, unknown>>).value.items) ? ((requests[index] as PromiseFulfilledResult<Record<string, unknown>>).value.items as Item[]) : [];
    const assetValue = requests[5].status === "fulfilled" ? (requests[5] as PromiseFulfilledResult<Record<string, unknown>>).value.availableAssets : [];
    setLookups({ charts: itemsAt(0), years: itemsAt(1), periods: itemsAt(2), journals: itemsAt(3), accounts: itemsAt(4), assets: Array.isArray(assetValue) ? assetValue as Item[] : [] });
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLookups(); }, [loadLookups]);

  const items = payload.items || EMPTY_ITEMS;
  const pagination = payload.pagination || { page: 1, pageSize: 25, total: items.length, pageCount: 1 };
  const metrics = useMemo(() => {
    if (payload.metrics && Object.keys(payload.metrics).length) return payload.metrics;
    const counts: Record<string, number> = {};
    for (const item of items) { const key = text(item, "status") || "TOTAL"; counts[key] = (counts[key] || 0) + 1; }
    return counts;
  }, [items, payload.metrics]);

  function updateForm(key: string, value: string | boolean) { setForm((current) => ({ ...current, [key]: value })); }
  async function mutate(endpoint: string, body: unknown, success: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      await requestJson(endpoint, "POST", body); setNotice(success); setShowForm(false); setReversalEntryId(""); setReopenClose(null); await Promise.all([load(), loadLookups()]);
    } catch (mutationError) { setError(safeFinanceError(mutationError, locale === "fr" ? "Action comptable impossible." : "Accounting action failed.")); }
    finally { setSaving(false); }
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    const base = `/api/enterprise/${organizationId}`;
    if (reopenClose) { await mutate(`${base}/financial-close/${reopenClose.id}/transition`, { action: "REOPEN", reason: form.reason, revision: reopenClose.revision }, locale === "fr" ? "Période réouverte avec motif et piste d’audit." : "Period reopened with reason and audit trail."); return; }
    if (reversalEntryId) { await mutate(`${base}/journal-entries/${reversalEntryId}/reverse`, { accountingDate: form.accountingDate, reason: form.reason }, locale === "fr" ? "Écriture contrepassée sans modifier l’original." : "Entry reversed without modifying the original."); return; }
    if (activeKey === "charts") await mutate(`${base}/charts-of-accounts`, { code: form.code, nameFr: form.nameFr, nameEn: form.nameEn }, locale === "fr" ? "Plan comptable créé." : "Chart of accounts created.");
    else if (activeKey === "years") await mutate(`${base}/fiscal-years`, { code: form.code, startDate: form.startDate, endDate: form.endDate }, locale === "fr" ? "Exercice créé." : "Fiscal year created.");
    else if (activeKey === "periods") await mutate(`${base}/fiscal-periods`, { fiscalYearId: form.fiscalYearId, code: form.code, startDate: form.startDate, endDate: form.endDate }, locale === "fr" ? "Période créée." : "Period created.");
    else if (activeKey === "accounts") await mutate(`${base}/ledger-accounts`, { chartId: form.chartId, parentId: form.parentId || undefined, code: form.code, nameFr: form.nameFr, nameEn: form.nameEn, accountType: form.accountType, accountSubtype: form.accountSubtype || undefined, currencyCode: form.currencyCode || undefined, isControlAccount: Boolean(form.isControlAccount), isSystemAccount: false, allowDirectPosting: Boolean(form.allowDirectPosting) }, locale === "fr" ? "Compte créé." : "Account created.");
    else if (activeKey === "journals") await mutate(`${base}/journals`, { code: form.code, nameFr: form.nameFr, nameEn: form.nameEn, journalType: form.journalType, sequencePrefix: form.sequencePrefix || undefined, requiresApproval: Boolean(form.requiresApproval) }, locale === "fr" ? "Journal créé." : "Journal created.");
    else if (activeKey === "entries") await mutate(`${base}/journal-entries`, { journalId: form.journalId, fiscalPeriodId: form.fiscalPeriodId, accountingDate: form.accountingDate, reference: form.reference || undefined, description: form.description, idempotencyKey: `${organizationId}:manual-entry:${Date.now()}`, lines: [{ ledgerAccountId: form.debitAccountId, debit: form.amount, credit: "0", transactionCurrencyCode: form.currencyCode, transactionAmount: form.amount }, { ledgerAccountId: form.creditAccountId, debit: "0", credit: form.amount, transactionCurrencyCode: form.currencyCode, transactionAmount: form.amount }] }, locale === "fr" ? "Écriture équilibrée créée." : "Balanced journal entry created.");
    else if (activeKey === "taxes") await mutate(`${base}/taxes`, { code: form.code, nameFr: form.nameFr, nameEn: form.nameEn, category: form.category, jurisdiction: form.jurisdiction || undefined, payableAccountId: form.payableAccountId || undefined, recoverableAccountId: form.recoverableAccountId || undefined, roundingRule: "HALF_UP", rate: form.rate, effectiveFrom: form.effectiveFrom }, locale === "fr" ? "Code fiscal et taux historisé créés." : "Tax code and effective rate created.");
    else if (activeKey === "close") await mutate(`${base}/financial-close`, { fiscalPeriodId: form.fiscalPeriodId }, locale === "fr" ? "Checklist de clôture préparée." : "Closing checklist prepared.");
    else if (activeKey === "statements") await mutate(`${base}/financial-statements`, { statementType: form.statementType, periodStart: form.periodStart, periodEnd: form.periodEnd, currencyCode: form.currencyCode, publish: Boolean(form.publish) }, Boolean(form.publish) ? (locale === "fr" ? "Version publiée et non modifiable créée." : "Immutable published version created.") : (locale === "fr" ? "Aperçu financier généré." : "Financial preview generated."));
    else if (activeKey === "assets") await mutate(`${base}/asset-accounting`, { assetId: form.assetId, capitalizationSourceType: form.capitalizationSourceType, currencyCode: form.currencyCode, originalCost: form.originalCost, residualValue: form.residualValue, usefulLifeMonths: Number(form.usefulLifeMonths), inServiceDate: form.inServiceDate, assetAccountId: form.assetAccountId, accumulatedDepreciationAccountId: form.accumulatedDepreciationAccountId, depreciationExpenseAccountId: form.depreciationExpenseAccountId }, locale === "fr" ? "Actif capitalisé et plan d’amortissement créé." : "Asset capitalized and depreciation schedule created.");
    else if (activeKey === "inventory") await mutate(`${base}/financial-statements`, { statementType: "INVENTORY_VALUATION", periodStart: form.periodStart, periodEnd: form.periodEnd, currencyCode: form.currencyCode, publish: true }, locale === "fr" ? "Valorisation publiée et verrouillée comme version non modifiable." : "Valuation published as an immutable version.");
  }

  async function transitionEntry(item: Item, action: "SUBMIT" | "APPROVE" | "REJECT" | "POST") {
    const reason = action === "REJECT" ? (form.reason || (locale === "fr" ? "Correction requise" : "Correction required")) : undefined;
    await mutate(`/api/enterprise/${organizationId}/journal-entries/${item.id}/transition`, { action, reason, revision: item.revision }, locale === "fr" ? "Workflow de l’écriture mis à jour." : "Journal entry workflow updated.");
  }
  async function transitionClose(item: Item, action: "SUBMIT" | "APPROVE" | "CLOSE") {
    await mutate(`/api/enterprise/${organizationId}/financial-close/${item.id}/transition`, { action, revision: item.revision }, action === "SUBMIT" && item.status === "BLOCKED" ? (locale === "fr" ? "Checklist recalculée après correction des blocages." : "Checklist recalculated after blockers were addressed.") : (locale === "fr" ? "Workflow de clôture mis à jour." : "Financial close workflow updated."));
  }
  async function openFiscalYearItem(item: Item) {
    await mutate(`/api/enterprise/${organizationId}/fiscal-years/${item.id}/open`, { revision: item.revision }, locale === "fr" ? "Exercice financier ouvert. Les périodes ouvertes peuvent maintenant recevoir des écritures." : "Fiscal year opened. Open periods can now receive postings.");
  }
  async function runDepreciation() { await mutate(`/api/enterprise/${organizationId}/asset-depreciation/run`, { throughDate: form.throughDate }, locale === "fr" ? "Amortissements exigibles comptabilisés de manière idempotente." : "Due depreciation posted idempotently."); }

  const actionAvailable = canManage && ["charts", "accounts", "years", "periods", "journals", "entries", "taxes", "close", "statements", "assets", "inventory"].includes(activeKey);
  const sectionDescription = activeKey === "close"
    ? (locale === "fr" ? "Corrigez les blocages puis recalculez la checklist. Après soumission, l’approbation et la fermeture doivent être réalisées par un autre utilisateur autorisé." : "Address blockers, then recalculate the checklist. After submission, approval and closing must be performed by another authorized user.")
    : (locale === "fr" ? "Données filtrées par entreprise, paginées côté serveur et présentées en langage métier." : "Organization-scoped, server-paginated data presented in business language.");

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`${organizationName} · ${locale === "fr" ? "Finance avancée" : "Advanced finance"}`} title={locale === "fr" ? definition.labelFr : definition.labelEn} description={locale === "fr" ? "Workspace professionnel relié au moteur comptable unique : partie double, périodes, contrôles, publication et piste d’audit." : "Professional workspace connected to the single accounting engine: double-entry, periods, controls, publication, and audit trail."} primaryAction={actionAvailable ? <Button onClick={() => { setShowForm((current) => !current); setReversalEntryId(""); setReopenClose(null); }}><Plus className="h-4 w-4" />{showForm ? (locale === "fr" ? "Fermer" : "Close") : (locale === "fr" ? "Nouvelle action" : "New action")}</Button> : undefined} secondaryActions={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{locale === "fr" ? "Actualiser" : "Refresh"}</Button>} />

      <nav className="flex touch-pan-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={locale === "fr" ? "Sections comptables" : "Accounting sections"}>
        {sections.map((section) => <button key={section.key} type="button" onClick={() => selectSection(section.key)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${section.key === activeKey ? "border-dtsc-blue bg-dtsc-blue text-white" : "border-dtsc-border bg-dtsc-page text-dtsc-ink hover:bg-dtsc-soft"}`}>{locale === "fr" ? section.labelFr : section.labelEn}</button>)}
      </nav>

      {Object.keys(metrics).length ? <ModuleMetrics label={locale === "fr" ? "Indicateurs comptables" : "Accounting metrics"}>{Object.entries(metrics).slice(0, 8).map(([key, value]) => <ModuleMetric key={key} label={key === "TOTAL" ? "Total" : businessLabel(key, locale)} value={value} />)}</ModuleMetrics> : null}
      <ModuleToolbar search={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={locale === "fr" ? "Rechercher sans identifiant technique…" : "Search without technical identifiers…"} className="pl-9" /></div>} controls={<div className="flex min-w-0 flex-wrap gap-2"><Input value={status} onChange={(event) => { setStatus(event.target.value.toUpperCase()); setPage(1); }} placeholder={locale === "fr" ? "Statut" : "Status"} className="min-w-36 flex-1 sm:w-48" /><Button variant="outline" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}><RotateCcw className="h-4 w-4" />{locale === "fr" ? "Réinitialiser" : "Reset"}</Button></div>} summary={`${pagination.total} ${locale === "fr" ? "élément(s)" : "item(s)"}`} />
      {notice ? <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{notice}</span></div> : null}
      {error ? <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /><span>{error}</span></div> : null}
      {payload.disclaimer ? <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>{payload.disclaimer}</span></div> : null}

      {(showForm || reversalEntryId || reopenClose) && actionAvailable ? <ModuleSection title={reversalEntryId ? (locale === "fr" ? "Contrepasser l’écriture" : "Reverse journal entry") : reopenClose ? (locale === "fr" ? "Réouvrir la période" : "Reopen period") : (locale === "fr" ? "Action professionnelle" : "Professional action")} description={locale === "fr" ? "Les contrôles définitifs restent exécutés côté serveur." : "Final controls remain server-authoritative."}>
        <form onSubmit={submitForm} className="grid gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page/70 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {reversalEntryId ? <><Field label={locale === "fr" ? "Date autorisée" : "Authorized date"}><Input type="date" value={String(form.accountingDate)} onChange={(event) => updateForm("accountingDate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Motif détaillé" : "Detailed reason"} className="sm:col-span-2"><Input value={String(form.reason)} onChange={(event) => updateForm("reason", event.target.value)} minLength={8} required /></Field></> : reopenClose ? <Field label={locale === "fr" ? "Motif détaillé de réouverture" : "Detailed reopening reason"} className="sm:col-span-2 lg:col-span-3"><Input value={String(form.reason)} onChange={(event) => updateForm("reason", event.target.value)} minLength={8} required /></Field> : <ActionFields activeKey={activeKey} locale={locale} form={form} updateForm={updateForm} lookups={lookups} />}
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? (locale === "fr" ? "Traitement…" : "Processing…") : (locale === "fr" ? "Enregistrer" : "Save")}</Button><Button type="button" variant="outline" onClick={() => { setShowForm(false); setReversalEntryId(""); setReopenClose(null); }}>{locale === "fr" ? "Annuler" : "Cancel"}</Button>{activeKey === "assets" && !reversalEntryId ? <Button type="button" variant="outline" onClick={() => void runDepreciation()} disabled={saving}><Settings2 className="h-4 w-4" />{locale === "fr" ? "Exécuter les amortissements exigibles" : "Run due depreciation"}</Button> : null}</div>
        </form>
      </ModuleSection> : null}

      <ModuleContent>
        <ModuleSection title={activeSection ? (locale === "fr" ? activeSection.labelFr : activeSection.labelEn) : definition.labelFr} description={sectionDescription} count={pagination.total}>
          {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-dtsc-soft" />)}</div> : items.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-dtsc-border py-10 text-center"><BookOpen className="h-8 w-8 text-dtsc-muted" /><p className="mt-3 font-black text-dtsc-ink">{locale === "fr" ? "Aucune donnée pour cette vue" : "No data for this view"}</p><p className="mt-1 max-w-xl text-sm text-dtsc-muted">{locale === "fr" ? "Utilisez la prochaine action utile ou vérifiez les filtres. Aucun résultat technique artificiel n’est affiché." : "Use the next useful action or review filters. No artificial technical result is displayed."}</p></div> : <div className="divide-y divide-dtsc-border border-y border-dtsc-border">
            {items.map((item) => <article key={item.id || text(item, "inventoryItemId") + text(item, "warehouseId") + text(item, "currencyCode")} className="py-4 first:pt-0 last:pb-0"><div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="min-w-0 break-words font-black text-dtsc-ink">{itemTitle(item, activeKey, locale)}</h3>{item.status ? <StatusBadge tone={financeStatusTone(String(item.status))}>{financeStatusLabel(String(item.status), locale)}</StatusBadge> : null}</div><p className="mt-1 break-words text-sm text-dtsc-muted">{itemDescription(item, activeKey, locale)}</p>{amountSummary(item, activeKey, locale) ? <p className="mt-2 text-sm font-black tabular-nums text-dtsc-ink">{amountSummary(item, activeKey, locale)}</p> : null}<BusinessDetails item={item} activeKey={activeKey} locale={locale} /></div><div className="flex shrink-0 flex-wrap gap-2">
              {activeKey === "statements" && item.id ? <FinancialStatementReportDialog organizationId={organizationId} organizationName={organizationName} organizationLogoUrl={organizationLogoUrl} statementId={item.id} locale={rawLocale} /> : null}
              {activeKey === "years" && item.status === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => void openFiscalYearItem(item)}>{locale === "fr" ? "Ouvrir l’exercice" : "Open fiscal year"}</Button> : null}
              {activeKey === "entries" && item.status === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => void transitionEntry(item, "SUBMIT")}>{locale === "fr" ? "Soumettre" : "Submit"}</Button> : null}
              {activeKey === "entries" && item.status === "PENDING_APPROVAL" ? <><Button size="sm" onClick={() => void transitionEntry(item, "APPROVE")}>{locale === "fr" ? "Approuver" : "Approve"}</Button><Button size="sm" variant="outline" onClick={() => void transitionEntry(item, "REJECT")}>{locale === "fr" ? "Refuser" : "Reject"}</Button></> : null}
              {activeKey === "entries" && item.status === "APPROVED" ? <Button size="sm" onClick={() => void transitionEntry(item, "POST")}>{locale === "fr" ? "Comptabiliser" : "Post"}</Button> : null}
              {activeKey === "entries" && item.status === "POSTED" ? <Button size="sm" variant="outline" onClick={() => { setReversalEntryId(item.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{locale === "fr" ? "Contrepasser" : "Reverse"}</Button> : null}
              {activeKey === "close" && item.status === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => void transitionClose(item, "SUBMIT")}>{locale === "fr" ? "Soumettre" : "Submit"}</Button> : null}
              {activeKey === "close" && item.status === "BLOCKED" ? <Button size="sm" variant="outline" onClick={() => void transitionClose(item, "SUBMIT")}>{locale === "fr" ? "Recalculer la clôture" : "Recheck close"}</Button> : null}
              {activeKey === "close" && item.status === "PENDING_APPROVAL" ? <Button size="sm" onClick={() => void transitionClose(item, "APPROVE")}>{locale === "fr" ? "Approuver" : "Approve"}</Button> : null}
              {activeKey === "close" && item.status === "APPROVED" ? <Button size="sm" onClick={() => void transitionClose(item, "CLOSE")}>{locale === "fr" ? "Fermer la période" : "Close period"}</Button> : null}
              {activeKey === "close" && item.status === "CLOSED" ? <Button size="sm" variant="outline" onClick={() => { setForm((current) => ({ ...current, reason: "" })); setReopenClose(item); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{locale === "fr" ? "Demander la réouverture" : "Request reopening"}</Button> : null}
            </div></div></article>)}
          </div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4 text-sm text-dtsc-muted"><span>{locale === "fr" ? "Page" : "Page"} {pagination.page}/{pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>{locale === "fr" ? "Précédent" : "Previous"}</Button><Button variant="outline" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}>{locale === "fr" ? "Suivant" : "Next"}</Button></div></div>
        </ModuleSection>
      </ModuleContent>
    </ModuleWorkspace>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) { return <label className={`min-w-0 text-sm font-bold text-dtsc-ink ${className}`}>{label}<div className="mt-1.5">{children}</div></label>; }
function SelectField({ label, value, onChange, children, required = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; required?: boolean }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm">{children}</select></Field>; }

function ActionFields({ activeKey, locale, form, updateForm, lookups }: { activeKey: string; locale: FinanceLocale; form: FormState; updateForm: (key: string, value: string | boolean) => void; lookups: LookupState }) {
  if (activeKey === "charts") return <><Field label="Code"><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label="Libellé français"><Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required /></Field><Field label="English label"><Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required /></Field></>;
  if (activeKey === "years") return <><Field label={locale === "fr" ? "Code de l’exercice" : "Fiscal year code"}><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label={locale === "fr" ? "Début" : "Start"}><Input type="date" value={String(form.startDate)} onChange={(event) => updateForm("startDate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Fin" : "End"}><Input type="date" value={String(form.endDate)} onChange={(event) => updateForm("endDate", event.target.value)} required /></Field></>;
  if (activeKey === "periods") return <><SelectField label={locale === "fr" ? "Exercice" : "Fiscal year"} value={String(form.fiscalYearId)} onChange={(value) => updateForm("fiscalYearId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.years.map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {financeStatusLabel(text(item, "status"), locale)}</option>)}</SelectField><Field label={locale === "fr" ? "Code de période" : "Period code"}><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label={locale === "fr" ? "Début" : "Start"}><Input type="date" value={String(form.startDate)} onChange={(event) => updateForm("startDate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Fin" : "End"}><Input type="date" value={String(form.endDate)} onChange={(event) => updateForm("endDate", event.target.value)} required /></Field></>;
  if (activeKey === "accounts") return <><SelectField label={locale === "fr" ? "Plan comptable" : "Chart of accounts"} value={String(form.chartId)} onChange={(value) => updateForm("chartId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.charts.map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><Field label={locale === "fr" ? "Code du compte" : "Account code"}><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label="Libellé français"><Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required /></Field><Field label="English label"><Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required /></Field><SelectField label="Type" value={String(form.accountType)} onChange={(value) => updateForm("accountType", value)} required>{["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"].map((value) => <option key={value} value={value}>{businessLabel(value, locale)}</option>)}</SelectField><SelectField label={locale === "fr" ? "Compte parent" : "Parent account"} value={String(form.parentId)} onChange={(value) => updateForm("parentId", value)}><option value="">{locale === "fr" ? "Aucun" : "None"}</option>{lookups.accounts.filter((item) => text(item, "accountType") === String(form.accountType)).map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><Field label={locale === "fr" ? "Devise éventuelle" : "Optional currency"}><Input value={String(form.currencyCode)} maxLength={3} onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase())} /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(form.allowDirectPosting)} onChange={(event) => updateForm("allowDirectPosting", event.target.checked)} />{locale === "fr" ? "Autoriser les écritures directes" : "Allow direct posting"}</label></>;
  if (activeKey === "journals") return <><Field label="Code"><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label="Libellé français"><Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required /></Field><Field label="English label"><Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required /></Field><SelectField label={locale === "fr" ? "Type de journal" : "Journal type"} value={String(form.journalType)} onChange={(value) => updateForm("journalType", value)} required>{["GENERAL", "SALES", "PURCHASES", "CASH", "BANK", "MOBILE_MONEY", "PAYROLL", "INVENTORY", "ASSETS", "TAX", "OPENING", "ADJUSTMENT"].map((value) => <option key={value} value={value}>{businessLabel(value, locale)}</option>)}</SelectField><Field label={locale === "fr" ? "Préfixe de séquence" : "Sequence prefix"}><Input value={String(form.sequencePrefix)} onChange={(event) => updateForm("sequencePrefix", event.target.value)} /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(form.requiresApproval)} onChange={(event) => updateForm("requiresApproval", event.target.checked)} />{locale === "fr" ? "Exiger une approbation indépendante" : "Require independent approval"}</label></>;
  if (activeKey === "entries") return <><SelectField label="Journal" value={String(form.journalId)} onChange={(value) => updateForm("journalId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.journals.filter((item) => item.isActive !== false).map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><SelectField label={locale === "fr" ? "Période" : "Period"} value={String(form.fiscalPeriodId)} onChange={(value) => updateForm("fiscalPeriodId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.periods.filter((item) => ["OPEN", "SOFT_CLOSED"].includes(text(item, "status"))).map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {financeStatusLabel(text(item, "status"), locale)}</option>)}</SelectField><Field label={locale === "fr" ? "Date comptable" : "Accounting date"}><Input type="date" value={String(form.accountingDate)} onChange={(event) => updateForm("accountingDate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Référence" : "Reference"}><Input value={String(form.reference)} onChange={(event) => updateForm("reference", event.target.value)} /></Field><Field label={locale === "fr" ? "Libellé" : "Description"} className="sm:col-span-2"><Input value={String(form.description)} onChange={(event) => updateForm("description", event.target.value)} required /></Field><SelectField label={locale === "fr" ? "Compte débité" : "Debit account"} value={String(form.debitAccountId)} onChange={(value) => updateForm("debitAccountId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.accounts.filter((item) => item.isActive !== false && item.allowDirectPosting !== false).map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><SelectField label={locale === "fr" ? "Compte crédité" : "Credit account"} value={String(form.creditAccountId)} onChange={(value) => updateForm("creditAccountId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.accounts.filter((item) => item.isActive !== false && item.allowDirectPosting !== false).map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><Field label={locale === "fr" ? "Montant équilibré" : "Balanced amount"}><Input inputMode="decimal" value={String(form.amount)} onChange={(event) => updateForm("amount", event.target.value)} required /></Field><Field label={locale === "fr" ? "Devise" : "Currency"}><Input value={String(form.currencyCode)} maxLength={3} onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase())} required /></Field></>;
  if (activeKey === "taxes") return <><Field label={locale === "fr" ? "Code fiscal" : "Tax code"}><Input value={String(form.code)} onChange={(event) => updateForm("code", event.target.value)} required /></Field><Field label="Libellé français"><Input value={String(form.nameFr)} onChange={(event) => updateForm("nameFr", event.target.value)} required /></Field><Field label="English label"><Input value={String(form.nameEn)} onChange={(event) => updateForm("nameEn", event.target.value)} required /></Field><SelectField label={locale === "fr" ? "Catégorie" : "Category"} value={String(form.category)} onChange={(value) => updateForm("category", value)} required>{["VAT", "SALES_TAX", "WITHHOLDING", "EXEMPT", "ZERO_RATED", "OTHER"].map((value) => <option key={value} value={value}>{businessLabel(value, locale)}</option>)}</SelectField><Field label={locale === "fr" ? "Taux" : "Rate"}><Input inputMode="decimal" value={String(form.rate)} onChange={(event) => updateForm("rate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Date d’effet" : "Effective date"}><Input type="date" value={String(form.effectiveFrom)} onChange={(event) => updateForm("effectiveFrom", event.target.value)} required /></Field><Field label={locale === "fr" ? "Juridiction" : "Jurisdiction"}><Input value={String(form.jurisdiction)} onChange={(event) => updateForm("jurisdiction", event.target.value)} /></Field><SelectField label={locale === "fr" ? "Compte collecté" : "Payable account"} value={String(form.payableAccountId)} onChange={(value) => updateForm("payableAccountId", value)}><option value="">{locale === "fr" ? "Non défini" : "Not set"}</option>{lookups.accounts.map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><SelectField label={locale === "fr" ? "Compte déductible" : "Recoverable account"} value={String(form.recoverableAccountId)} onChange={(value) => updateForm("recoverableAccountId", value)}><option value="">{locale === "fr" ? "Non défini" : "Not set"}</option>{lookups.accounts.map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField></>;
  if (activeKey === "close") return <><SelectField label={locale === "fr" ? "Période à préparer" : "Period to prepare"} value={String(form.fiscalPeriodId)} onChange={(value) => updateForm("fiscalPeriodId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.periods.filter((item) => text(item, "status") === "OPEN").map((item) => <option key={item.id} value={item.id}>{text(item, "code")}</option>)}</SelectField><Field label={locale === "fr" ? "Motif de réouverture éventuelle" : "Optional reopening reason"} className="sm:col-span-2"><Input value={String(form.reason)} onChange={(event) => updateForm("reason", event.target.value)} /></Field></>;
  if (activeKey === "statements" || activeKey === "inventory") return <><SelectField label={locale === "fr" ? "État" : "Statement"} value={activeKey === "inventory" ? "INVENTORY_VALUATION" : String(form.statementType)} onChange={(value) => updateForm("statementType", value)} required>{(activeKey === "inventory" ? ["INVENTORY_VALUATION"] : ["TRIAL_BALANCE", "GENERAL_LEDGER", "JOURNALS", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "AR_AGING", "AP_AGING", "TREASURY", "BUDGET_VS_ACTUAL", "TAX", "ASSET_REGISTER", "INVENTORY_VALUATION"]).map((value) => <option key={value} value={value}>{businessLabel(value, locale)}</option>)}</SelectField><Field label={locale === "fr" ? "Début" : "Start"}><Input type="date" value={String(form.periodStart)} onChange={(event) => updateForm("periodStart", event.target.value)} required /></Field><Field label={locale === "fr" ? "Fin" : "End"}><Input type="date" value={String(form.periodEnd)} onChange={(event) => updateForm("periodEnd", event.target.value)} required /></Field><Field label={locale === "fr" ? "Devise" : "Currency"}><Input value={String(form.currencyCode)} maxLength={3} onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase())} required /></Field>{activeKey === "statements" ? <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(form.publish)} onChange={(event) => updateForm("publish", event.target.checked)} />{locale === "fr" ? "Publier une version non modifiable" : "Publish an immutable version"}</label> : <p className="text-sm text-dtsc-muted">{locale === "fr" ? "Cette action publie une version non modifiable de la valorisation." : "This action publishes an immutable valuation version."}</p>}</>;
  if (activeKey === "assets") return <><SelectField label={locale === "fr" ? "Actif opérationnel" : "Operational asset"} value={String(form.assetId)} onChange={(value) => updateForm("assetId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.assets.map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {text(item, "name")}</option>)}</SelectField><Field label={locale === "fr" ? "Coût d’acquisition" : "Acquisition cost"}><Input inputMode="decimal" value={String(form.originalCost)} onChange={(event) => updateForm("originalCost", event.target.value)} required /></Field><Field label={locale === "fr" ? "Valeur résiduelle" : "Residual value"}><Input inputMode="decimal" value={String(form.residualValue)} onChange={(event) => updateForm("residualValue", event.target.value)} required /></Field><Field label={locale === "fr" ? "Durée utile (mois)" : "Useful life (months)"}><Input type="number" min={1} value={String(form.usefulLifeMonths)} onChange={(event) => updateForm("usefulLifeMonths", event.target.value)} required /></Field><Field label={locale === "fr" ? "Mise en service" : "In-service date"}><Input type="date" value={String(form.inServiceDate)} onChange={(event) => updateForm("inServiceDate", event.target.value)} required /></Field><Field label={locale === "fr" ? "Devise" : "Currency"}><Input value={String(form.currencyCode)} maxLength={3} onChange={(event) => updateForm("currencyCode", event.target.value.toUpperCase())} required /></Field><SelectField label={locale === "fr" ? "Compte d’immobilisation" : "Asset account"} value={String(form.assetAccountId)} onChange={(value) => updateForm("assetAccountId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.accounts.filter((item) => text(item, "accountSubtype") === "FIXED_ASSET").map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><SelectField label={locale === "fr" ? "Amortissements cumulés" : "Accumulated depreciation"} value={String(form.accumulatedDepreciationAccountId)} onChange={(value) => updateForm("accumulatedDepreciationAccountId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.accounts.filter((item) => text(item, "accountSubtype") === "ACCUMULATED_DEPRECIATION").map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><SelectField label={locale === "fr" ? "Compte de dotation" : "Depreciation expense account"} value={String(form.depreciationExpenseAccountId)} onChange={(value) => updateForm("depreciationExpenseAccountId", value)} required><option value="">{locale === "fr" ? "Choisir…" : "Select…"}</option>{lookups.accounts.filter((item) => text(item, "accountType") === "EXPENSE").map((item) => <option key={item.id} value={item.id}>{text(item, "code")} · {locale === "fr" ? text(item, "nameFr") : text(item, "nameEn")}</option>)}</SelectField><Field label={locale === "fr" ? "Exécuter les amortissements jusqu’au" : "Run depreciation through"}><Input type="date" value={String(form.throughDate)} onChange={(event) => updateForm("throughDate", event.target.value)} /></Field></>;
  return <div className="sm:col-span-2 lg:col-span-3 text-sm text-dtsc-muted">{locale === "fr" ? "Aucune action mutante n’est nécessaire dans cette vue." : "No mutating action is required in this view."}</div>;
}

function BusinessDetails({ item, activeKey, locale }: { item: Item; activeKey: string; locale: FinanceLocale }) {
  const details: Array<[string, string]> = [];
  if (activeKey === "entries") details.push([locale === "fr" ? "Date" : "Date", financeDate(item.accountingDate, locale)], [locale === "fr" ? "Référence" : "Reference", text(item, "reference") || "—"], [locale === "fr" ? "Lignes" : "Lines", nestedText(item, "_count", "lines") || "—"]);
  if (activeKey === "ledger") details.push([locale === "fr" ? "Période" : "Period", text(item, "periodCode")], [locale === "fr" ? "Référence" : "Reference", text(item, "reference") || "—"]);
  if (activeKey === "trial") details.push([locale === "fr" ? "Débits" : "Debits", financeMoney(item.debit, text(item, "currencyCode") || "USD", locale)], [locale === "fr" ? "Crédits" : "Credits", financeMoney(item.credit, text(item, "currencyCode") || "USD", locale)]);
  if (activeKey === "close") {
    const blockers = item.blockersJson && typeof item.blockersJson === "object" ? Object.entries(item.blockersJson as Record<string, unknown>).filter(([, value]) => Number(value) > 0) : [];
    details.push([locale === "fr" ? "Blocages à résoudre" : "Blockers to resolve", blockers.length ? blockers.map(([key, value]) => `${businessLabel(key, locale)}: ${value}`).join(" · ") : (locale === "fr" ? "Aucun blocage détecté" : "No blocker detected")]);
    if (item.status === "PENDING_APPROVAL" || item.status === "APPROVED") details.push([locale === "fr" ? "Contrôle interne" : "Internal control", locale === "fr" ? "Un autre utilisateur autorisé doit approuver et fermer la période." : "Another authorized user must approve and close the period."]);
  }
  if (activeKey === "statements") details.push([locale === "fr" ? "Généré le" : "Generated", financeDate(item.generatedAt, locale)], [locale === "fr" ? "Publié le" : "Published", item.publishedAt ? financeDate(item.publishedAt, locale) : (locale === "fr" ? "Aperçu dynamique" : "Dynamic preview")]);
  if (activeKey === "assets") { const schedules = Array.isArray(item.schedules) ? item.schedules as Item[] : []; details.push([locale === "fr" ? "Valeur résiduelle" : "Residual value", financeMoney(item.residualValue, text(item, "currencyCode") || "USD", locale)], [locale === "fr" ? "Échéances comptabilisées" : "Posted periods", String(schedules.filter((schedule) => schedule.status === "POSTED").length)], [locale === "fr" ? "Prochaine échéance" : "Next schedule", financeDate(schedules.find((schedule) => schedule.status === "PLANNED")?.scheduledDate, locale)]); }
  if (!details.length) return null;
  return <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{details.map(([label, value]) => <div key={label}><dt className="font-black uppercase tracking-wide text-dtsc-muted">{label}</dt><dd className="mt-0.5 break-words text-dtsc-ink">{value}</dd></div>)}</dl>;
}
