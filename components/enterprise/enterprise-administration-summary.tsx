"use client";

import { useAppLocale } from "@/components/i18n/locale-provider";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleHeader, ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAdminDashboard, EnterpriseAdminOrganization, EnterpriseMemberItem, EnterpriseModuleItem, EnterpriseSaasEntitlements } from "@/lib/enterprise/enterprise-admin-types";
import { translateWorkspaceGeneralization } from "@/lib/i18n";

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

  return (
    <>
      <ModuleHeader
        eyebrow={t("enterpriseAdministration")}
        title={`${t("enterpriseAdministration")} · ${organization.name}`}
        count={organization.businessSector?.labelFr || organization.sector || organization.sectorCode || "NO_SECTOR"}
        description={locale === "en" ? `Modules, positions, permissions, procedures and settings isolated for ${organization.name}. Actions remain limited to this organization.` : `Modules, postes, permissions, procédures et paramètres isolés pour ${organization.name}. Les actions restent limitées à cette organisation.`}
      />

      <ModuleSection title={t("enterpriseContext")} description={t("enterpriseContextDescription")}>
        <div className="flex min-w-0 flex-wrap gap-2 border-y border-dtsc-border py-3">
          <StatusBadge tone="info">{organization.sectorCode || "NO_SECTOR"}</StatusBadge>
          <StatusBadge>Plan {entitlements.planLabel}</StatusBadge>
          <StatusBadge tone={entitlements.subscriptionActive ? "success" : "warning"}>
            {entitlements.subscriptionActive ? (locale === "en" ? "Active subscription" : "Abonnement actif") : `${locale === "en" ? "Status" : "Statut"} ${entitlements.subscriptionStatus}`}
          </StatusBadge>
        </div>
      </ModuleSection>

      <ModuleMetrics label={t("administrationIndicators")}>
        <ModuleMetric label={t("activeCollaborators")} value={activeMembers.length} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxUsers}`} />
        <ModuleMetric label={locale === "en" ? "Active modules" : "Modules actifs"} value={`${enabledModules}/${visibleModules.length}`} hint={`${locale === "en" ? "Limit" : "Limite"} ${entitlements.limits.maxActiveModules}`} />
        <ModuleMetric label={t("openRequests")} value={dashboard.openRequestsCount} hint={`${pendingMembers.length} ${locale === "en" ? "invitation(s)" : "invitation(s)"}`} />
        <ModuleMetric label={locale === "en" ? "Open tasks" : "Tâches ouvertes"} value={dashboard.openTasksCount} hint={`${dashboard.overdueTasksCount} ${locale === "en" ? "overdue" : "en retard"}`} />
        <ModuleMetric label={locale === "en" ? "Pending validations" : "Validations en attente"} value={dashboard.pendingValidationsCount} />
        <ModuleMetric label={locale === "en" ? "Recent documents" : "Documents récents"} value={dashboard.recentDocumentsCount} />
        <ModuleMetric label={locale === "en" ? "Active budgets" : "Budgets actifs"} value={dashboard.activeBudgetsCount} />
        <ModuleMetric label={locale === "en" ? "Active suppliers" : "Fournisseurs actifs"} value={dashboard.activeSuppliersCount} />
      </ModuleMetrics>
    </>
  );
}
