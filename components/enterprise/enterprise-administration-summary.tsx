import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleHeader, ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAdminDashboard, EnterpriseAdminOrganization, EnterpriseMemberItem, EnterpriseModuleItem, EnterpriseSaasEntitlements } from "@/lib/enterprise/enterprise-admin-types";

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
  const enabledModules = visibleModules.filter((enterpriseModule) => enterpriseModule.isEnabled).length;

  return (
    <>
      <ModuleHeader
        eyebrow="Administration entreprise"
        title={`Administration ${organization.name}`}
        count={organization.businessSector?.labelFr || organization.sector || "Secteur à préciser"}
        description={`Modules, postes, permissions, procédures et paramètres isolés pour ${organization.name}. Les actions restent limitées à cette organisation.`}
      />

      <ModuleSection title="Contexte entreprise" description="Abonnement, secteur et capacités réellement actives pour cette organisation.">
        <div className="flex min-w-0 flex-wrap gap-2 border-y border-dtsc-border py-3">
          <StatusBadge tone="info">{organization.sectorCode || "NO_SECTOR"}</StatusBadge>
          <StatusBadge>Plan {entitlements.planLabel}</StatusBadge>
          <StatusBadge tone={entitlements.subscriptionActive ? "success" : "warning"}>
            {entitlements.subscriptionActive ? "Abonnement actif" : `Statut ${entitlements.subscriptionStatus}`}
          </StatusBadge>
        </div>
      </ModuleSection>

      <ModuleMetrics label="Indicateurs administration entreprise">
        <ModuleMetric label="Collaborateurs actifs" value={activeMembers.length} hint={`Limite ${entitlements.limits.maxUsers}`} />
        <ModuleMetric label="Modules actifs" value={`${enabledModules}/${visibleModules.length}`} hint={`Limite ${entitlements.limits.maxActiveModules}`} />
        <ModuleMetric label="Demandes ouvertes" value={dashboard.openRequestsCount} hint={`${pendingMembers.length} invitation(s)`} />
        <ModuleMetric label="Tâches ouvertes" value={dashboard.openTasksCount} hint={`${dashboard.overdueTasksCount} en retard`} />
        <ModuleMetric label="Validations en attente" value={dashboard.pendingValidationsCount} />
        <ModuleMetric label="Documents récents" value={dashboard.recentDocumentsCount} />
        <ModuleMetric label="Budgets actifs" value={dashboard.activeBudgetsCount} />
        <ModuleMetric label="Fournisseurs actifs" value={dashboard.activeSuppliersCount} />
      </ModuleMetrics>
    </>
  );
}
