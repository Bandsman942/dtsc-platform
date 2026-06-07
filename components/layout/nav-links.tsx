"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType } from "react";
import { Bell, Blocks, Bot, BriefcaseBusiness, CalendarCheck, CalendarDays, CreditCard, Headphones, LayoutDashboard, Megaphone, Settings, Shield, User, UsersRound } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { canAccessAdministration } from "@/lib/admin-access";
import { getConsoleUrl, getSupportUrl } from "@/lib/domains";
import { translate } from "@/lib/i18n";

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
  showEmployeeActivities = false,
  showInternalModules = false,
  showCollaborationModule = true,
  enterpriseContext = null,
  locale = "fr",
}: {
  role: UserRole;
  mobile?: boolean;
  unreadNotifications?: number;
  showEmployeeActivities?: boolean;
  showInternalModules?: boolean;
  showCollaborationModule?: boolean;
  enterpriseContext?: { organizationName: string; showAdmin: boolean; modules: Array<{ code: string; label: string; description: string; category: string; isCore: boolean }> } | null;
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
  const navItems: NavItem[] = showInternalModules && canAccessAdministration(role)
    ? [...visibleBaseItems, ...employeeItems, { href: getConsoleUrl("/admin"), path: "/admin", label: "Administration", icon: Shield, help: "Accéder aux blocs d'administration autorisés pour votre rôle." }]
    : [...visibleBaseItems, ...employeeItems];
  const enterpriseItems: NavItem[] = enterpriseContext
      ? [
        { href: "/enterprise-activities", label: `Activités ${enterpriseContext.organizationName}`, icon: CalendarCheck, help: "Soumettre et suivre les activités internes de votre entreprise." },
        ...enterpriseContext.modules.map((enterpriseModule) => ({
          href: `/enterprise-modules/${encodeURIComponent(enterpriseModule.code)}`,
          label: enterpriseModule.label,
          icon: Blocks,
          help: enterpriseModule.description,
        })),
        ...(enterpriseContext.showAdmin
          ? [{ href: "/enterprise-admin", label: `Administration ${enterpriseContext.organizationName}`, icon: Shield, help: "Administrer les modules, postes et workflows de votre entreprise." }]
          : []),
      ]
    : [];
  const finalNavItems: NavItem[] = [...navItems, ...enterpriseItems];
  const translationByHref: Record<string, string> = {
    "/dashboard": "navigation.dashboard",
    "/chat": "navigation.chat",
    "/billing": "navigation.billing",
    "/company": "navigation.company",
    "/calendar": "navigation.calendar",
    "/collaborators": "navigation.collaborators",
    "/notifications": "navigation.notifications",
    "/announcements": "navigation.announcements",
    "/support": "navigation.support",
    "/profile": "navigation.profile",
    "/settings": "navigation.settings",
    "/activities": "navigation.activities",
    "/admin": "navigation.admin",
    "/enterprise-activities": "navigation.enterpriseActivities",
    "/enterprise-admin": "navigation.enterpriseAdmin",
  };

  return (
    <>
      {finalNavItems.map((item) => {
        const itemPath = item.path || item.href;
        const active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
        const showNotificationSignal = itemPath === "/notifications" && unreadNotifications > 0;
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
                : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"
            )}
            aria-current={active ? "page" : undefined}
          >
            <span className="relative inline-flex">
              <item.icon className={mobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
              {showNotificationSignal && (
                <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-dtsc-surface bg-cyan-400" />
                </span>
              )}
            </span>
            {mobile && itemPath === "/admin"
              ? "Admin"
              : itemPath === "/enterprise-activities"
                ? translate(locale, "navigation.enterpriseActivitiesNamed").replace("{organization}", enterpriseContext?.organizationName || "")
                : itemPath === "/enterprise-admin"
                  ? translate(locale, "navigation.enterpriseAdminNamed").replace("{organization}", enterpriseContext?.organizationName || "")
                  : itemPath.startsWith("/enterprise-modules/")
                    ? item.label
                    : translate(locale, translationByHref[itemPath] || item.label)}
            {showNotificationSignal && (
              <span className="ml-auto rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-black leading-none text-[#001736]">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
