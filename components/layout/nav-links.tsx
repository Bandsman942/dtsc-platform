"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { Bell, Bot, BriefcaseBusiness, Building2, CalendarCheck, CalendarDays, CreditCard, Headphones, Layers3, LayoutDashboard, Megaphone, Settings, Shield, User, UserPlus, UsersRound } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { canAccessAdministration } from "@/lib/admin-access";
import { translate } from "@/lib/i18n";
import { resolveEnterpriseModuleIcon } from "@/lib/enterprise/enterprise-module-icons";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";
import { COMPANY_RELATIONSHIPS_NAVIGATION, getCompanyRelationshipsLabel } from "@/lib/navigation/company-relationships";
import { resolveStandardModuleHref } from "@/lib/modules/standard-module-navigation";
import { getStandardModuleDefinition } from "@/lib/modules/standard-module-registry";

type NavItem = {
  code: string;
  href: string;
  path: string;
  label: string;
  icon: ElementType;
  help: string;
  order: number;
};

function standardNavItem(code: string, icon: ElementType): NavItem {
  const definition = getStandardModuleDefinition(code);
  if (!definition?.routePath) {
    throw new Error(`Standard navigation module is not registered with a route: ${code}`);
  }
  const path = definition.routePath.split(/[?#]/, 1)[0] || "/";
  return {
    code: definition.code,
    href: resolveStandardModuleHref(definition) || definition.routePath,
    path,
    label: definition.labelFr,
    icon,
    help: definition.descriptionFr,
    order: definition.navigationOrder,
  };
}

const items: NavItem[] = [
  standardNavItem("DASHBOARD", LayoutDashboard),
  standardNavItem("GLOBAL_CHATBOT", Bot),
  standardNavItem("SUBSCRIPTION", CreditCard),
  standardNavItem("COMPANY_PROFILE", BriefcaseBusiness),
  standardNavItem("COMPANY_RELATIONSHIPS", Building2),
  standardNavItem("CALENDAR", CalendarDays),
  standardNavItem("COLLABORATORS", UsersRound),
  standardNavItem("NOTIFICATIONS", Bell),
  standardNavItem("ANNOUNCEMENTS", Megaphone),
  standardNavItem("SUPPORT", Headphones),
  standardNavItem("PROFILE", User),
  standardNavItem("SETTINGS", Settings),
].sort((left, right) => left.order - right.order);

export function NavLinks({
  role,
  mobile = false,
  unreadNotifications = 0,
  unreadCollaboratorMessages = 0,
  pendingEnterpriseInvitations = 0,
  pendingCompanyRelationships = 0,
  showEmployeeActivities = false,
  showInternalModules = false,
  showCollaborationModule = true,
  enterpriseContext = null,
  locale = "fr",
}: {
  role: UserRole;
  mobile?: boolean;
  unreadNotifications?: number;
  unreadCollaboratorMessages?: number;
  pendingEnterpriseInvitations?: number;
  pendingCompanyRelationships?: number;
  showEmployeeActivities?: boolean;
  showInternalModules?: boolean;
  showCollaborationModule?: boolean;
  enterpriseContext?: {
    organizationName: string;
    showAdmin: boolean;
    showActivities: boolean;
    modules: EnterpriseNavigationModule[];
  } | null;
  locale?: string | null;
}) {
  const pathname = usePathname();
  const employeeItems: NavItem[] = showInternalModules && showEmployeeActivities
    ? [standardNavItem("DTSC_ACTIVITIES", CalendarCheck)]
    : [];
  const visibleBaseItems = items.filter((item) => {
    if (item.code === "CALENDAR") {
      return showInternalModules || Boolean(enterpriseContext);
    }
    if (item.code === "COLLABORATORS") {
      return showCollaborationModule;
    }
    return true;
  });
  const invitationItems: NavItem[] = pendingEnterpriseInvitations > 0
    ? [standardNavItem("ENTERPRISE_INVITATIONS", UserPlus)]
    : [];
  const navItems: NavItem[] = showInternalModules && canAccessAdministration(role)
    ? [...visibleBaseItems, ...invitationItems, ...employeeItems, standardNavItem("DTSC_INTERNAL_ADMIN", Shield)]
    : [...visibleBaseItems, ...invitationItems, ...employeeItems];

  const translationByCode: Record<string, string> = {
    DASHBOARD: "navigation.dashboard",
    GLOBAL_CHATBOT: "navigation.chat",
    SUBSCRIPTION: "navigation.billing",
    COMPANY_PROFILE: "navigation.company",
    CALENDAR: "navigation.calendar",
    COLLABORATORS: "navigation.collaborators",
    NOTIFICATIONS: "navigation.notifications",
    ENTERPRISE_INVITATIONS: "navigation.invitations",
    ANNOUNCEMENTS: "navigation.announcements",
    SUPPORT: "navigation.support",
    PROFILE: "navigation.profile",
    SETTINGS: "navigation.settings",
    DTSC_ACTIVITIES: "navigation.activities",
    DTSC_INTERNAL_ADMIN: "navigation.admin",
  };

  const groupedEnterpriseModules = new Map<string, EnterpriseNavigationModule[]>();
  for (const enterpriseModule of enterpriseContext?.modules || []) {
    const groupModules = groupedEnterpriseModules.get(enterpriseModule.navigationGroup) || [];
    groupModules.push(enterpriseModule);
    groupedEnterpriseModules.set(enterpriseModule.navigationGroup, groupModules);
  }

  function renderItem(item: NavItem, labelOverride?: string) {
    const itemPath = item.path;
    const active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
    const showNotificationSignal = item.code === "NOTIFICATIONS" && unreadNotifications > 0;
    const showCollaborationSignal = item.code === "COLLABORATORS" && unreadCollaboratorMessages > 0;
    const showInvitationSignal = item.code === "ENTERPRISE_INVITATIONS" && pendingEnterpriseInvitations > 0;
    const showCompanyRelationshipSignal = item.code === COMPANY_RELATIONSHIPS_NAVIGATION.code && pendingCompanyRelationships > 0;
    const signalCount = showInvitationSignal
      ? pendingEnterpriseInvitations
      : showCompanyRelationshipSignal
        ? pendingCompanyRelationships
        : showNotificationSignal
          ? unreadNotifications
          : showCollaborationSignal
            ? unreadCollaboratorMessages
            : 0;
    const showSignal = showNotificationSignal || showInvitationSignal || showCollaborationSignal || showCompanyRelationshipSignal;
    const translationKey = translationByCode[item.code];
    const label = labelOverride
      || (item.code === COMPANY_RELATIONSHIPS_NAVIGATION.code
        ? getCompanyRelationshipsLabel(locale, mobile)
        : mobile && item.code === "DTSC_INTERNAL_ADMIN"
          ? "Admin"
          : translationKey
            ? translate(locale, translationKey)
            : item.label);
    return (
      <Link
        key={`${item.code}:${item.href}`}
        href={item.href}
        title={item.help}
        className={cn(
          "relative flex items-center gap-3 rounded-xl font-semibold transition",
          mobile ? "shrink-0 px-3 py-2 text-xs" : "px-3 py-2.5 text-sm",
          active
            ? "bg-cyan-400/15 text-cyan-300 shadow-[inset_3px_0_0_rgb(34,211,238)]"
            : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink",
        )}
        aria-current={active ? "page" : undefined}
      >
        <span className="relative inline-flex">
          <item.icon className={mobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {showSignal && (
            <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-dtsc-surface bg-cyan-400" />
            </span>
          )}
        </span>
        {label}
        {showSignal && (
          <span className="ml-auto rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-black leading-none text-[#001736]">
            {signalCount > 99 ? "99+" : signalCount}
          </span>
        )}
      </Link>
    );
  }

  const enterpriseHeader = enterpriseContext ? (
    <div className="mt-5 border-t border-dtsc-border pt-4">
      <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">
        {enterpriseContext.organizationName}
      </p>
    </div>
  ) : null;

  const enterpriseNavigation: ReactNode = enterpriseContext ? (
    <div className="space-y-1">
      {enterpriseContext.showActivities
        ? renderItem(
            standardNavItem("ENTERPRISE_ACTIVITIES", CalendarCheck),
            translate(locale, "navigation.enterpriseActivitiesNamed").replace("{organization}", enterpriseContext.organizationName),
          )
        : null}
      {renderItem(
        standardNavItem("ENTERPRISE_MODULES_SUBSCRIPTION", Layers3),
        locale === "en" ? "ERP modules" : "Modules ERP",
      )}
      {!mobile
        ? Array.from(groupedEnterpriseModules.entries()).map(([group, groupModules]) => {
            const groupLabel = groupModules[0]?.navigationGroupLabel || group;
            const hasActiveModule = groupModules.some((enterpriseModule) => pathname === enterpriseModule.href || pathname.startsWith(`${enterpriseModule.href}/`));
            return (
              <details key={group} open={hasActiveModule || group === "OPERATIONS"} className="group rounded-xl">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink">
                  <span>{groupLabel}</span>
                  <span className="rounded-full bg-dtsc-page px-2 py-0.5 text-[0.62rem]">{groupModules.length}</span>
                </summary>
                <div className="ml-2 border-l border-dtsc-border pl-2">
                  {groupModules
                    .sort((left, right) => left.navigationOrder - right.navigationOrder)
                    .map((enterpriseModule) => renderItem({
                      code: enterpriseModule.code,
                      href: enterpriseModule.href,
                      path: enterpriseModule.href.split(/[?#]/, 1)[0] || enterpriseModule.href,
                      label: enterpriseModule.label,
                      icon: resolveEnterpriseModuleIcon(enterpriseModule),
                      help: enterpriseModule.description,
                      order: enterpriseModule.navigationOrder,
                    }, enterpriseModule.label))}
                </div>
              </details>
            );
          })
        : null}
      {enterpriseContext.showAdmin
        ? renderItem(
            standardNavItem("ENTERPRISE_ADMINISTRATION", Shield),
            translate(locale, "navigation.enterpriseAdminNamed").replace("{organization}", enterpriseContext.organizationName),
          )
        : null}
    </div>
  ) : null;

  return (
    <>
      {navItems.map((item) => renderItem(item))}
      {enterpriseHeader}
      {enterpriseNavigation}
    </>
  );
}
