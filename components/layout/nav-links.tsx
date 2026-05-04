"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Headphones, LayoutDashboard, Settings, Shield, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chatbot", icon: Bot },
  { href: "/support", label: "Support", icon: Headphones },
  { href: "/profile", label: "Profil", icon: User },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function NavLinks({ role, mobile = false }: { role: UserRole; mobile?: boolean }) {
  const pathname = usePathname();
  const navItems = role === "ADMIN" ? [...items, { href: "/admin", label: "Administration", icon: Shield }] : items;

  return (
    <>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            <item.icon className={mobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {mobile && item.href === "/admin" ? "Admin" : item.label}
          </Link>
        );
      })}
    </>
  );
}
