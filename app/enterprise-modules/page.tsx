import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { getEnterpriseNavigationModules } from "@/lib/enterprise/enterprise-navigation";

export default async function EnterpriseModulesHubPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) {
    redirect("/dashboard");
  }

  const modules = await getEnterpriseNavigationModules(organizationId, user.id, user.locale);
  const groupedModules = new Map<string, typeof modules>();
  for (const enterpriseModule of modules) {
    const groupModules = groupedModules.get(enterpriseModule.navigationGroupLabel) || [];
    groupModules.push(enterpriseModule);
    groupedModules.set(enterpriseModule.navigationGroupLabel, groupModules);
  }

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={user.locale === "en" ? "Enterprise workspace" : "Espace entreprise"}
          title={user.locale === "en" ? "ERP modules" : "Modules ERP"}
          count={`${modules.length}`}
          description={user.locale === "en"
            ? "Only implemented, enabled, sector-compatible and authorized modules are shown."
            : "Seuls les modules implémentés, activés, compatibles avec le secteur et autorisés sont affichés."}
          primaryAction={(
            <Link href="/enterprise-admin" className="inline-flex h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue">
              <Layers3 className="h-4 w-4" />
              {user.locale === "en" ? "Administration" : "Administration"}
            </Link>
          )}
        />
        <ModuleContent>
          {Array.from(groupedModules.entries()).map(([groupLabel, groupModules]) => (
            <ModuleSection
              key={groupLabel}
              title={groupLabel}
              count={`${groupModules.length}`}
              description={user.locale === "en" ? "Modules available in the active enterprise context." : "Modules disponibles dans le contexte de l’entreprise active."}
            >
              <BusinessList ariaLabel={groupLabel}>
                {groupModules
                  .sort((left, right) => left.navigationOrder - right.navigationOrder)
                  .map((enterpriseModule) => (
                    <BusinessListItem
                      key={enterpriseModule.code}
                      title={enterpriseModule.label}
                      description={enterpriseModule.description}
                      status={<StatusBadge>{enterpriseModule.implementationStatus === "BETA" ? "Beta" : "Actif"}</StatusBadge>}
                      actions={(
                        <Link
                          href={enterpriseModule.href}
                          aria-label={`${user.locale === "en" ? "Open" : "Ouvrir"} ${enterpriseModule.label}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-dtsc-blue hover:bg-dtsc-soft"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    />
                  ))}
              </BusinessList>
            </ModuleSection>
          ))}
          {!modules.length ? (
            <ModuleSection title={user.locale === "en" ? "No available module" : "Aucun module disponible"}>
              <EmptyState
                compact
                title={user.locale === "en" ? "No authorized ERP module" : "Aucun module ERP autorisé"}
                description={user.locale === "en"
                  ? "Check the active organization, subscription, module configuration and position permissions."
                  : "Vérifiez l’organisation active, l’abonnement, la configuration des modules et les permissions du poste."}
              />
            </ModuleSection>
          ) : null}
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
