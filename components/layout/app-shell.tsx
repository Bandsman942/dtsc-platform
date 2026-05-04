import Link from "next/link";
import { Bot, Headphones, LayoutDashboard, Settings, Shield, Sparkles, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { dtsc } from "@/lib/dtsc";
import { initials } from "@/lib/format";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chatbot", icon: Bot },
  { href: "/support", label: "Support", icon: Headphones },
  { href: "/profile", label: "Profil", icon: User },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: UserRole;
    companyName: string | null;
  };
}) {
  return (
    <div className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-dtsc-border bg-dtsc-surface px-5 py-6 shadow-[0_18px_60px_rgba(0,23,54,0.08)] lg:block">
        <DtscLogo href="/dashboard" />

        <Link
          href="/chat"
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001736] px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,43,91,0.12)] transition hover:-translate-y-0.5 hover:bg-[#002b5b]"
        >
          <Sparkles className="h-4 w-4 text-cyan-300" />
          Nouveau chat
        </Link>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-ink"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-dtsc-blue transition hover:bg-dtsc-soft"
            >
              <Shield className="h-4 w-4" />
              Administration
            </Link>
          )}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="font-extrabold text-dtsc-ink lg:hidden">
              DTSC
            </Link>
            <div className="hidden text-sm font-medium text-dtsc-muted md:block">
              {dtsc.slogan}
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-dtsc-ink">{user.name}</p>
                <p className="text-xs font-medium text-dtsc-muted">{user.role}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dtsc-soft text-sm font-bold text-dtsc-blue">
                {initials(user.name)}
              </div>
              <SignOutButton />
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-dtsc-border px-4 py-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-dtsc-blue hover:bg-dtsc-soft"
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <DtscFooter />
      </div>
    </div>
  );
}
