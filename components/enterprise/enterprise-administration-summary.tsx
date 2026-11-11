"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleHeader } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAdminDashboard, EnterpriseAdminOrganization, EnterpriseModuleItem, EnterpriseSaasEntitlements } from "@/lib/enterprise/enterprise-admin-types";
import { translateWorkspaceGeneralization } from "@/lib/i18n";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";

export function EnterpriseAdministrationSummary({
  organization,
  dashboard,
  entitlements,
  visibleModules,
}: {
  organization: EnterpriseAdminOrganization;
  dashboard: EnterpriseAdminDashboard;
  entitlements: EnterpriseSaasEntitlements;
  visibleModules: EnterpriseModuleItem[];
}) {
  const locale = useAppLocale();
  const router = useRouter();
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  useToastMessage(reportMessage);
  const enabledModules = visibleModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length;
  const t = (key: Parameters<typeof translateWorkspaceGeneralization>[1]) => translateWorkspaceGeneralization(locale, key);
  const sectorLabel = locale === "en"
    ? organization.businessSector?.labelEn || organization.sector || "Sector to specify"
    : organization.businessSector?.labelFr || organization.sector || "Secteur à préciser";
  const subscriptionStatus = formatEnumLabelForLocale(entitlements.subscriptionStatus, locale);
  const quotas = [
    { label: locale === "en" ? "Active collaborators" : "Collaborateurs actifs", used: dashboard.activeMembersCount, limit: entitlements.limits.maxUsers },
    { label: locale === "en" ? "Active modules" : "Modules actifs", used: dashboard.activeModulesCount, limit: entitlements.limits.maxActiveModules },
  ];
  const reportsEnabled = visibleModules.some((item) => (item.canonicalCode || item.moduleCode) === "REPORTS" && item.isEnabled && item.accessAllowed !== false);

  async function createAdministrationReport() {
    if (reportBusy) return;
    setReportBusy(true);
    setReportMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organization.id}/administration/report`, { method: "POST" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) {
        setReportMessage(body?.message || (locale === "en" ? "Report creation requires Administration and Reports permissions." : "La création exige les droits Administration et Rapports."));
        return;
      }
      setReportMessage(locale === "en" ? "Administration snapshot saved to Reports." : "Rapport d’administration enregistré dans le module Rapports.");
      router.refresh();
    } catch {
      setReportMessage(locale === "en" ? "Unable to create the administration report. Retry after checking your connection." : "Impossible de créer le rapport d’administration. Vérifiez votre connexion et réessayez.");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <>
      <ModuleHeader
        eyebrow={t("enterpriseAdministration")}
        title={organization.name}
        count={sectorLabel}
        description={locale === "en" ? "Administration, permissions and configuration of the active company." : "Gouvernance, autorisations et configuration de l’entreprise active."}
      />

      <div aria-label={t("enterpriseContext")} className="flex min-w-0 flex-wrap gap-2 rounded-xl bg-dtsc-page p-2">
          <StatusBadge tone="info">{sectorLabel}</StatusBadge>
          <StatusBadge>Plan {entitlements.planLabel}</StatusBadge>
          <StatusBadge tone={entitlements.subscriptionActive ? "success" : "warning"}>
            {entitlements.subscriptionActive ? (locale === "en" ? "Active subscription" : "Abonnement actif") : `${locale === "en" ? "Status" : "Statut"} ${subscriptionStatus}`}
          </StatusBadge>
        <StatusBadge tone={dashboard.securityIncidentsCount > 0 ? "danger" : "success"}>{dashboard.securityIncidentsCount} {locale === "en" ? "security alert(s)" : "alerte(s) de sécurité"}</StatusBadge>
        <StatusBadge tone={dashboard.configurationIssuesCount > 0 ? "warning" : "success"}>{dashboard.configurationIssuesCount} {locale === "en" ? "configuration issue(s)" : "anomalie(s) de configuration"}</StatusBadge>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {quotas.map((quota) => {
          const isLimited = quota.limit > 0;
          const ratio = isLimited ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
          const tone = ratio >= 100 ? "bg-red-500" : ratio >= 80 ? "bg-amber-500" : "bg-emerald-500";
          return <div key={quota.label} className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2.5" title={isLimited ? `${quota.used}/${quota.limit}` : String(quota.used)}>
            <div className="flex justify-between gap-3 text-xs"><span className="font-bold text-dtsc-ink">{quota.label}</span><span className="tabular-nums text-dtsc-muted">{quota.used} / {isLimited ? quota.limit : (locale === "en" ? "Unlimited" : "Illimité")}</span></div>
            {isLimited ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dtsc-page" role="progressbar" aria-label={quota.label} aria-valuenow={Math.min(quota.used, quota.limit)} aria-valuemin={0} aria-valuemax={quota.limit}><div className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${tone}`} style={{ width: `${ratio}%` }} /></div> : null}
          </div>;
        })}
      </div>

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label={locale === "en" ? "Administrative priorities" : "Priorités administratives"}>
        {[
          { href: "/enterprise-admin?section=members", label: locale === "en" ? "Pending invitations" : "Invitations en attente", count: dashboard.pendingInvitationsCount, tone: "text-cyan-600" },
          { href: "/enterprise-admin?section=pending", label: locale === "en" ? "Pending approvals" : "Validations à traiter", count: dashboard.pendingValidationsCount, tone: "text-amber-600" },
          { href: "/enterprise-admin?section=audit", label: locale === "en" ? "Security warnings" : "Alertes de sécurité", count: dashboard.securityIncidentsCount, tone: dashboard.securityIncidentsCount ? "text-red-600" : "text-emerald-600" },
          { href: "/enterprise-modules/REPORTS", label: locale === "en" ? "Published reports" : "Rapports publiés", count: dashboard.publishedReportsCount, tone: "text-violet-600" },
        ].map((item) => <Link key={item.href} href={item.href} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 transition-colors hover:border-cyan-500/50 hover:bg-dtsc-page focus-visible:ring-2 focus-visible:ring-cyan-500"><span className="text-xs font-bold text-dtsc-ink">{item.label}</span><span className="flex items-center gap-1"><span className={`font-black tabular-nums ${item.tone}`}>{item.count}</span><ChevronRight className="h-4 w-4 text-dtsc-muted" /></span></Link>)}
      </nav>

      {reportsEnabled && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
        <div><p className="text-sm font-black text-dtsc-ink">{locale === "en" ? "Administration report" : "Rapport d’administration"}</p><p className="text-xs text-dtsc-muted">{locale === "en" ? "Save an auditable point-in-time snapshot of the current canonical indicators." : "Enregistrez un état daté et traçable des indicateurs canoniques dans Rapports."}</p></div>
        <button type="button" onClick={() => void createAdministrationReport()} disabled={reportBusy} className="min-h-10 rounded-xl bg-[var(--dtsc-product-accent)] px-3 text-xs font-black text-white disabled:opacity-50">{reportBusy ? (locale === "en" ? "Generating…" : "Génération…") : (locale === "en" ? "Save to Reports" : "Enregistrer dans Rapports")}</button>
      </div>}

      <details className="group rounded-xl border border-dtsc-border bg-dtsc-surface p-2">
      <summary className="min-h-11 cursor-pointer px-2 py-2 text-sm font-black text-dtsc-ink focus-visible:ring-2 focus-visible:ring-cyan-500">{t("administrationIndicators")} · {locale === "en" ? "See all operational indicators" : "Voir tous les indicateurs opérationnels"}</summary>
      <ModuleMetrics label={t("administrationIndicators")}>
        <ModuleMetric label={t("activeCollaborators")} value={dashboard.activeMembersCount} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxUsers}`} />
        <ModuleMetric label={locale === "en" ? "Active modules" : "Modules actifs"} value={`${enabledModules}/${visibleModules.length}`} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxActiveModules}`} />
        <ModuleMetric label={t("openRequests")} value={dashboard.openRequestsCount} hint={locale === "en" ? `${dashboard.submittedRequestsCount} submitted · ${dashboard.inReviewRequestsCount} in review` : `${dashboard.submittedRequestsCount} soumises · ${dashboard.inReviewRequestsCount} en revue`} />
        <ModuleMetric label={locale === "en" ? "Open tasks" : "Tâches ouvertes"} value={dashboard.openTasksCount} hint={locale === "en" ? `${dashboard.overdueTasksCount} overdue · ${dashboard.blockedTasksCount} blocked` : `${dashboard.overdueTasksCount} en retard · ${dashboard.blockedTasksCount} bloquées`} />
        <ModuleMetric label={locale === "en" ? "Pending validations" : "Validations en attente"} value={dashboard.pendingValidationsCount} />
        <ModuleMetric label={locale === "en" ? "Upcoming meetings" : "Réunions à venir"} value={dashboard.upcomingMeetingsCount} hint={locale === "en" ? `${dashboard.todayMeetingsCount} today` : `${dashboard.todayMeetingsCount} aujourd’hui`} />
        <ModuleMetric label={locale === "en" ? "Recent documents" : "Documents récents"} value={dashboard.recentDocumentsCount} />
        <ModuleMetric label={locale === "en" ? "Active budgets" : "Budgets actifs"} value={dashboard.activeBudgetsCount} />
        <ModuleMetric label={locale === "en" ? "Active suppliers" : "Fournisseurs actifs"} value={dashboard.activeSuppliersCount} />
        <ModuleMetric label={locale === "en" ? "Generated reports" : "Rapports générés"} value={dashboard.generatedReportsCount} hint={locale === "en" ? `${dashboard.publishedReportsCount} published` : `${dashboard.publishedReportsCount} publiés`} />
        <ModuleMetric label={locale === "en" ? "Pending invitations" : "Invitations en attente"} value={dashboard.pendingInvitationsCount} />
      </ModuleMetrics>
      </details>
    </>
  );
}
