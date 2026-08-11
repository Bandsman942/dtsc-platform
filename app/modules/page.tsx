import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Blocks, Bot, Gauge, LifeBuoy, ShieldCheck } from "lucide-react";
import type { ElementType } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleContent, ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { canAccessAdministration } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { getPendingEnterpriseInvitationCount } from "@/lib/enterprise-invitations";
import { getEnterpriseActivityBlocks } from "@/lib/enterprise/enterprise-activity-blocks-loader";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseNavigationModules } from "@/lib/enterprise/enterprise-navigation";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroup,
  getModuleNavigationGroupDescription,
  getModuleNavigationGroupHref,
  getModuleNavigationGroupLabel,
  getModuleNavigationSubgroupDescription,
  getModuleNavigationSubgroupLabel,
  isModuleNavigationGroupCode,
  type ModuleNavigationGroupCode,
} from "@/lib/navigation/module-navigation-groups";
import { listStandardNavigationItems } from "@/lib/modules/standard-module-navigation";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

type HubModule = {
  code: string;
  label: string;
  description: string;
  href: string;
  meta: string;
};

type HubSubgroup = {
  code: string;
  label: string;
  description: string;
  modules: HubModule[];
};

const ICON_BY_GROUP: Record<ModuleNavigationGroupCode, ElementType> = {
  PILOTAGE: Gauge,
  AI_COLLABORATION: Bot,
  ORGANIZATION_ERP: Blocks,
  ACCOUNT_SUPPORT: LifeBuoy,
  DTSC_INTERNAL: ShieldCheck,
};

export default async function ModulesHubPage({ searchParams }: { searchParams: Promise<{ group?: string; open?: string }> }) {
  const user = await requireUser();
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  const params = await searchParams;
  const requestedGroup: ModuleNavigationGroupCode = isModuleNavigationGroupCode(params.group) ? params.group : "PILOTAGE";
  const requestedModuleCode = String(params.open || "").trim().toUpperCase();
  const dtscInternalContext = isDtscInternalSession(session);
  const organizationId = session.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;

  const [employeeRecord, pendingEnterpriseInvitations, enterpriseModules, enterpriseActivityBlocks, enterpriseAdminDecision] = await Promise.all([
    dtscInternalContext
      ? prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } }, select: { id: true } })
      : Promise.resolve(null),
    getPendingEnterpriseInvitationCount(user.id),
    organizationId ? getEnterpriseNavigationModules(organizationId, user.id, user.locale) : Promise.resolve([]),
    organizationId ? getEnterpriseActivityBlocks(organizationId, user.id) : Promise.resolve([]),
    organizationId
      ? resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "ADMIN_DASHBOARD", action: "manage" })
      : Promise.resolve(null),
  ]);

  const canOpenInternalGroup = dtscInternalContext && (Boolean(employeeRecord) || canAccessAdministration(user.role));
  if (requestedGroup === "DTSC_INTERNAL" && !canOpenInternalGroup) redirect(getModuleNavigationGroupHref("PILOTAGE"));

  const group = getModuleNavigationGroup(requestedGroup);
  if (!group) redirect(getModuleNavigationGroupHref("PILOTAGE"));

  const standardCodeAllowed = (code: string) => {
    if (code === "CALENDAR") return dtscInternalContext || Boolean(organizationId);
    if (code === "ENTERPRISE_INVITATIONS") return pendingEnterpriseInvitations > 0;
    if (code === "ENTERPRISE_ACTIVITIES") return Boolean(organizationId && enterpriseActivityBlocks.length > 0);
    if (code === "ENTERPRISE_MODULES_SUBSCRIPTION") return Boolean(organizationId);
    if (code === "ENTERPRISE_ADMINISTRATION") return enterpriseAdminDecision?.allowed === true;
    if (code === "DTSC_ACTIVITIES") return dtscInternalContext && Boolean(employeeRecord);
    if (code === "DTSC_INTERNAL_ADMIN") return dtscInternalContext && canAccessAdministration(user.role);
    return true;
  };

  const knownStandardCodes = new Set(
    MODULE_NAVIGATION_GROUPS.flatMap((navigationGroup) => navigationGroup.subgroups.flatMap((subgroup) => subgroup.standardModuleCodes)),
  );
  let requestedModuleDenied = false;
  if (requestedModuleCode) {
    const enterpriseDestination = enterpriseModules.find((item) => item.code.toUpperCase() === requestedModuleCode);
    if (enterpriseDestination) redirect(enterpriseDestination.href);

    if (knownStandardCodes.has(requestedModuleCode) && standardCodeAllowed(requestedModuleCode)) {
      const [standardDestination] = listStandardNavigationItems({ includeCodes: [requestedModuleCode], locale: user.locale });
      if (standardDestination) redirect(standardDestination.href);
    }
    requestedModuleDenied = true;
  }

  const standardSubgroups: HubSubgroup[] = group.subgroups.map((subgroup) => {
    const codes = subgroup.standardModuleCodes.filter(standardCodeAllowed);
    const modules = listStandardNavigationItems({ includeCodes: codes, locale: user.locale }).map((item) => ({
      code: item.code,
      label: item.label,
      description: item.description,
      href: item.href,
      meta: item.host === "APP" ? "DTSC Platform" : item.host,
    }));
    return {
      code: subgroup.code,
      label: getModuleNavigationSubgroupLabel(subgroup, user.locale),
      description: getModuleNavigationSubgroupDescription(subgroup, user.locale),
      modules,
    };
  }).filter((subgroup) => subgroup.modules.length > 0);

  const enterpriseSubgroups: HubSubgroup[] = [];
  if (requestedGroup === "ORGANIZATION_ERP" && organizationId && enterpriseModules.length > 0) {
    const grouped = new Map<string, typeof enterpriseModules>();
    for (const enterpriseModule of enterpriseModules) {
      const current = grouped.get(enterpriseModule.navigationGroup) || [];
      current.push(enterpriseModule);
      grouped.set(enterpriseModule.navigationGroup, current);
    }
    for (const [code, modules] of grouped.entries()) {
      const label = modules[0]?.navigationGroupLabel || code;
      enterpriseSubgroups.push({
        code: `ERP_${code}`,
        label,
        description: user.locale === "en"
          ? "Modules available for the active company workspace."
          : "Modules disponibles pour l’espace entreprise actif.",
        modules: modules
          .sort((left, right) => left.navigationOrder - right.navigationOrder)
          .map((enterpriseModule) => ({
            code: enterpriseModule.code,
            label: enterpriseModule.label,
            description: enterpriseModule.description,
            href: enterpriseModule.href,
            meta: enterpriseModule.navigationGroupLabel,
          })),
      });
    }
  }

  const subgroups = [...standardSubgroups, ...enterpriseSubgroups];
  const visibleGroups = MODULE_NAVIGATION_GROUPS.filter((item) => item.code !== "DTSC_INTERNAL" || canOpenInternalGroup);
  const GroupIcon = ICON_BY_GROUP[group.code];
  const isEnglish = user.locale === "en";

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={isEnglish ? "Grouped navigation" : "Navigation groupée"}
          title={getModuleNavigationGroupLabel(group, user.locale)}
          count={session.activeOrganizationName || (dtscInternalContext ? "DTSC" : isEnglish ? "Personal space" : "Espace personnel")}
          description={getModuleNavigationGroupDescription(group, user.locale)}
          primaryAction={requestedGroup === "AI_COLLABORATION" ? (
            <Link href="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-4 text-sm font-black text-white hover:bg-[#001736]">
              <Bot className="h-4 w-4" />
              {isEnglish ? "New AI chat" : "Nouveau chat IA"}
            </Link>
          ) : undefined}
        />

        <nav aria-label={isEnglish ? "Module groups" : "Groupes de modules"} className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {visibleGroups.map((item) => {
            const Icon = ICON_BY_GROUP[item.code];
            const active = item.code === requestedGroup;
            return (
              <Link key={item.code} href={getModuleNavigationGroupHref(item.code)} aria-current={active ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-3 text-xs font-black transition ${active ? "border-cyan-300/50 bg-cyan-400/14 text-cyan-600" : "border-dtsc-border bg-dtsc-surface text-dtsc-muted hover:bg-dtsc-soft"}`}>
                <Icon className="h-4 w-4" />
                {getModuleNavigationGroupLabel(item, user.locale, true)}
              </Link>
            );
          })}
        </nav>

        <ModuleContent>
          {requestedModuleDenied ? (
            <div role="alert" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
              <strong className="block font-black">{isEnglish ? "This area is not available" : "Cet espace n’est pas accessible"}</strong>
              <span>{isEnglish ? "Your current workspace or permissions do not allow this destination. Choose another available module or change workspace if you have access elsewhere." : "Votre espace de travail actuel ou vos droits ne permettent pas d’ouvrir cette destination. Choisissez un autre module disponible ou changez d’espace si vous y avez accès ailleurs."}</span>
            </div>
          ) : null}

          <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface/70 p-4 sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-600"><GroupIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{isEnglish ? "Available in this workspace" : "Disponible dans cet espace"}</p>
              <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">
                {isEnglish ? "Open a subgroup to see the modules available in your current workspace." : "Dépliez un sous-groupe pour voir les modules disponibles dans votre espace de travail actuel."}
              </p>
            </div>
          </div>

          {subgroups.length > 0 ? (
            <Accordion>
              {subgroups.map((subgroup) => (
                <AccordionItem key={subgroup.code} title={`${subgroup.label} · ${subgroup.modules.length}`}>
                  <div className="min-w-0 space-y-4">
                    <p className="break-words text-sm leading-6 text-dtsc-muted">{subgroup.description}</p>
                    <BusinessList ariaLabel={subgroup.label}>
                      {subgroup.modules.map((hubModule) => (
                        <BusinessListItem key={`${subgroup.code}:${hubModule.code}`} title={hubModule.label} description={hubModule.description} status={<StatusBadge>{hubModule.meta}</StatusBadge>} actions={(
                          <Link href={hubModule.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">
                            {isEnglish ? "Open" : "Ouvrir"}<ArrowUpRight className="h-4 w-4" />
                          </Link>
                        )} />
                      ))}
                    </BusinessList>
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <EmptyState title={isEnglish ? "No module available" : "Aucun module disponible"} description={isEnglish ? "No module in this group is currently available for your active workspace." : "Aucun module de ce groupe n’est actuellement disponible dans votre espace actif."} />
          )}
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
