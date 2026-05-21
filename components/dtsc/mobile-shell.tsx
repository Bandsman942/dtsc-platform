"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { ElementType } from "react";
import { Bell, Bot, CalendarCheck, ChevronRight, Home, LogOut, Settings, Shield, User, UsersRound } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileAvatar } from "@/components/dtsc/ui-components";
import { cn } from "@/lib/utils";
import { canAccessAdministration } from "@/lib/admin-access";
import { translate } from "@/lib/i18n";

type MobileShellUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string | null;
  locale?: string | null;
};

const primaryItems = [
  { href: "/dashboard", labelKey: "navigation.dashboard", fallback: "Accueil", icon: Home },
  { href: "/chat", labelKey: "navigation.chat", fallback: "IA", icon: Bot },
  { href: "/activities", labelKey: "navigation.activities", fallback: "Activités", icon: CalendarCheck, employeeOnly: true },
  { href: "/collaborators", labelKey: "navigation.collaborators", fallback: "Équipe", icon: UsersRound },
  { href: "/notifications", labelKey: "navigation.notifications", fallback: "Alertes", icon: Bell },
];

export function MobilePwaHeader({
  user,
  unreadNotifications,
}: {
  user: MobileShellUser;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const locale = user.locale || "fr";
  const adminAllowed = canAccessAdministration(user.role);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b border-white/14 bg-dtsc-surface/78 px-4 py-3 shadow-[0_16px_50px_rgba(0,23,54,0.10)] backdrop-blur-2xl lg:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Accueil DTSC Platform">
          <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-dtsc-navy shadow-[0_18px_45px_rgba(0,43,91,0.25)]">
            <Image src="/dtsc-logo.png" alt="Logo DTSC" fill sizes="44px" className="object-cover" priority />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-dtsc-surface bg-emerald-400" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-black tracking-tight text-dtsc-ink">DTSC</span>
            <span className="block truncate text-[0.66rem] font-black uppercase tracking-[0.18em] text-cyan-600">IA Platform</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-dtsc-border/70 bg-dtsc-page/72 text-dtsc-muted shadow-[0_10px_32px_rgba(0,23,54,0.08)]" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[0.62rem] font-black text-[#001736]">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
          <MobileAvatar src={user.avatarUrl} name={user.name} online />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {adminAllowed && <QuickChip href="/admin" active={pathname?.startsWith("/admin")} icon={Shield} label={translate(locale, "navigation.admin")} />}
        <QuickChip href="/settings" active={pathname?.startsWith("/settings")} icon={Settings} label={translate(locale, "navigation.settings")} />
        <QuickChip href="/profile" active={pathname?.startsWith("/profile")} icon={User} label={translate(locale, "navigation.profile")} />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex shrink-0 items-center gap-2 rounded-2xl border border-dtsc-border/70 bg-dtsc-page/72 px-3 py-2 text-xs font-black text-dtsc-muted"
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
  showEmployeeActivities,
}: {
  user: MobileShellUser;
  unreadNotifications: number;
  showEmployeeActivities: boolean;
}) {
  const pathname = usePathname();
  const locale = user.locale || "fr";
  const visibleItems = primaryItems.filter((item) => !item.employeeOnly || showEmployeeActivities);
  const overflowItems = [
    { href: "/announcements", labelKey: "navigation.announcements", fallback: "Annonces" },
    { href: "/company", labelKey: "navigation.company", fallback: "Entreprise" },
    { href: "/billing", labelKey: "navigation.billing", fallback: "Plans" },
    { href: "/support", labelKey: "navigation.support", fallback: "Support" },
  ];

  return (
    <motion.nav
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="fixed inset-x-3 bottom-3 z-40 rounded-[1.75rem] border border-white/18 bg-dtsc-surface/86 px-2 py-2 shadow-[0_24px_90px_rgba(0,23,54,0.24)] backdrop-blur-2xl lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Navigation mobile DTSC"
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(visibleItems.length, 5)}, minmax(0, 1fr))` }}>
        {visibleItems.slice(0, 5).map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const isNotifications = item.href === "/notifications";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-2 text-[0.64rem] font-black transition",
                active ? "bg-cyan-400/14 text-cyan-500" : "text-dtsc-muted"
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && <motion.span layoutId="mobile-nav-active" className="absolute inset-0 rounded-2xl border border-cyan-300/40" transition={{ type: "spring", stiffness: 460, damping: 34 }} />}
              <span className="relative">
                <Icon className="h-5 w-5" />
                {isNotifications && unreadNotifications > 0 && (
                  <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[0.56rem] font-black text-[#001736]">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </span>
              <span className="relative z-10 max-w-full truncate">{translate(locale, item.labelKey) || item.fallback}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
        {overflowItems.map((item) => (
          <Link key={item.href} href={item.href} className="flex shrink-0 items-center gap-1 rounded-full bg-dtsc-page/74 px-3 py-1.5 text-[0.68rem] font-black text-dtsc-muted">
            {translate(locale, item.labelKey) || item.fallback}
            <ChevronRight className="h-3 w-3" />
          </Link>
        ))}
        {canAccessAdministration(user.role) && (
          <Link href="/admin" className="flex shrink-0 items-center gap-1 rounded-full bg-cyan-400/14 px-3 py-1.5 text-[0.68rem] font-black text-cyan-500">
            Admin
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </motion.nav>
  );
}

function QuickChip({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active?: boolean;
  icon: ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition",
        active ? "border-cyan-300/45 bg-cyan-400/14 text-cyan-500" : "border-dtsc-border/70 bg-dtsc-page/72 text-dtsc-muted"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
