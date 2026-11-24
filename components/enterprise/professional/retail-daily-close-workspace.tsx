"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Download, Search, RefreshCw, XCircle } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Field, formatEnterpriseDate } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalLoading } from "@/components/enterprise/professional/professional-erp-ui";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { EnterpriseApproverSelect } from "@/components/enterprise/enterprise-approver-select";
import { cashCountsFromDailyCloseForm, RetailDailyCloseCashCount, RetailDailyCloseNonCashCount } from "@/components/enterprise/professional/retail-daily-close-cash-count";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { ToastNotice } from "@/lib/client-toast";
import { downloadProfessionalCsv, downloadProfessionalPdf, downloadProfessionalXlsx, type ProfessionalReportExportModel } from "@/lib/reporting/professional-export";
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
import { moneyValue } from "@/components/enterprise/professional/retail-workspace-shared";
import { translateRetailWorkspace } from "@/lib/i18n";

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
  expectedCurrentAmount?: string | number;
  revision: number;
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
  financialAccountId: string;
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
  siteId?: string | null;
  lines: DailyCloseLine[];
  capabilities?: { canApprove?: boolean; canReject?: boolean };
};

type Dashboard = {
  access: { canWrite: boolean; canManage: boolean };
  accounts: FinancialAccount[];
  cashSession: CashSession | null;
  cashSessions?: CashSession[];
  range: { from: string; to: string };
};

type CloseListResponse = {
  items: DailyClose[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};
type CloseSummary = { date: string; cashCoverage?: Array<{siteId:string|null;currencyCode:string;approvedSessionCount:number;unresolvedSessionCount:number;inflow:string;outflow:string;net:string}>; rows: Array<{ siteId: string | null; status: string; closeCount: number; varianceCount: number }> };
type AdminStore = { id: string; name: string; code: string };
type StockReport = {
  date: string; site: { id: string; name: string; code: string }; timezone: string;
  generatedAt: string; currentReservations: boolean; page: number; pageCount: number; total: number;
  rows: Array<{ code: string; name: string; opening: string; entries: string; sold: string;
    otherOut: string; closing: string; reserved: string | null; available: string | null;
    lots: Array<{ number: string; expiry: string | null }> }>;
};

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
  adminStores,
  preferredSiteId,
  defaultBusinessDate,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  adminStores?: AdminStore[];
  preferredSiteId?: string;
  defaultBusinessDate: string;
}) {
  const locale: "fr" | "en" = useAppLocale() === "en" ? "en" : "fr";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [closeList, setCloseList] = useState<CloseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  useToastMessage(notice);
  const [historyPage, setHistoryPage] = useState(1);
  const [exporting,setExporting]=useState<"CSV"|"Excel"|"PDF"|null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [siteFilter, setSiteFilter] = useState(preferredSiteId || "ALL");
  const [summaryDate, setSummaryDate] = useState(defaultBusinessDate);
  const [summary, setSummary] = useState<CloseSummary | null>(null);
  const [stockReportDate, setStockReportDate] = useState(defaultBusinessDate);
  const [stockReportPage, setStockReportPage] = useState(1);
  const [stockSearchDraft, setStockSearchDraft] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [stockReport, setStockReport] = useState<StockReport | null>(null);
  const [stockReportLoading, setStockReportLoading] = useState(false);
  const [stockReportError, setStockReportError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const mutationKeys = useRef<Record<string, string>>({});
  const guide = useMemo(() => getRetailUserGuide("RETAIL_DAILY_CLOSE", locale), [locale]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(historyPage), pageSize: "50" });
      if (searchQuery) params.set("search", searchQuery);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (siteFilter !== "ALL") params.set("siteId", siteFilter);
      const [dashboardResponse, closesResponse, summaryResponse] = await Promise.all([
        fetch(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_DAILY_CLOSE`, { cache: "no-store" }),
        fetch(`/api/enterprise/${organizationId}/retail/daily-close?${params.toString()}`, { cache: "no-store" }),
        adminStores ? fetch(`/api/enterprise/${organizationId}/retail/daily-close/summary?date=${encodeURIComponent(summaryDate)}`, { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const dashboardBody = await dashboardResponse.json().catch(() => null) as (Dashboard & { message?: string; error?: string }) | null;
      const closesBody = await closesResponse.json().catch(() => null) as (CloseListResponse & { message?: string; error?: string }) | null;
      if (!dashboardResponse.ok || !dashboardBody) throw new Error(dashboardBody?.message || dashboardBody?.error || "RETAIL_DAILY_CLOSE_LOAD_FAILED");
      if (!closesResponse.ok || !closesBody) throw new Error(closesBody?.message || closesBody?.error || "RETAIL_DAILY_CLOSE_LOAD_FAILED");
      setDashboard(dashboardBody);
      setCloseList(closesBody);
      if (summaryResponse) {
        const result = await summaryResponse.json().catch(() => null) as CloseSummary | null;
        if (summaryResponse.ok && result?.rows) { setSummary(result); setSummaryError(""); }
        else { setSummary(null); setSummaryError(locale === "fr" ? "Le relevé consolidé est momentanément indisponible. Actualisez pour réessayer." : "The consolidated view is temporarily unavailable. Refresh to retry."); }
      }
    } catch (caught) {
      setError(customerFacingError(caught, locale, {
        fr: translateRetailWorkspace("fr", "dailyCloseError"),
        en: translateRetailWorkspace("en", "dailyCloseError"),
      }));
    } finally {
      setLoading(false);
    }
  }, [adminStores, locale, organizationId, siteFilter, statusFilter, summaryDate, historyPage, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (siteFilter === "ALL") { setStockReport(null); setStockReportError(""); return; }
    const controller = new AbortController();
    setStockReportLoading(true); setStockReport(null); setStockReportError("");
    const params = new URLSearchParams({ siteId: siteFilter, date: stockReportDate, page: String(stockReportPage), pageSize: "50", ...(stockSearch ? { search: stockSearch } : {}) });
    void fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/retail/daily-close/stock-report?${params}`,
      { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as (StockReport & { message?: string }) | null;
        if (!response.ok || !data?.rows) throw new Error(data?.message || (locale === "fr" ? "Rapport indisponible." : "Report unavailable."));
        if (!controller.signal.aborted) setStockReport(data);
      })
      .catch((cause) => { if (!controller.signal.aborted) setStockReportError(customerFacingError(cause, locale)); })
      .finally(() => { if (!controller.signal.aborted) setStockReportLoading(false); });
    return () => controller.abort();
  }, [organizationId, siteFilter, stockReportDate, stockReportPage, refreshKey, locale, stockSearch]);

  function stockReportUrl(format: "csv" | "xlsx" | "print") {
    const params = new URLSearchParams({ siteId: siteFilter, date: stockReportDate, format, ...(stockSearch ? { search: stockSearch } : {}) });
    return `/api/enterprise/${encodeURIComponent(organizationId)}/retail/daily-close/stock-report?${params}`;
  }

  function stableKey(action: string) {
    if (!mutationKeys.current[action]) mutationKeys.current[action] = crypto.randomUUID();
    return mutationKeys.current[action];
  }

  async function post(action: string, endpoint: string, payload: Record<string, unknown>, success: string, idempotent = false) {
    if (busyAction) return null;
    setBusyAction(action);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(idempotent ? { ...payload, idempotencyKey: stableKey(action) } : payload),
      });
      const body = await response.json().catch(() => null) as ({ message?: string; error?: string } & Record<string, unknown>) | null;
      if (!response.ok) throw new Error(body?.message || body?.error || "RETAIL_DAILY_CLOSE_ACTION_FAILED");
      if (idempotent) delete mutationKeys.current[action];
      setNotice({ tone: "success", description: success });
      if (action === "daily-close-submit") setSelectedAccountIds([]);
      setRefreshKey((value) => value + 1);
      return body || {};
    } catch (caught) {
      setNotice({ tone: "error", description: customerFacingError(caught, locale, {
        fr: translateRetailWorkspace("fr", "retailActionError"),
        en: translateRetailWorkspace("en", "retailActionError"),
      }) });
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  const selectableSites = useMemo(() => {
    const sites = new Map((adminStores || []).map((site) => [site.id, `${site.code} · ${site.name}`]));
    for (const account of dashboard?.accounts || []) if (account.siteId && !sites.has(account.siteId)) sites.set(account.siteId, `${account.name} · ${account.currencyCode}`);
    return Array.from(sites, ([id, label]) => ({ id, label }));
  }, [adminStores, dashboard]);
  const effectiveSiteId = siteFilter !== "ALL" ? siteFilter : selectableSites.length === 1 ? selectableSites[0].id : "ALL";
  const siteAccounts = useMemo(
    () => (dashboard?.accounts || []).filter((account) => ["CASH", "MOBILE_MONEY", "CLEARING"].includes(account.accountType) && (effectiveSiteId === "ALL" || account.siteId === effectiveSiteId)),
    [dashboard, effectiveSiteId],
  );
  const cashAccounts = useMemo(() => siteAccounts.filter((account) => account.accountType === "CASH"), [siteAccounts]);
  const closeAccounts = useMemo(() => {
    const sessions = dashboard?.cashSessions ?? (dashboard?.cashSession ? [dashboard.cashSession] : []);
    return siteAccounts.flatMap((account) => {
      if (account.accountType !== "CASH") return [{ ...account, closeSession: null as CashSession | null, expectedCloseAmount: Number(account.operationalBalance) }];
      const eligible = sessions.filter((session) => session.financialAccountId === account.id && session.status === "OPEN");
      const session = eligible[0];
      if (eligible.length !== 1 || !session || session.expectedCurrentAmount == null || !Number.isFinite(Number(session.expectedCurrentAmount))) return [];
      return [{ ...account, closeSession: session, expectedCloseAmount: Number(session.expectedCurrentAmount) }];
    });
  }, [dashboard, siteAccounts]);
  const currentCashSession = closeAccounts.find((account) => account.closeSession)?.closeSession ?? null;
  const multipleStoreAccounts = new Set(siteAccounts.map((account) => account.siteId).filter(Boolean)).size > 1;
  const legacyUnassignedAccounts = siteAccounts.length > 0 && siteAccounts.every((account) => !account.siteId);
  const storeSelectionRequired = multipleStoreAccounts || (effectiveSiteId === "ALL" && !legacyUnassignedAccounts);
  const closes = closeList?.items || [];
  const pendingCount = closes.filter((item) => item.status === "SUBMITTED").length;
  const varianceCount = closes.reduce((sum, item) => sum + item.lines.filter((line) => Math.abs(Number(line.differenceAmount || 0)) > 0.005).length, 0);

  async function submitClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (storeSelectionRequired) {
      setNotice({ tone: "warning", description: locale === "fr" ? "Sélectionnez une boutique précise : une clôture ne peut pas regrouper plusieurs boutiques." : "Select one store: a daily close cannot combine multiple stores." });
      return;
    }
    const lines: Array<{ financialAccountId: string; accountType: string; cashSessionId?: string; cashSessionRevision?: number; expectedSessionAmount?: number; declaredBalance: number; varianceReason: string | null; denominations: Array<{ denomination: number; quantity: number }> }> = [];
    for (const account of closeAccounts.filter((candidate) => form.get(`include-${candidate.id}`) === "on")) {
      const physicalCount = account.accountType === "CASH"
        ? cashCountsFromDailyCloseForm(form, account.id, account.currencyCode)
        : null;
      if (account.accountType === "CASH" && !physicalCount) {
        setNotice({ tone: "error", description: locale === "fr"
          ? `Vérifiez les coupures et les quantités de la caisse ${account.name}.`
          : `Check the cash denominations and quantities for ${account.name}.` });
        return;
      }
      const declaredBalance = account.accountType === "CASH"
        ? (physicalCount?.declaredBalance ?? 0)
        : Number(form.get(`declared-${account.id}`) || 0);
      if (!Number.isFinite(declaredBalance) || declaredBalance < 0) {
        setNotice({ tone: "error", description: locale === "fr" ? "Le solde déclaré doit être un montant valide." : "Declared balance must be a valid amount." });
        return;
      }
      const varianceReason = String(form.get(`reason-${account.id}`) || "").trim() || null;
      if (Math.abs(declaredBalance - account.expectedCloseAmount) > 0.005 && (!varianceReason || varianceReason.length < 3)) {
        setNotice({ tone: "error", description: locale === "fr"
          ? `Justifiez l'écart de ${account.name} avant la soumission.`
          : `Explain the variance for ${account.name} before submitting.` });
        return;
      }
      lines.push({
        financialAccountId: account.id,
        accountType: account.accountType,
        ...(account.closeSession ? { cashSessionId: account.closeSession.id, cashSessionRevision: account.closeSession.revision, expectedSessionAmount: account.expectedCloseAmount } : {}),
        declaredBalance,
        varianceReason,
        denominations: physicalCount?.counts ?? [],
      });
    }
    if (!lines.length) {
      setNotice({ tone: "warning", description: translateRetailWorkspace(locale, "dailyCloseSelectAtLeastOneAccountToClose") });
      return;
    }
    const approverUserId = String(form.get("approverUserId") || "").trim();
    if (lines.some((line) => line.accountType === "CASH") && !approverUserId) {
      setNotice({ tone: "warning", description: translateRetailWorkspace(locale, "dailyCloseApproverRequired") });
      return;
    }
    const businessDate = String(form.get("businessDate") || defaultBusinessDate);
    await post(
      "daily-close-submit",
      `/api/enterprise/${organizationId}/retail/daily-close`,
      {
        businessDate: new Date(`${businessDate}T12:00:00`).toISOString(),
        siteId: effectiveSiteId === "ALL" ? undefined : effectiveSiteId,
        notes: String(form.get("notes") || "").trim() || null,
        approverUserId: approverUserId || undefined,
        lines,
      },
      translateRetailWorkspace(locale, "dailyCloseCloseSubmittedForIndependentReview"),
      true,
    );
  }

  async function exportFilteredCloses(format:"CSV"|"Excel"|"PDF") {
    if(exporting)return;
    setExporting(format);setNotice(null);
    const tr=(fr:string,en:string)=>locale==="fr"?fr:en;
    try{
      const params=new URLSearchParams({export:"1"});
      if(searchQuery)params.set("search",searchQuery);
      if(dateFrom)params.set("from",dateFrom);
      if(dateTo)params.set("to",dateTo);
      if(statusFilter!=="ALL")params.set("status",statusFilter);
      if(siteFilter!=="ALL")params.set("siteId",siteFilter);
      const response=await fetch(`/api/enterprise/${organizationId}/retail/daily-close?${params}`,{cache:"no-store"});
      const body=await response.json().catch(()=>null) as {rows?:Array<{number:string;businessDate:string;site:string|null;status:string;account:string|null;accountType:string;currencyCode:string;cashSessionId:string|null;systemClosingBalance:string;declaredBalance:string;differenceAmount:string;varianceReason:string|null}>;error?:string}|null;
      if(!response.ok||!Array.isArray(body?.rows))throw new Error(body?.error==="RETAIL_CLOSE_EXPORT_LIMIT"?tr("Affinez les filtres : 1 000 lignes maximum.","Narrow filters: maximum 1,000 lines."):tr("Export indisponible. Actualisez et réessayez.","Export unavailable. Refresh and retry."));
      const rows=body.rows.map(row=>({...row,businessDate:formatEnterpriseDate(row.businessDate,locale),site:row.site||tr("Non attribuée","Unassigned"),account:row.account||tr("Compte non identifié","Unidentified account"),accountType:customerFacingFinancialAccountType(row.accountType,locale),status:customerFacingStatusLabel(row.status,locale)}));
      const columns=[["number","Clôture","Close"],["businessDate","Date","Date"],["site","Boutique","Store"],["status","Statut","Status"],["account","Compte","Account"],["accountType","Type","Type"],["currencyCode","Devise","Currency"],["systemClosingBalance","Solde système","System balance"],["declaredBalance","Solde déclaré","Declared balance"],["differenceAmount","Écart déclaré","Declared variance"],["varianceReason","Justification","Explanation"]];
      const model:ProfessionalReportExportModel={organizationName,title:tr("Historique des clôtures magasin","Store closing history"),subtitle:tr("Déclarations historiques par compte et devise · non assimilables à un solde global","Historical declarations by account and currency · not a consolidated balance"),filenameBase:"DTSC-clotures-"+defaultBusinessDate,generatedLabel:new Intl.DateTimeFormat(locale,{dateStyle:"long",timeStyle:"short"}).format(new Date()),columns:columns.map(([key,fr,en])=>({key,label:tr(fr,en)})),rows,chart:[],insights:[{title:tr("Lecture des écarts","Reading variances"),body:tr("Les montants sont les déclarations originales. Les régularisations sont consultables dans la caisse source. Ne pas additionner les comptages successifs ni les devises.","Amounts are original declarations. Review corrections in the source cash module. Do not sum successive counts or currencies.")}],kpis:[{label:tr("Lignes","Lines"),value:String(rows.length)},{label:tr("Clôtures","Closes"),value:String(new Set(rows.map(row=>row.number)).size)}],filters:[{label:tr("Boutique","Store"),value:siteFilter==="ALL"?tr("Toutes les boutiques autorisées","All authorized stores"):adminStores?.find(site=>site.id===siteFilter)?.name||siteFilter},{label:tr("Statut","Status"),value:statusFilter==="ALL"?tr("Tous","All"):customerFacingStatusLabel(statusFilter,locale)},{label:tr("Du","From"),value:dateFrom||"—"},{label:tr("Au","To"),value:dateTo||"—"},{label:tr("Recherche","Search"),value:searchQuery||"—"}]};
      if(format==="CSV")downloadProfessionalCsv(model);else if(format==="Excel")downloadProfessionalXlsx(model);else downloadProfessionalPdf(model);
      setNotice({tone:"success",description:tr(`${rows.length} lignes exportées en ${format}.`,`${rows.length} lines exported as ${format}.`)});
    }catch(caught){setNotice({tone:"error",description:caught instanceof Error?caught.message:tr("Export impossible.","Export failed.")});}finally{setExporting(null);}
  }

  async function decide(item: DailyClose, decision: "APPROVE" | "REJECT") {
    const reason = decision === "REJECT"
      ? window.prompt(translateRetailWorkspace(locale, "dailyCloseWhyIsThisCloseRejected"))
      : null;
    if (decision === "REJECT" && !reason?.trim()) return;
    await post(
      `daily-close-${decision.toLowerCase()}-${item.id}`,
      `/api/enterprise/${organizationId}/retail/daily-close/${item.id}/decision`,
      { revision: item.revision, decision, reason: reason?.trim() || null },
      decision === "APPROVE"
        ? (translateRetailWorkspace(locale, "dailyCloseCloseApproved"))
        : (translateRetailWorkspace(locale, "dailyCloseCloseRejected")),
    );
  }

  return (
    <ModuleWorkspace density="compact">
      <ModuleHeader
        eyebrow={`${locale === "fr" ? "Clôture magasin" : "Store daily closing"} · ${organizationName}`}
        count={closeList ? `${closeList.pagination.total} ${locale === "fr" ? "clôtures" : "closes"}` : undefined}
        title={locale === "en" ? definition.labelEn : definition.labelFr}
        description={translateRetailWorkspace(locale, "dailyCloseCountTheTillAndOperationalBalancesExplainVariancesThenSubmitTheDay")}
        primaryAction={(
          <div data-responsive-actions>
            <Button variant="outline" onClick={() => setGuideOpen(true)}>{translateRetailWorkspace(locale, "userGuide")}</Button>
            <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => setRefreshKey((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" />{translateRetailWorkspace(locale, "refresh")}
            </Button>
          </div>
        )}
      />
      <ContextualUserGuide guide={guide} open={guideOpen} onOpenChange={setGuideOpen} hideTrigger />

      {dashboard ? (
        <ModuleMetrics label={translateRetailWorkspace(locale, "dailyCloseDailyCloseIndicators")}>
          <ModuleMetric icon={<Banknote className="h-4 w-4 text-emerald-500" />} label={translateRetailWorkspace(locale, "till")} value={currentCashSession?.status === "OPEN" ? (translateRetailWorkspace(locale, "dailyCloseOpen")) : (translateRetailWorkspace(locale, "dailyCloseNotOpen"))} />
          <ModuleMetric icon={<Building2 className="h-4 w-4 text-blue-500" />} label={translateRetailWorkspace(locale, "dailyCloseBalancesToReview")} value={closeAccounts.length} />
          <ModuleMetric icon={<ClipboardCheck className="h-4 w-4 text-amber-500" />} label={translateRetailWorkspace(locale, "dailyCloseAwaitingReview")} value={pendingCount} hint={locale === "fr" ? "Sur la page consultée" : "On current page"} />
          <ModuleMetric icon={<CalendarDays className="h-4 w-4 text-rose-500" />} label={translateRetailWorkspace(locale, "dailyCloseVariancesInView")} value={varianceCount} hint={locale === "fr" ? "Sur la page consultée" : "On current page"} />
        </ModuleMetrics>
      ) : null}

      <ModuleToolbar
        density="compact"
        search={(
          <form onSubmit={(event) => { event.preventDefault(); setHistoryPage(1); setSearchQuery(searchDraft.trim()); }} className="flex min-w-0 gap-2">
            <Input type="search" aria-label={locale === "fr" ? "Rechercher une clôture" : "Search closing"}
              placeholder={locale === "fr" ? "Rechercher par numéro ou note…" : "Search by number or note…"}
              value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
            <Button type="submit" variant="outline" aria-label={locale === "fr" ? "Lancer la recherche" : "Run search"}>
              <Search className="h-4 w-4" />{locale === "fr" ? "Rechercher" : "Search"}
            </Button>
          </form>
        )}
        controls={(
          <div className="flex min-w-0 gap-2 overflow-x-auto [touch-action:pan-x]" aria-label={locale === "fr" ? "Filtrer par statut" : "Filter by status"}>
            {["ALL", "SUBMITTED", "APPROVED", "REJECTED"].map((status) => (
              <Button key={status} size="sm" variant={statusFilter === status ? "default" : "outline"}
                onClick={() => { setHistoryPage(1); setStatusFilter(status); }}>
                {status === "ALL" ? translateRetailWorkspace(locale, "dailyCloseAllCloses") : customerFacingStatusLabel(status, locale)}
              </Button>
            ))}
          </div>
        )}
        activeFilters={(
          <div className="flex flex-wrap items-end gap-2">
            <Field label={locale === "fr" ? "Du" : "From"}>
              <Input type="date" aria-label={locale === "fr" ? "Date de début" : "Start date"} value={dateFrom}
                onChange={(event) => { setHistoryPage(1); setDateFrom(event.target.value); }} />
            </Field>
            <Field label={locale === "fr" ? "Au" : "To"}>
              <Input type="date" aria-label={locale === "fr" ? "Date de fin" : "End date"} value={dateTo}
                onChange={(event) => { setHistoryPage(1); setDateTo(event.target.value); }} />
            </Field>
            {(searchQuery || dateFrom || dateTo || statusFilter !== "ALL") ? (
              <Button size="sm" variant="outline" onClick={() => {
                setSearchDraft(""); setSearchQuery(""); setDateFrom(""); setDateTo(""); setStatusFilter("ALL"); setHistoryPage(1);
              }}>{locale === "fr" ? "Effacer les filtres" : "Clear filters"}</Button>
            ) : null}
          </div>
        )}
        summary={translateRetailWorkspace(locale, "dailyCloseFinanceRemainsTheSourceOfTruthForTillsBalancesAndTreasury")}
      />

      <ModuleContent>
        {notice ? <p role="status" className="sr-only">{notice.description}</p> : null}
        {error ? <ProfessionalError message={error} /> : loading ? <ProfessionalLoading rows={5} /> : !dashboard ? (
          <EmptyState title={translateRetailWorkspace(locale, "dailyCloseDailyCloseUnavailable")} description={translateRetailWorkspace(locale, "refreshToRetry")} />
        ) : (
          <div className="grid min-w-0 gap-5">
            {adminStores ? <ModuleSection density="compact" id="retail-close-consolidated"
              title={locale === "fr" ? "Clôture multiboutique consolidée" : "Consolidated multi-store closing"}
              description={locale === "fr" ? "Relevé complet des clôtures enregistrées à la date choisie. Les montants restent dans leurs comptes et leurs devises d’origine." : "Complete daily close count for the chosen business date. Amounts remain in their original accounts and currencies."}
            >
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Field label={locale === "fr" ? "Date du relevé" : "Report date"}><Input type="date" value={summaryDate} onChange={(event) => setSummaryDate(event.target.value)} /></Field>
                <Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={Boolean(busyAction)}><RefreshCw className="h-4 w-4" />{translateRetailWorkspace(locale, "refresh")}</Button>
              </div>
              {summaryError ? <p role="alert" className="mb-3 text-sm text-amber-700 dark:text-amber-300">{summaryError}</p> : null}
              {summary ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-retail-daily-close-store-summary>{adminStores.map((site) => {
                const rows = summary.rows.filter((row) => row.siteId === site.id);
                const count = (status: string) => rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.closeCount, 0);
                const variances = rows.reduce((sum, row) => sum + row.varianceCount, 0);
                const total = rows.reduce((sum, row) => sum + row.closeCount, 0);
                return <div key={site.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex gap-2"><Building2 className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue" aria-hidden="true" /><div className="min-w-0"><h4 className="break-words font-black text-dtsc-ink">{site.name}</h4><p className="text-xs text-dtsc-muted">{site.code}</p></div></div>
                  <p className="mt-3 text-sm font-bold text-dtsc-ink">{locale === "fr" ? "Clôtures" : "Closes"} : {total}</p>
                  <p className="mt-1 text-xs text-dtsc-muted">{locale === "fr" ? "En attente" : "Pending"} : {count("SUBMITTED")} · {locale === "fr" ? "Validées" : "Approved"} : {count("APPROVED")} · {locale === "fr" ? "Rejetées" : "Rejected"} : {count("REJECTED")}</p>
                  <p className={`mt-2 text-xs font-bold ${variances ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{locale === "fr" ? "Lignes avec écart" : "Lines with variance"} : {variances}</p>
                  {(summary.cashCoverage||[]).filter(row=>row.siteId===site.id).map(row=><div key={row.currencyCode} className="mt-3 grid min-w-0 gap-1 border-t border-dtsc-border pt-2"><p className="font-semibold text-sm">{row.currencyCode} · {row.approvedSessionCount} {locale==="fr"?"sessions validées":"approved sessions"}</p><p className="text-xs text-dtsc-muted">{locale==="fr"?"Entrées / sorties hors passations":"Inflows / outflows excluding handovers"} : {moneyValue(row.inflow,row.currencyCode,locale)} / {moneyValue(row.outflow,row.currencyCode,locale)}</p><p className="text-sm font-semibold">{locale==="fr"?"Flux net des sessions":"Net session flows"} : {moneyValue(row.net,row.currencyCode,locale)}</p><p className="text-xs text-dtsc-muted">{row.unresolvedSessionCount} {locale==="fr"?"sessions avec écart à régulariser":"sessions with unresolved variance"}</p></div>)}
                  <p className="mt-2 text-xs text-dtsc-muted">{locale==="fr"?"Les flux des sessions clôturées ne sont pas un solde physique global. Consultez le rapprochement de caisse pour ce dernier.":"Closed-session flows are not an account-wide physical balance. See cash reconciliation for that balance."}</p>
                  <Button size="sm" className="mt-3" variant="outline" onClick={() => { setSiteFilter(site.id); setStatusFilter("ALL"); setHistoryPage(1); setSelectedAccountIds([]); }}>{locale === "fr" ? "Voir les clôtures de cette boutique" : "View this store’s closes"}</Button>
                </div>;
              })}{(() => {
                const unmatched = summary.rows.filter((row) => !adminStores.some((site) => site.id === row.siteId));
                const total = unmatched.reduce((count, row) => count + row.closeCount, 0);
                return total ? <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"><h4 className="font-black text-amber-800 dark:text-amber-200">{locale === "fr" ? "Sites historiques ou non rattachés" : "Historical or unassigned sites"}</h4><p className="mt-2 text-sm text-dtsc-ink">{locale === "fr" ? "Clôtures" : "Closes"} : {total} · {locale === "fr" ? "Lignes avec écart" : "Lines with variance"} : {unmatched.reduce((count, row) => count + row.varianceCount, 0)}</p><p className="mt-2 text-xs text-dtsc-muted">{locale === "fr" ? "Vérifiez les références de site dans l’historique Finance." : "Check site references in Finance history."}</p></div> : null;
              })()}</div> : null}
            </ModuleSection> : null}
            <ModuleSection density="compact" id="retail-close-store" title={locale === "fr" ? "Boutique de travail" : "Working store"} description={locale === "fr" ? "Choisissez une boutique avant de soumettre une clôture : aucun mélange entre les magasins." : "Choose one store before submitting a close; never combine multiple stores."}>
              <select aria-label={locale === "fr" ? "Filtrer les clôtures par boutique" : "Filter closes by store"} value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setHistoryPage(1); setStockReportPage(1); setSelectedAccountIds([]); }} className="min-h-11 w-full max-w-lg rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="ALL">{locale === "fr" ? "Toutes les boutiques — consultation uniquement" : "All stores — read only"}</option>
                {selectableSites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
              </select>
              {storeSelectionRequired ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{locale === "fr" ? "Une boutique doit être choisie pour créer une clôture." : "Choose one store to submit a close."}</p> : null}
              {legacyUnassignedAccounts && effectiveSiteId === "ALL" ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{locale === "fr" ? "Mode historique : les comptes sans boutique sont acceptés tant que l’isolation n’est pas activée. Affectez-les à une boutique dès que possible." : "Legacy mode: unassigned accounts remain usable while isolation is off. Link them to a store as soon as possible."}</p> : null}
            </ModuleSection>
            <ModuleSection density="compact" id="retail-close-till"
              title={translateRetailWorkspace(locale, "dailyCloseTillTreasuryHandoff")}
              description={translateRetailWorkspace(locale, "dailyCloseUseFinanceToManageTheUnderlyingAccountsUseThisWorkspaceToPerform")}
            >
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className={`min-w-0 rounded-2xl border p-4 ${currentCashSession?.status === "OPEN" ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                  {currentCashSession?.status === "OPEN" ? (
                    <>
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-black text-dtsc-ink">{currentCashSession.financialAccount.name} · {currentCashSession.financialAccount.currencyCode}</p>
                          <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                            {translateRetailWorkspace(locale, "openingFloat")}: {moneyValue(currentCashSession.openingAmount, currentCashSession.financialAccount.currencyCode, locale)} · {translateRetailWorkspace(locale, "dailyCloseSessionExpected")}: {moneyValue(currentCashSession.expectedCurrentAmount ?? 0, currentCashSession.financialAccount.currencyCode, locale)}
                          </p>
                        </div>
                        <StatusBadge tone="success">{customerFacingStatusLabel(currentCashSession.status, locale)}</StatusBadge>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{translateRetailWorkspace(locale, "dailyCloseNoActiveTillOpenYourTillBeforeRecordingCashActivity")}</p>
                  )}
                </div>
                <div data-responsive-actions>
                  <Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_CASH">{translateRetailWorkspace(locale, "dailyCloseCashManagement")}</Link></Button>
                  <Button asChild variant="outline"><Link href="/enterprise-modules/FINANCE_TREASURY">{translateRetailWorkspace(locale, "treasury")}</Link></Button>
                </div>
              </div>

              {!currentCashSession && dashboard.access.canWrite ? (
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
                      translateRetailWorkspace(locale, "tillOpened"),
                    );
                  }}
                  className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.45fr)_auto] sm:items-end"
                >
                  <Field label={translateRetailWorkspace(locale, "till")}>
                    <Select name="financialAccountId" required disabled={Boolean(busyAction)}>
                      <option value="">—</option>
                      {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}
                    </Select>
                  </Field>
                  <Field label={translateRetailWorkspace(locale, "openingFloat")}>
                    <Input name="openingAmount" type="number" min="0" step="0.01" required disabled={Boolean(busyAction)} />
                  </Field>
                  <Button disabled={Boolean(busyAction) || !cashAccounts.length || storeSelectionRequired}><Banknote className="h-4 w-4" />{translateRetailWorkspace(locale, "dailyCloseOpenTill")}</Button>
                </form>
              ) : null}
            </ModuleSection>

            <ModuleSection density="compact" id="retail-close-balances"
              title={translateRetailWorkspace(locale, "dailyCloseBalancesToCount")}
              description={translateRetailWorkspace(locale, "dailyCloseSessionScope")}
            >
              {closeAccounts.length ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {closeAccounts.map((account) => (
                    <div key={account.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                      <p className="break-words font-black text-dtsc-ink">{account.name}</p>
                      <p className="mt-1 text-xs font-semibold text-dtsc-muted">{customerFacingFinancialAccountType(account.accountType, locale)} · {account.currencyCode}</p>
                      <p className="mt-3 text-xl font-black text-dtsc-ink">{moneyValue(account.expectedCloseAmount, account.currencyCode, locale)}</p>
                      <p className="text-xs font-semibold text-dtsc-muted">{translateRetailWorkspace(locale, account.closeSession ? "dailyCloseSessionExpected" : "dailyCloseCurrentOperationalBalance")}</p>
                      {account.closeSession ? <p className="mt-1 break-words text-xs text-dtsc-muted">{account.closeSession.number}</p> : null}
                    </div>
                  ))}
                </div>
              ) : <EmptyState compact title={translateRetailWorkspace(locale, "dailyCloseNoBalanceToClose")} description={translateRetailWorkspace(locale, "dailyCloseConfigureTheRelevantCashOrPaymentAccountInFinanceFirst")} />}
            </ModuleSection>

            <ModuleSection density="compact" id="retail-close-submit"
              title={translateRetailWorkspace(locale, "dailyCloseSubmitTheDailyClose")}
              description={translateRetailWorkspace(locale, "dailyCloseSelectTheBalancesYouCountedEveryVarianceShouldHaveAClearBusiness")}
            >
              <form onSubmit={(event) => void submitClose(event)} className="grid min-w-0 gap-4">
                 <p className="text-sm text-dtsc-muted">{translateRetailWorkspace(locale, "dailyCloseVarianceReview")}</p>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <Field label={translateRetailWorkspace(locale, "dailyCloseBusinessDate")}><Input name="businessDate" type="date" defaultValue={defaultBusinessDate} required /></Field>
                  <Field label={translateRetailWorkspace(locale, "dailyCloseCloseNotes")}><Input name="notes" maxLength={2000} /></Field>
                </div>
                <div className="grid min-w-0 gap-3">
                  {closeAccounts.map((account) => (
                    <div key={account.id} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 shadow-sm sm:p-4">
                      <label className="mb-3 flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-black text-dtsc-ink">
                        <input type="checkbox" name={`include-${account.id}`} className="h-4 w-4 accent-cyan-500"
                          checked={selectedAccountIds.includes(account.id)} onChange={(event) => setSelectedAccountIds((previous) => event.target.checked
                            ? [...previous, account.id] : previous.filter((id) => id !== account.id))}
                          disabled={Boolean(busyAction) || !dashboard.access.canWrite || storeSelectionRequired} />
                        <span className="min-w-0 flex-1 break-words">{account.name}
                          <span className="mt-0.5 block text-xs font-semibold text-dtsc-muted">{customerFacingFinancialAccountType(account.accountType, locale)} · {account.currencyCode}{account.closeSession ? ` · ${account.closeSession.number}` : ""}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-dtsc-soft px-2 py-1 text-xs font-black text-dtsc-blue">{account.currencyCode}</span>
                      </label>
                      {account.accountType === "CASH" ? (
                        <RetailDailyCloseCashCount key={`${account.id}-${account.currencyCode}`}
                          accountId={account.id} currencyCode={account.currencyCode}
                          expectedAmount={account.expectedCloseAmount} locale={locale}
                          disabled={!selectedAccountIds.includes(account.id) || Boolean(busyAction) || !dashboard.access.canWrite || storeSelectionRequired} />
                      ) : (
                        <RetailDailyCloseNonCashCount key={`${account.id}-${account.currencyCode}`}
                          accountId={account.id} currencyCode={account.currencyCode}
                          expectedAmount={account.expectedCloseAmount} locale={locale}
                          disabled={!selectedAccountIds.includes(account.id) || Boolean(busyAction) || !dashboard.access.canWrite || storeSelectionRequired} />
                      )}
                    </div>
                  ))}
                </div>
                {cashAccounts.length ? (
                  <div className="grid min-w-0 gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                    <EnterpriseApproverSelect
                      organizationId={organizationId}
                      moduleCode="FINANCE_CASH"
                      locale={locale}
                      label={translateRetailWorkspace(locale, "dailyCloseIndependentApprover")}
                      required={false}
                      disabled={Boolean(busyAction)}
                    />
                    <p className="text-xs font-semibold text-dtsc-muted">{translateRetailWorkspace(locale, "dailyCloseIndependentApproverHelp")}</p>
                  </div>
                ) : null}
                <Button className="w-fit" disabled={Boolean(busyAction) || !dashboard.access.canWrite || !closeAccounts.length || storeSelectionRequired}>
                  <ClipboardCheck className="h-4 w-4" />{busyAction === "daily-close-submit" ? (translateRetailWorkspace(locale, "dailyCloseSubmitting")) : (translateRetailWorkspace(locale, "dailyCloseSubmitForReview"))}
                </Button>
              </form>
            </ModuleSection>

            <ModuleSection density="compact" id="retail-close-stock-report"
              title={locale === "fr" ? "Rapport journalier des stocks" : "Daily inventory movement report"}
              description={locale === "fr" ? "Stock initial, entrées, quantités vendues, autres sorties et stock final calculés depuis Inventaire & Logistique. Aucune saisie manuelle des stocks." : "Opening stock, receipts, physical sales, other issues and closing stock from the canonical inventory ledger."}
            >
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <form className="flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); setStockReportPage(1); setStockSearch(stockSearchDraft.trim()); }}>
                  <Input type="search" aria-label={locale === "fr" ? "Rechercher un article de stock" : "Find inventory item"} value={stockSearchDraft} maxLength={100} onChange={(event) => setStockSearchDraft(event.target.value)} placeholder={locale === "fr" ? "Article ou code…" : "Item or code…"} />
                  <Button variant="outline" size="sm" type="submit"><Search className="h-4 w-4" />{locale === "fr" ? "Chercher" : "Search"}</Button>
                </form>
                {stockSearch ? <Button variant="outline" size="sm" onClick={() => { setStockSearchDraft(""); setStockSearch(""); setStockReportPage(1); }}>{locale === "fr" ? "Effacer" : "Clear"}</Button> : null}
                <Field label={locale === "fr" ? "Date du rapport" : "Report date"}>
                  <Input type="date" value={stockReportDate} onChange={(event) => { setStockReportPage(1); setStockReportDate(event.target.value); }} />
                </Field>
                <Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />{locale === "fr" ? "Actualiser" : "Refresh"}</Button>
                {stockReport ? <>
                  <a href={stockReportUrl("print")} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink">{locale === "fr" ? "Aperçu / PDF" : "Preview / PDF"}</a>
                  <a href={stockReportUrl("xlsx")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink"><Download className="h-4 w-4" />Excel</a>
                  <a href={stockReportUrl("csv")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink"><Download className="h-4 w-4" />CSV</a>
                </> : null}
              </div>
              {siteFilter === "ALL" ? <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{locale === "fr" ? "Sélectionnez une boutique dans « Boutique de travail » pour calculer un rapport selon son fuseau horaire." : "Select a specific store above for a timezone-accurate report."}</p> : null}
              {stockReportLoading ? <p role="status" className="mt-3 text-sm text-dtsc-muted">{locale === "fr" ? "Calcul du rapport journalier…" : "Calculating daily report…"}</p> : null}
              {stockReportError ? <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{stockReportError}</p> : null}
              {stockReport ? <>
                <p className="mt-2 text-xs text-dtsc-muted">{stockReport.site.name} · {stockReport.date} · {stockReport.timezone} · {stockReport.total} {locale === "fr" ? "articles" : "items"}</p>
                {!stockReport.currentReservations ? <p className="text-xs text-amber-700 dark:text-amber-300">{locale === "fr" ? "Réservations historiques non reconstituées : le stock final physique reste calculé depuis les mouvements." : "Historical reservations are not reconstructed; physical closing stock uses movements."}</p> : null}
                <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-dtsc-border">
                  <table className="min-w-[850px] w-full text-left text-xs">
                    <thead className="bg-dtsc-soft text-dtsc-ink"><tr>
                      {["Article", locale === "fr" ? "Initial" : "Opening", locale === "fr" ? "Entrées" : "In",
                        locale === "fr" ? "Ventes" : "Sales", locale === "fr" ? "Autres sorties" : "Other out",
                        locale === "fr" ? "Final" : "Closing", locale === "fr" ? "Réservé" : "Reserved",
                        locale === "fr" ? "Disponible" : "Available"].map((label) => <th key={label} className="p-2">{label}</th>)}
                    </tr></thead>
                    <tbody>{stockReport.rows.map((row) => <tr key={row.code} className="border-t border-dtsc-border text-dtsc-ink">
                      <td className="p-2 font-bold">{row.name}<span className="block text-dtsc-muted">{row.code}</span>
                        {row.lots.length ? <span className="block text-dtsc-muted">{row.lots.map((lot) => lot.number + (lot.expiry ? " · " + lot.expiry : "")).join(", ")}</span> : null}</td>
                      {[row.opening, row.entries, row.sold, row.otherOut, row.closing, row.reserved ?? "—", row.available ?? "—"].map((number, index) =>
                        <td key={index} className="p-2 tabular-nums">{number}</td>)}
                    </tr>)}</tbody>
                  </table>
                </div>
                {!stockReport.rows.length ? <EmptyState compact title={locale === "fr" ? "Aucun article à présenter" : "No inventory items"} /> : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-dtsc-muted">{locale === "fr" ? "Page" : "Page"} {stockReport.page} / {stockReport.pageCount}</span>
                  <div className="flex gap-2"><Button variant="outline" size="sm" disabled={stockReportPage <= 1} onClick={() => setStockReportPage((v) => Math.max(1, v - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" disabled={stockReportPage >= stockReport.pageCount} onClick={() => setStockReportPage((v) => v + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
                </div>
              </> : null}
            </ModuleSection>

            <ModuleSection density="compact" id="retail-close-history"
              title={translateRetailWorkspace(locale, "dailyCloseDailyCloseHistory")}
              action={<div className="flex flex-wrap gap-1.5" aria-label={locale==="fr"?"Exporter les clôtures filtrées":"Export filtered closes"}>{(["Excel","CSV","PDF"] as const).map(format=><Button key={format} variant="outline" size="sm" disabled={loading||!closeList?.pagination.total||Boolean(exporting)} onClick={()=>void exportFilteredCloses(format)}><Download className="h-4 w-4" />{exporting===format?"…":format}</Button>)}</div>}
              description={closeList ? `${closeList.pagination.total} ${translateRetailWorkspace(locale, "dailyCloseCloseS")}` : undefined}
            >
              {closes.length ? (
                <BusinessList ariaLabel={translateRetailWorkspace(locale, "dailyCloseDailyCloseHistory")}>
                  {closes.map((item) => {
                    const varianceLines = item.lines.filter((line) => Math.abs(Number(line.differenceAmount || 0)) > 0.005);
                    const description = item.lines.map((line) => {
                      const label = customerFacingFinancialAccountType(line.accountType, locale);
                      const declared = moneyValue(line.declaredBalance, line.currencyCode, locale);
                      const difference = moneyValue(line.differenceAmount, line.currencyCode, locale);
                      return `${label}: ${translateRetailWorkspace(locale, "dailyCloseDeclared")} ${declared} · ${translateRetailWorkspace(locale, "dailyCloseVariance")} ${difference}${line.varianceReason ? ` · ${line.varianceReason}` : ""}`;
                    }).join(" | ");
                    return (
                      <BusinessListItem
                        key={item.id}
                        title={item.number}
                        status={<StatusBadge tone={statusTone(item.status)}>{customerFacingStatusLabel(item.status, locale)}</StatusBadge>}
                        meta={`${formatEnterpriseDate(item.businessDate, locale)} · ${varianceLines.length ? `${varianceLines.length} ${translateRetailWorkspace(locale, "dailyCloseVarianceS")}` : (translateRetailWorkspace(locale, "dailyCloseNoVariance"))}`}
                        description={description}
                        actions={item.status === "SUBMITTED" && (item.capabilities?.canApprove || item.capabilities?.canReject) ? (
                          <div data-responsive-actions>
                            {item.capabilities?.canApprove ? <Button size="sm" disabled={Boolean(busyAction)} onClick={() => void decide(item, "APPROVE")}><CheckCircle2 className="h-4 w-4" />{translateRetailWorkspace(locale, "dailyCloseApprove")}</Button> : null}
                            {item.capabilities?.canReject ? <Button size="sm" variant="outline" disabled={Boolean(busyAction)} onClick={() => void decide(item, "REJECT")}><XCircle className="h-4 w-4" />{translateRetailWorkspace(locale, "dailyCloseReject")}</Button> : null}
                          </div>
                        ) : undefined}
                      />
                    );
                  })}
                </BusinessList>
              ) : <EmptyState compact title={translateRetailWorkspace(locale, "dailyCloseNoDailyClose")} description={translateRetailWorkspace(locale, "dailyCloseSubmittedClosesWillAppearHereWithTheirVariancesAndReviewStatus")} />}
              {closeList && closeList.pagination.total > 0 ? (
                <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-3">
                  <p className="text-xs font-bold text-dtsc-muted">{locale === "fr" ? "Page" : "Page"} {closeList.pagination.page} / {closeList.pagination.pageCount} · {closeList.pagination.total} {locale === "fr" ? "résultats" : "results"}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={Boolean(busyAction) || historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>
                      <ChevronLeft className="h-4 w-4" />{locale === "fr" ? "Précédent" : "Previous"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={Boolean(busyAction) || historyPage >= closeList.pagination.pageCount} onClick={() => setHistoryPage((page) => Math.min(closeList.pagination.pageCount, page + 1))}>
                      {locale === "fr" ? "Suivant" : "Next"}<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </ModuleSection>
          </div>
        )}
      </ModuleContent>
    </ModuleWorkspace>
  );
}
