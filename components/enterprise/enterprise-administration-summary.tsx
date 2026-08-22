"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleHeader, ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAdminDashboard, EnterpriseAdminOrganization, EnterpriseMemberItem, EnterpriseModuleItem, EnterpriseSaasEntitlements } from "@/lib/enterprise/enterprise-admin-types";
import { translateWorkspaceGeneralization } from "@/lib/i18n";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";

export function EnterpriseAdministrationSummary({
  organization,
  dashboard,
  entitlements,
  activeMembers,
  pendingMembers,
  visibleModules,
}: {
  organization: EnterpriseAdminOrganization;
  dashboard: EnterpriseAdminDashboard;
  entitlements: EnterpriseSaasEntitlements;
  activeMembers: EnterpriseMemberItem[];
  pendingMembers: EnterpriseMemberItem[];
  visibleModules: EnterpriseModuleItem[];
}) {
  const locale = useAppLocale();
  const enabledModules = visibleModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length;
  const t = (key: Parameters<typeof translateWorkspaceGeneralization>[1]) => translateWorkspaceGeneralization(locale, key);
  const sectorLabel = locale === "en"
    ? organization.businessSector?.labelEn || organization.sector || "Sector to specify"
    : organization.businessSector?.labelFr || organization.sector || "Secteur à préciser";
  const subscriptionStatus = formatEnumLabelForLocale(entitlements.subscriptionStatus, locale);

  return (
    <>
      <ModuleHeader
        eyebrow={t("enterpriseAdministration")}
        title={`${t("enterpriseAdministration")} · ${organization.name}`}
        count={sectorLabel}
        description={locale === "en" ? `Modules, positions, permissions, procedures and settings for ${organization.name}. Actions remain limited to this company.` : `Modules, postes, permissions, procédures et paramètres de ${organization.name}. Les actions restent limitées à cette entreprise.`}
      />

      <ModuleSection title={t("enterpriseContext")} description={t("enterpriseContextDescription")}>
        <div className="flex min-w-0 flex-wrap gap-2 border-y border-dtsc-border py-3">
          <StatusBadge tone="info">{sectorLabel}</StatusBadge>
          <StatusBadge>Plan {entitlements.planLabel}</StatusBadge>
          <StatusBadge tone={entitlements.subscriptionActive ? "success" : "warning"}>
            {entitlements.subscriptionActive ? (locale === "en" ? "Active subscription" : "Abonnement actif") : `${locale === "en" ? "Status" : "Statut"} ${subscriptionStatus}`}
          </StatusBadge>
        </div>
      </ModuleSection>

      <ModuleMetrics label={t("administrationIndicators")}>
        <ModuleMetric label={t("activeCollaborators")} value={activeMembers.length} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxUsers}`} />
        <ModuleMetric label={locale === "en" ? "Active modules" : "Modules actifs"} value={`${enabledModules}/${visibleModules.length}`} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxActiveModules}`} />
        <ModuleMetric label={t("openRequests")} value={dashboard.openRequestsCount} hint={locale === "en" ? `${dashboard.submittedRequestsCount} submitted · ${dashboard.inReviewRequestsCount} in review` : `${dashboard.submittedRequestsCount} soumises · ${dashboard.inReviewRequestsCount} en revue`} />
        <ModuleMetric label={locale === "en" ? "Open tasks" : "Tâches ouvertes"} value={dashboard.openTasksCount} hint={locale === "en" ? `${dashboard.overdueTasksCount} overdue · ${dashboard.blockedTasksCount} blocked` : `${dashboard.overdueTasksCount} en retard · ${dashboard.blockedTasksCount} bloquées`} />
        <ModuleMetric label={locale === "en" ? "Pending validations" : "Validations en attente"} value={dashboard.pendingValidationsCount} />
        <ModuleMetric label={locale === "en" ? "Upcoming meetings" : "Réunions à venir"} value={dashboard.upcomingMeetingsCount} hint={locale === "en" ? `${dashboard.todayMeetingsCount} today` : `${dashboard.todayMeetingsCount} aujourd’hui`} />
        <ModuleMetric label={locale === "en" ? "Recent documents" : "Documents récents"} value={dashboard.recentDocumentsCount} />
        <ModuleMetric label={locale === "en" ? "Active budgets" : "Budgets actifs"} value={dashboard.activeBudgetsCount} />
        <ModuleMetric label={locale === "en" ? "Active suppliers" : "Fournisseurs actifs"} value={dashboard.activeSuppliersCount} />
        <ModuleMetric label={locale === "en" ? "Generated reports" : "Rapports générés"} value={dashboard.generatedReportsCount} hint={locale === "en" ? `${dashboard.publishedReportsCount} published` : `${dashboard.publishedReportsCount} publiés`} />
        <ModuleMetric label={locale === "en" ? "Pending invitations" : "Invitations en attente"} value={pendingMembers.length} />
      </ModuleMetrics>
    </>
  );
}
