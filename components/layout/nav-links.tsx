"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { Bell, Bot, BriefcaseBusiness, Building2, CalendarCheck, CalendarDays, CreditCard, Headphones, Layers3, LayoutDashboard, Megaphone, Settings, Shield, User, UserPlus, UsersRound } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { canAccessAdministration } from "@/lib/admin-access";
import { getConsoleUrl, getSupportUrl } from "@/lib/domains";
import { translate } from "@/lib/i18n";
import { resolveEnterpriseModuleIcon } from "@/lib/enterprise/enterprise-module-icons";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";
import { COMPANY_RELATIONSHIPS_NAVIGATION, getCompanyRelationshipsLabel } from "@/lib/navigation/company-relationships";

type NavItem = {
  href: string;
  path?: string;
  label: string;
  icon: ElementType;
  help: string;
};

const items: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, help: "Voir vos indicateurs, conversations récentes et accès rapides." },
  { href: "/chat", label: "Chatbot", icon: Bot, help: "Discuter avec l'assistant DTSC et exploiter votre contexte métier." },
  { href: "/billing", label: "Abonnement", icon: CreditCard, help: "Consulter votre plan, vos limites et vos factures." },
  { href: "/company", label: "Entreprise", icon: BriefcaseBusiness, help: "Renseigner votre entreprise, vos activités et vos documents métier." },
  { href: COMPANY_RELATIONSHIPS_NAVIGATION.href, label: COMPANY_RELATIONSHIPS_NAVIGATION.labelFr, icon: Building2, help: "Traiter vos invitations, consentements, demandes et relations actives avec les entreprises." },
  { href: "/calendar", label: "Calendrier interne", icon: CalendarDays, help: "Voir disponibilités, réunions, missions et conflits de planning." },
  { href: "/collaborators", label: "Mes collaborateurs", icon: UsersRound, help: "Créer des groupes, inviter des membres et échanger autour de vos projets." },
  { href: "/notifications", label: "Notifications", icon: Bell, help: "Lire les alertes importantes liées à votre compte." },
  { href: "/announcements", label: "Annonces", icon: Megaphone, help: "Suivre les publications internes et échanger en commentaires." },
  { href: getSupportUrl("/support"), path: "/support", label: "Support", icon: Headphones, help: "Créer et suivre vos tickets avec l'équipe DTSC." },
  { href: "/profile", label: "Profil", icon: User, help: "Mettre à jour vos informations personnelles." },
  { href: "/settings", label: "Paramètres", icon: Settings, help: "Configurer votre compte, thème et préférences." },
];

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
    ? [{ href: "/activities", label: "Activités DTSC", icon: CalendarCheck, help: "Voir les tâches, opérations, réunions et blocages internes qui vous concernent." }]
    : [];
  const visibleBaseItems = items.filter((item) => {
    if (item.href === "/calendar") {
      return showInternalModules || Boolean(enterpriseContext);
    }
    if (item.href === "/collaborators") {
      return showCollaborationModule;
    }
    return true;
  });
  const invitationItems: NavItem[] = pendingEnterpriseInvitations > 0
    ? [{ href: "/enterprise-invitations", label: "Invitations", icon: UserPlus, help: "Accepter ou refuser vos invitations vers les espaces entreprises." }]
    : [];
  const navItems: NavItem[] = showInternalModules && canAccessAdministration(role)
    ? [...visibleBaseItems, ...invitationItems, ...employeeItems, { href: getConsoleUrl("/admin"), path: "/admin", label: "Administration", icon: Shield, help: "Accéder aux blocs d'administration autorisés pour votre rôle." }]
    : [...visibleBaseItems, ...invitationItems, ...employeeItems];

  const translationByHref: Record<string, string> = {
    "/dashboard": "navigation.dashboard",
    "/chat": "navigation.chat",
    "/billing": "navigation.billing",
    "/company": "navigation.company",
    "/calendar": "navigation.calendar",
    "/collaborators": "navigation.collaborators",
    "/notifications": "navigation.notifications",
    "/enterprise-invitations": "navigation.invitations",
    "/announcements": "navigation.announcements",
    "/support": "navigation.support",
    "/profile": "navigation.profile",
    "/settings": "navigation.settings",
    "/activities": "navigation.activities",
    "/admin": "navigation.admin",
  };

  const groupedEnterpriseModules = new Map<string, EnterpriseNavigationModule[]>();
  for (const enterpriseModule of enterpriseContext?.modules || []) {
    const groupModules = groupedEnterpriseModules.get(enterpriseModule.navigationGroup) || [];
    groupModules.push(enterpriseModule);
    groupedEnterpriseModules.set(enterpriseModule.navigationGroup, groupModules);
  }

  function renderItem(item: NavItem, labelOverride?: string) {
    const itemPath = item.path || item.href;
    const active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
    const showNotificationSignal = itemPath === "/notifications" && unreadNotifications > 0;
    const showCollaborationSignal = itemPath === "/collaborators" && unreadCollaboratorMessages > 0;
    const showInvitationSignal = itemPath === "/enterprise-invitations" && pendingEnterpriseInvitations > 0;
    const showCompanyRelationshipSignal = itemPath === COMPANY_RELATIONSHIPS_NAVIGATION.href && pendingCompanyRelationships > 0;
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
    const label = labelOverride
      || (itemPath === COMPANY_RELATIONSHIPS_NAVIGATION.href
        ? getCompanyRelationshipsLabel(locale, mobile)
        : mobile && itemPath === "/admin"
          ? "Admin"
          : translate(locale, translationByHref[itemPath] || item.label));
    return (
      <Link
        key={itemPath}
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
            { href: "/enterprise-activities", label: "Activités entreprise", icon: CalendarCheck, help: "Soumettre et suivre les activités internes de votre entreprise." },
            translate(locale, "navigation.enterpriseActivitiesNamed").replace("{organization}", enterpriseContext.organizationName),
          )
        : null}
      {renderItem({ href: "/enterprise-modules", label: "Modules ERP", icon: Layers3, help: "Ouvrir le hub groupé des modules ERP autorisés." }, locale === "en" ? "ERP modules" : "Modules ERP")}
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
                      href: enterpriseModule.href,
                      label: enterpriseModule.label,
                      icon: resolveEnterpriseModuleIcon(enterpriseModule),
                      help: enterpriseModule.description,
                    }, enterpriseModule.label))}
                </div>
              </details>
            );
          })
        : null}
      {enterpriseContext.showAdmin
        ? renderItem(
            { href: "/enterprise-admin", label: "Administration entreprise", icon: Shield, help: "Administrer les collaborateurs, postes, départements, modules, abonnement, paramètres et audit." },
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
