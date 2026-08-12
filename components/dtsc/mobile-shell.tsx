"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Blocks, Gauge, LifeBuoy, LogOut, MessagesSquare, ShieldCheck } from "lucide-react";
import { useEffect, type ElementType } from "react";
import type { UserRole } from "@prisma/client";
import { MobileAvatar } from "@/components/dtsc/ui-components";
import { OrganizationContextSwitcher } from "@/components/layout/organization-context-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { ModuleRefreshButton } from "@/components/workspace/module-refresh-button";
import { canAccessAdministration } from "@/lib/admin-access";
import { getDashboardUrl, getSignInUrl } from "@/lib/domains";
import { getExperienceCopy } from "@/lib/experience-i18n";
import { translate } from "@/lib/i18n";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroupHref,
  getModuleNavigationGroupLabel,
  type ModuleNavigationGroupCode,
} from "@/lib/navigation/module-navigation-groups";
import { moduleNavigationGroupOwnsPath } from "@/lib/navigation/module-navigation-paths";
import { cn } from "@/lib/utils";

type MobileShellUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string | null;
  locale?: string | null;
};

const ICON_BY_GROUP: Record<ModuleNavigationGroupCode, ElementType> = {
  PILOTAGE: Gauge,
  AI_COLLABORATION: MessagesSquare,
  ORGANIZATION_ERP: Blocks,
  ACCOUNT_SUPPORT: LifeBuoy,
  DTSC_INTERNAL: ShieldCheck,
};

function groupIsActive(pathname: string, selectedGroup: string | null, groupCode: ModuleNavigationGroupCode) {
  return (pathname === "/modules" && selectedGroup === groupCode) || moduleNavigationGroupOwnsPath(groupCode, pathname);
}

export function MobilePwaHeader({
  user,
  unreadNotifications,
  currentOrganizationId,
  organizationOptions = [],
  productBranding = "Espace SaaS",
}: {
  user: MobileShellUser;
  unreadNotifications: number;
  currentOrganizationId?: string | null;
  organizationOptions?: Array<{ id: string; label: string; role?: string | null }>;
  productBranding?: string;
}) {
  const locale = user.locale || "fr";
  const copy = getExperienceCopy(locale).mobile;

  useEffect(() => {
    let stopped = false;
    const markOnline = () => {
      if (stopped) return;
      void fetch("/api/collaborators/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "online" }),
      }).catch(() => null);
    };
    const markOffline = () => {
      const browserNavigator = typeof window === "undefined" ? undefined : window.navigator;
      const payload = new Blob([JSON.stringify({ status: "offline" })], { type: "application/json" });
      if (!browserNavigator?.sendBeacon?.("/api/collaborators/presence", payload)) {
        void fetch("/api/collaborators/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "offline" }),
          keepalive: true,
        }).catch(() => null);
      }
    };
    const handleVisibility = () => document.visibilityState === "visible" ? markOnline() : markOffline();
    markOnline();
    const interval = window.setInterval(markOnline, 15000);
    window.addEventListener("focus", markOnline);
    window.addEventListener("pagehide", markOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", markOnline);
      window.removeEventListener("pagehide", markOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  async function signOut() {
    const response = await fetch("/api/auth/sign-out", { method: "POST" });
    const body = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
    window.location.href = body?.redirectTo || getSignInUrl();
  }

  return (
    <motion.header
      data-mobile-top-nav
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b border-white/14 bg-dtsc-surface/78 px-4 py-3 shadow-[0_16px_50px_rgba(0,23,54,0.10)] backdrop-blur-2xl lg:hidden"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Link href={getDashboardUrl()} className="flex min-w-0 flex-1 items-center gap-3" aria-label={copy.homeAria}>
          <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-dtsc-navy shadow-[0_18px_45px_rgba(0,43,91,0.25)]">
            <Image src="/dtsc-logo.png" alt="Logo DTSC" fill sizes="44px" className="object-cover" priority />
            <span className="animate-dtsc-online-pulse absolute bottom-0.5 right-0.5 z-20 h-3.5 w-3.5 rounded-full border-2 border-dtsc-surface bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black tracking-tight text-dtsc-ink">DTSC</span>
            <span className="block max-w-[9rem] break-words text-[0.62rem] font-black uppercase leading-4 tracking-[0.14em] text-cyan-600">{productBranding}</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <ModuleRefreshButton compact />
          <ThemeToggle />
          <Link
            href="/notifications"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.98]"
            aria-label={translate(locale, "navigation.notifications")}
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[0.62rem] font-black text-[#001736]">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <MobileAvatar src={user.avatarUrl} name={user.name} online />
        </div>
      </div>

      <div
        data-mobile-system-rail
        data-horizontal-rail
        className="mt-3 flex min-w-0 snap-x items-start gap-2 overflow-x-auto pb-1 scrollbar-hide"
      >
        {organizationOptions.length > 0 ? (
          <OrganizationContextSwitcher
            currentOrganizationId={currentOrganizationId || null}
            organizations={organizationOptions}
            variant="mobileRail"
          />
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-2xl border border-dtsc-border/70 bg-dtsc-page/72 px-3 py-2 text-xs font-black text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.98]"
        >
          <LogOut className="h-3.5 w-3.5" />
          {translate(locale, "common.signOut")}
        </button>
      </div>
    </motion.header>
  );
}

export function MobileBottomNavigation({
  user,
  unreadNotifications,
  unreadCollaboratorMessages = 0,
  pendingEnterpriseInvitations = 0,
  pendingCompanyRelationships = 0,
  showEmployeeActivities,
  showInternalModules = false,
  showCollaborationModule = true,
  enterpriseContext = null,
}: {
  user: MobileShellUser;
  unreadNotifications: number;
  unreadCollaboratorMessages?: number;
  pendingEnterpriseInvitations?: number;
  pendingCompanyRelationships?: number;
  showEmployeeActivities: boolean;
  showInternalModules?: boolean;
  showCollaborationModule?: boolean;
  enterpriseContext?: { organizationName: string; showAdmin: boolean; showActivities: boolean; modules: Array<{ code: string; label: string; description: string; category: string; isCore: boolean; icon: string | null }> } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedGroup = searchParams.get("group");
  const locale = user.locale || "fr";
  const copy = getExperienceCopy(locale).mobile;
  const canOpenInternalGroup = showInternalModules && (showEmployeeActivities || canAccessAdministration(user.role));
  const groups = MODULE_NAVIGATION_GROUPS.filter((group) => group.code !== "DTSC_INTERNAL" || canOpenInternalGroup);
  const organizationLabel = enterpriseContext?.organizationName || null;

  function groupBadge(groupCode: ModuleNavigationGroupCode) {
    // Notifications are already represented by the bell in the system header;
    // do not repeat the same 99+ counter on the Pilotage destination.
    if (groupCode === "PILOTAGE") return 0;
    if (groupCode === "AI_COLLABORATION") return showCollaborationModule ? unreadCollaboratorMessages : 0;
    if (groupCode === "ORGANIZATION_ERP") return pendingEnterpriseInvitations + pendingCompanyRelationships;
    return 0;
  }

  return (
    <nav
      data-mobile-bottom-nav
      className="fixed inset-x-3 bottom-3 z-40 rounded-[1.75rem] border border-dtsc-border bg-dtsc-surface px-2 py-2 shadow-[0_24px_90px_rgba(0,23,54,0.28)] lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label={copy.navigation}
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((group) => {
          const active = groupIsActive(pathname, selectedGroup, group.code);
          const Icon = ICON_BY_GROUP[group.code];
          const badge = groupBadge(group.code);
          const title = group.code === "ORGANIZATION_ERP" && organizationLabel
            ? `${getModuleNavigationGroupLabel(group, locale)} · ${organizationLabel}`
            : getModuleNavigationGroupLabel(group, locale);
          return (
            <Link
              key={group.code}
              href={getModuleNavigationGroupHref(group.code)}
              title={title}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[0.61rem] font-black transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.97]",
                active ? "bg-cyan-400/14 text-cyan-500" : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-blue",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active ? <motion.span layoutId="mobile-nav-active" className="absolute inset-0 rounded-2xl border border-cyan-300/40" transition={{ type: "spring", stiffness: 460, damping: 34 }} /> : null}
              <span className="relative z-10">
                <Icon className="h-5 w-5" />
                {badge > 0 ? (
                  <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[0.54rem] font-black text-[#001736]">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="relative z-10 max-w-full truncate">{getModuleNavigationGroupLabel(group, locale, true)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
