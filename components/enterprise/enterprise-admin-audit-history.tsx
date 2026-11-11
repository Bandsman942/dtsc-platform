"use client";

import { useEffect, useMemo, useState } from "react";
import { EnterpriseAdminExportMenu, EnterpriseAdminListToolbar, EnterpriseAdminPagination } from "@/components/enterprise/enterprise-admin-list-toolbar";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAuditItem, EnterpriseMemberItem, EnterpriseModuleConfigurationIssue } from "@/lib/enterprise/enterprise-admin-types";
import type { ProfessionalReportExportModel } from "@/lib/reporting/professional-export";

type AuditPage = { items: EnterpriseAuditItem[]; pagination: { total: number; pageCount: number } };

const riskCodes = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function EnterpriseAdminAuditHistory({ organizationId, organizationName, members, issues, locale }: {
  organizationId: string;
  organizationName: string;
  members: EnterpriseMemberItem[];
  issues: EnterpriseModuleConfigurationIssue[];
  locale?: string | null;
}) {
  const english = locale === "en";
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const names = useMemo(() => new Map(members.map((member) => [member.user.id, member.user.name])), [members]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "30" });
        if (search.trim()) params.set("action", search.trim());
        if (risk !== "ALL") params.set("risk", risk);
        if (from) params.set("from", `${from}T00:00:00.000Z`);
        if (to) params.set("to", `${to}T23:59:59.999Z`);
        const response = await fetch(`/api/enterprise/${organizationId}/administration/audit?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null) as AuditPage | null;
        if (!response.ok || !body || !Array.isArray(body.items) || !body.pagination) throw new Error("AUDIT_DIRECTORY_UNAVAILABLE");
        setData(body);
        setError("");
      } catch {
        if (!controller.signal.aborted) setError(english ? "Unable to load the audit history. Check your permissions or connection." : "Impossible de charger l’historique. Vérifiez vos autorisations ou votre connexion.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [organizationId, search, risk, from, to, page, english]);

  const items = data?.items || [];
  const exportModel: ProfessionalReportExportModel = {
    title: english ? "Audit history — current page" : "Historique d’audit — page affichée",
    organizationName, filenameBase: `dtsc-administration-audit-page-${page}`,
    subtitle: english ? "Filtered audit extract (30 rows per page)" : "Extrait filtré (30 lignes par page)",
    generatedLabel: new Date().toLocaleString(english ? "en" : "fr"),
    kpis: [{ label: english ? "Rows on this page" : "Lignes sur cette page", value: String(items.length) }, { label: english ? "Total matches" : "Total correspondant", value: String(data?.pagination.total || 0) }],
    chart: [], columns: [
      { key: "at", label: english ? "Date" : "Date" }, { key: "actor", label: english ? "Actor" : "Acteur" },
      { key: "action", label: "Action" }, { key: "result", label: english ? "Result" : "Résultat" },
      { key: "risk", label: english ? "Risk" : "Risque" }, { key: "reason", label: "Reason code" },
    ],
    rows: items.map((item) => ({ at: new Date(item.createdAt).toLocaleString(english ? "en" : "fr"), actor: names.get(item.userId || "") || item.userId || "—", action: item.action, result: item.result, risk: item.riskLevel || "—", reason: item.reasonCode || "—" })),
    insights: [{ title: english ? "Export scope" : "Périmètre de l’export", body: english ? "This document contains only the displayed page; use the complete secured CSV export for the full audit." : "Ce document contient uniquement la page affichée ; utilisez l’export CSV sécurisé pour l’historique intégral." }],
    filters: [{ label: "Action", value: search || "—" }, { label: english ? "Risk" : "Risque", value: risk }, { label: english ? "From" : "Du", value: from || "—" }, { label: english ? "Until" : "Au", value: to || "—" }],
  };

  return <div className="space-y-3">
    {issues.length ? <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-black text-amber-800 dark:text-amber-300">{issues.length} {english ? "configuration warnings" : "points de cohérence à vérifier"}</summary>
      <div className="mt-2 space-y-2">{issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="rounded-lg border border-dtsc-border bg-dtsc-surface p-3 text-xs text-dtsc-ink"><StatusBadge tone={issue.severity === "ERROR" ? "danger" : "warning"}>{issue.severity}</StatusBadge><span className="ml-2 font-bold">{issue.moduleLabel || issue.code}</span><p className="mt-1 text-dtsc-muted">{issue.message}</p></div>)}</div>
    </details> : <p className="rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">{english ? "No detected module configuration inconsistencies." : "Aucune incohérence de configuration des modules détectée."}</p>}
    <EnterpriseAdminListToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={english ? "Search audit actions…" : "Rechercher une action d’audit…"}
      filters={riskCodes.map((code) => ({ value: code, label: code === "ALL" ? (english ? "All risks" : "Tous les risques") : code }))}
      filter={risk} onFilterChange={(value) => { setRisk(value); setPage(1); }} resultCount={data?.pagination.total} locale={locale}>
      <EnterpriseAdminExportMenu model={exportModel} locale={locale} />
    </EnterpriseAdminListToolbar>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-bold text-dtsc-muted">{english ? "From (UTC)" : "Du (UTC)"}<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 block min-h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-dtsc-ink" /></label>
      <label className="text-xs font-bold text-dtsc-muted">{english ? "Until (UTC)" : "Au (UTC)"}<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 block min-h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-2 text-dtsc-ink" /></label>
      {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); setPage(1); }} className="min-h-10 rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink">{english ? "Clear dates" : "Effacer les dates"}</button>}
      <span className="self-end pb-2 text-xs text-dtsc-muted">{english ? "Displayed in your local time; date filters use UTC." : "Affichage en heure locale ; dates filtrées en UTC."}</span>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div aria-busy={busy} className="space-y-1.5">
      {busy && <p role="status" className="p-3 text-sm text-dtsc-muted">{english ? "Loading audit events…" : "Chargement de l’audit…"}</p>}
      {!busy && !items.length && !error && <p className="rounded-xl bg-dtsc-page p-4 text-sm text-dtsc-muted">{english ? "No event matches these filters." : "Aucun événement ne correspond à ces filtres."}</p>}
      {items.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2.5">
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-black text-dtsc-ink">{item.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-dtsc-muted">{names.get(item.userId || "") || (english ? "Authorized actor" : "Acteur autorisé")} · {new Date(item.createdAt).toLocaleString(english ? "en" : "fr")} · {item.entity}</p><p className="mt-1 text-xs text-dtsc-muted">{item.reasonCode || "—"}</p></div>
        <div className="flex gap-1"><StatusBadge tone={item.result === "FAILED" || item.result === "DENIED" ? "danger" : "success"}>{item.result}</StatusBadge><StatusBadge tone={item.riskLevel === "HIGH" || item.riskLevel === "CRITICAL" ? "warning" : "neutral"}>{item.riskLevel || "—"}</StatusBadge></div>
      </article>)}
    </div>
    <EnterpriseAdminPagination page={page} pageCount={data?.pagination.pageCount || 1} onPageChange={setPage} locale={locale} />
  </div>;
}
