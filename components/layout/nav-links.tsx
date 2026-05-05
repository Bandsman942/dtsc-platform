"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, Headphones, LayoutDashboard, Megaphone, Settings, Shield, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chatbot", icon: Bot },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/announcements", label: "Annonces", icon: Megaphone },
  { href: "/support", label: "Support", icon: Headphones },
  { href: "/profile", label: "Profil", icon: User },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function NavLinks({
  role,
  mobile = false,
  unreadNotifications = 0,
}: {
  role: UserRole;
  mobile?: boolean;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const navItems = role === "ADMIN" ? [...items, { href: "/admin", label: "Administration", icon: Shield }] : items;

  return (
    <>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const showNotificationSignal = item.href === "/notifications" && unreadNotifications > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
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
            {mobile && item.href === "/admin" ? "Admin" : item.label}
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
