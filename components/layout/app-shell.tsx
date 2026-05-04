import Link from "next/link";
import { Bot, Headphones, LayoutDashboard, Settings, Shield, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-950/95 px-5 py-6 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-400 text-slate-950 font-black">
            D
          </div>
          <div>
            <p className="font-semibold tracking-wide">DTSC Chatbot</p>
            <p className="text-xs text-slate-400">SaaS client IA</p>
          </div>
        </Link>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-cyan-200 transition hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              <Shield className="h-4 w-4" />
              Administration
            </Link>
          )}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="font-semibold lg:hidden">
              DTSC
            </Link>
            <div className="hidden text-sm text-slate-400 md:block">
              Le numérique au service de votre performance
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-slate-400">{user.role}</p>
              </div>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-slate-950"
                )}
              >
                {initials(user.name)}
              </div>
              <SignOutButton />
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10"
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
