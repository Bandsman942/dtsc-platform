"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge } from "@/components/workspace/status-badge";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { translateInternalAdmin, translateInternalAdminStatus, translateInternalAdminSystemCopy } from "@/lib/i18n";

type Account = { id: string; name: string; accountType: string; currency: string | null; balance: string; reconciliationIssue: string | null; status: string; createdAt: string; updatedAt: string };

export function InternalFinanceControlsClient({ accounts, metrics }: { accounts: Account[]; metrics: Array<{ label: string; value: string }> }) {
  const locale = useAppLocale();
  const t = (key: Parameters<typeof translateInternalAdmin>[1]) => translateInternalAdmin(locale, key);
  const [status, setStatus] = useState("ALL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = accounts.find((account) => account.id === selectedId);
  const statuses = useMemo(() => Array.from(new Set(accounts.map((account) => account.status))), [accounts]);
  const visible = useMemo(() => accounts.filter((account) => {
    if (status === "RECONCILE" && !account.reconciliationIssue && account.currency) return false;
    if (status !== "ALL" && status !== "RECONCILE" && account.status !== status) return false;
    const created = Date.parse(account.createdAt);
    if (start && created < Date.parse(`${start}T00:00:00`)) return false;
    if (end && created > Date.parse(`${end}T23:59:59`)) return false;
    return true;
  }), [accounts, status, start, end]);
  const getSearchText = useCallback((account: Account) => [account.id, account.name, account.accountType, account.status, account.currency, account.balance, account.reconciliationIssue].join(" "), []);
  const list = useSmartList({ items: visible, pageSize: 12, getSearchText });

  return <section data-dtsc-treasury-workspace className="min-w-0 space-y-3">
    <p className="text-xs leading-5 text-dtsc-muted">{t("treasuryIntro")}</p>
    <details className="border-y border-dtsc-border py-2" open><summary className="cursor-pointer text-xs font-black text-dtsc-blue">{t("reconciliation")} · {metrics.length} {t("indicators")}</summary><dl className="mt-2 grid min-w-0 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">{metrics.map((metric) => <div key={metric.label} className="min-w-0 border-b border-dtsc-border/70 py-2"><dt className="text-[0.7rem] font-bold text-dtsc-muted">{translateInternalAdminSystemCopy(locale, metric.label)}</dt><dd className="mt-1 break-words text-sm font-black text-dtsc-ink">{metric.value}</dd></div>)}</dl></details>
    <div className="flex min-w-0 flex-wrap items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">{t("createdFrom")}<Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-10 rounded-lg" /></label><label className="grid min-w-0 flex-1 gap-1 text-xs font-bold text-dtsc-muted sm:max-w-48">{t("to")}<Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-10 rounded-lg" /></label>{start || end ? <button type="button" onClick={() => { setStart(""); setEnd(""); }} className="min-h-10 rounded-lg border border-dtsc-border px-3 text-xs font-bold text-dtsc-blue">{t("clear")}</button> : null}</div>
    <nav aria-label={t("filterAccounts")} className="flex min-w-0 gap-1.5 overflow-x-auto py-1">{["ALL", "RECONCILE", ...statuses].map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); list.setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === value ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{value === "ALL" ? t("all") : value === "RECONCILE" ? t("toReconcile") : translateInternalAdminStatus(locale, value)} · {value === "ALL" ? accounts.length : value === "RECONCILE" ? accounts.filter((account) => Boolean(account.reconciliationIssue) || !account.currency).length : accounts.filter((account) => account.status === value).length}</button>)}</nav>
    <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder={t("searchAccount")} />
    {list.paginatedItems.length ? <BusinessList ariaLabel={t("internalAccounts")}>{list.paginatedItems.map((account) => <BusinessListItem key={account.id} title={account.name} meta={`${account.accountType} · ${account.balance} ${account.currency || "—"}`} status={<StatusBadge tone={account.reconciliationIssue || !account.currency ? "warning" : "success"}>{account.reconciliationIssue || !account.currency ? t("toReconcile") : translateInternalAdminStatus(locale, account.status)}</StatusBadge>} onOpen={() => setSelectedId(account.id)} openLabel={`${t("viewAccount")} ${account.name}`} className="!py-2" actions={<ContextActions label={`${t("actionsFor")} ${account.name}`} actions={[{ id: "view", label: t("view"), icon: Eye, onSelect: () => setSelectedId(account.id) }]} />} />)}</BusinessList> : <EmptyState compact title={t("noAccount")} description={t("noAccountDescription")} />}
    <InternalFullScreenSurface open={Boolean(selected)} title={selected?.name || t("account")} subtitle={t("treasuryDetail")} onClose={close} level={2}>
      {selected ? <div data-dtsc-treasury-detail className="min-w-0 space-y-4"><StatusBadge tone={selected.reconciliationIssue || !selected.currency ? "warning" : "success"}>{selected.reconciliationIssue || !selected.currency ? t("reconciliationRequired") : translateInternalAdminStatus(locale, selected.status)}</StatusBadge><dl className="grid min-w-0 sm:grid-cols-2">{[[t("account"), selected.name], [t("accountNature"), selected.accountType], [t("currency"), selected.currency || t("uncertified")], [t("indicativeBalance"), `${selected.balance} ${selected.currency || "—"}`], [t("creationDate"), new Date(selected.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR")], [t("updatedDate"), new Date(selected.updatedAt).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR")], [t("reconciliationObservation"), selected.reconciliationIssue || t("noAnomaly")]].map(([label, value]) => <div key={label} className="min-w-0 border-b border-dtsc-border p-3"><dt className="text-xs font-bold uppercase text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-black text-dtsc-ink">{value}</dd></div>)}</dl></div> : null}
    </InternalFullScreenSurface>
  </section>;
}
