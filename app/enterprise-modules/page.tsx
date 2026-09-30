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
import {
  FINANCE_NAVIGATION_SECTIONS,
  getFinanceNavigationSectionCode,
  getFinanceNavigationSectionDescription,
  getFinanceNavigationSectionLabel,
} from "@/lib/enterprise/finance-navigation-sections";

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

  const renderModuleList = (items: typeof modules, ariaLabel: string) => (
    <BusinessList ariaLabel={ariaLabel}>
      {items
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
  );

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
              {groupModules[0]?.navigationGroup === "FINANCE" ? (
                <div className="space-y-5">
                  {FINANCE_NAVIGATION_SECTIONS.map((section) => {
                    const sectionModules = groupModules.filter(
                      (enterpriseModule) => getFinanceNavigationSectionCode(enterpriseModule.code) === section.code,
                    );
                    if (!sectionModules.length) return null;
                    const sectionLabel = getFinanceNavigationSectionLabel(section, user.locale);
                    return (
                      <section key={section.code} className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface/60 p-4 sm:p-5">
                        <div className="mb-4 min-w-0">
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <h3 className="min-w-0 break-words text-sm font-black text-dtsc-ink">{sectionLabel}</h3>
                            <span className="shrink-0 rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-muted">
                              {sectionModules.length}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">
                            {getFinanceNavigationSectionDescription(section, user.locale)}
                          </p>
                        </div>
                        {renderModuleList(sectionModules, sectionLabel)}
                      </section>
                    );
                  })}
                </div>
              ) : renderModuleList(groupModules, groupLabel)}
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
