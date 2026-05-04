import Link from "next/link";
import { Bot, Headphones, LayoutDashboard, Settings, Shield, Sparkles, User } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
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
    <div className="min-h-screen bg-[#faf9fe] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 shadow-[0_4px_20px_rgba(0,43,91,0.05)] lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#001736] text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-[#001736]">DTSC Chatbot</p>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">SaaS Platform</p>
          </div>
        </Link>

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
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-[#001736]"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#002b5b] transition hover:bg-cyan-50"
            >
              <Shield className="h-4 w-4" />
              Administration
            </Link>
          )}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="font-extrabold text-[#001736] lg:hidden">
              DTSC
            </Link>
            <div className="hidden text-sm font-medium text-slate-500 md:block">
              Le numérique au service de votre performance
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-[#001736]">{user.name}</p>
                <p className="text-xs font-medium text-slate-500">{user.role}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d5e3fd] text-sm font-bold text-[#002b5b]">
                {initials(user.name)}
              </div>
              <SignOutButton />
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-slate-200 px-4 py-2 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-[#001736]"
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#002b5b] hover:bg-cyan-50"
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
