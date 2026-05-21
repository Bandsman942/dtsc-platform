"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, BriefcaseBusiness, CalendarCheck, CalendarDays, CreditCard, Headphones, LayoutDashboard, Megaphone, Settings, Shield, User, UsersRound } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { canAccessAdministration } from "@/lib/admin-access";
import { translate } from "@/lib/i18n";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, help: "Voir vos indicateurs, conversations récentes et accès rapides." },
  { href: "/chat", label: "Chatbot", icon: Bot, help: "Discuter avec l'assistant DTSC et exploiter votre contexte métier." },
  { href: "/billing", label: "Abonnement", icon: CreditCard, help: "Consulter votre plan, vos limites et vos factures." },
  { href: "/company", label: "Entreprise", icon: BriefcaseBusiness, help: "Renseigner votre entreprise, vos activités et vos documents métier." },
  { href: "/calendar", label: "Calendrier interne", icon: CalendarDays, help: "Voir disponibilités, réunions, missions et conflits de planning." },
  { href: "/collaborators", label: "Mes collaborateurs", icon: UsersRound, help: "Créer des groupes, inviter des membres et échanger autour de vos projets." },
  { href: "/notifications", label: "Notifications", icon: Bell, help: "Lire les alertes importantes liées à votre compte." },
  { href: "/announcements", label: "Annonces", icon: Megaphone, help: "Suivre les publications internes et échanger en commentaires." },
  { href: "/support", label: "Support", icon: Headphones, help: "Créer et suivre vos tickets avec l'équipe DTSC." },
  { href: "/profile", label: "Profil", icon: User, help: "Mettre à jour vos informations personnelles." },
  { href: "/settings", label: "Paramètres", icon: Settings, help: "Configurer votre compte, thème et préférences." },
];

export function NavLinks({
  role,
  mobile = false,
  unreadNotifications = 0,
  showEmployeeActivities = false,
  locale = "fr",
}: {
  role: UserRole;
  mobile?: boolean;
  unreadNotifications?: number;
  showEmployeeActivities?: boolean;
  locale?: string | null;
}) {
  const pathname = usePathname();
  const employeeItems = showEmployeeActivities
    ? [{ href: "/activities", label: "Activités DTSC", icon: CalendarCheck, help: "Voir les tâches, opérations, réunions et blocages internes qui vous concernent." }]
    : [];
  const navItems = canAccessAdministration(role)
    ? [...items, ...employeeItems, { href: "/admin", label: "Administration", icon: Shield, help: "Accéder aux blocs d'administration autorisés pour votre rôle." }]
    : [...items, ...employeeItems];
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
  };

  return (
    <>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const showNotificationSignal = item.href === "/notifications" && unreadNotifications > 0;
        return (
          <Link
            key={item.href}
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
            {mobile && item.href === "/admin" ? "Admin" : translate(locale, translationByHref[item.href] || item.label)}
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
