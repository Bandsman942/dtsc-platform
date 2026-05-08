import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionTimeoutGuard } from "@/components/auth/session-timeout-guard";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { NavLinks } from "@/components/layout/nav-links";
import { dtsc } from "@/lib/dtsc";
import { initials } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    companyName: string | null;
  };
}) {
  const unreadNotifications = await prisma.notification.count({
    where: {
      userId: user.id,
      readAt: null,
    },
  });

  return (
    <div className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <SessionTimeoutGuard />
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-dtsc-border bg-dtsc-surface px-5 py-6 shadow-[0_18px_60px_rgba(0,23,54,0.08)] lg:block">
        <DtscLogo href="/dashboard" />

        <Link
          href="/chat"
          title="Démarrer une nouvelle conversation avec l'assistant DTSC."
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001736] px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,43,91,0.12)] transition hover:-translate-y-0.5 hover:bg-[#002b5b]"
        >
          <Sparkles className="h-4 w-4 text-cyan-300" />
          Nouveau chat
        </Link>

        <nav className="mt-10 space-y-1">
          <NavLinks role={user.role} unreadNotifications={unreadNotifications} />
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
            <NavLinks role={user.role} mobile unreadNotifications={unreadNotifications} />
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <DtscFooter />
      </div>
    </div>
  );
}
