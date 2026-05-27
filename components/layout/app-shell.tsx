import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionTimeoutGuard } from "@/components/auth/session-timeout-guard";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { NavLinks } from "@/components/layout/nav-links";
import { PWAInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { PwaNotificationBridge } from "@/components/pwa/pwa-notification-bridge";
import { GlobalCallToast } from "@/components/calls/global-call-toast";
import { MobileBottomNavigation, MobilePwaHeader } from "@/components/dtsc/mobile-shell";
import { OrganizationContextSwitcher } from "@/components/layout/organization-context-switcher";
import { getSession } from "@/lib/auth";
import { dtsc } from "@/lib/dtsc";
import { initials } from "@/lib/format";
import { formatEnumLabel } from "@/lib/labels";
import { hasActiveOrganizationSubscription, isDtscInternalSession } from "@/lib/organizations";
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
    avatarUrl?: string | null;
    pushNotificationsEnabled?: boolean;
    locale?: string | null;
  };
}) {
  const session = await getSession();
  const dtscInternalContext = isDtscInternalSession(session);
  const activeOrganizationId = session?.activeOrganizationId || null;
  const organizationFeaturesEnabled =
    !activeOrganizationId || dtscInternalContext || (await hasActiveOrganizationSubscription(activeOrganizationId));
  const [unreadNotifications, latestUnreadNotifications, employeeRecord, organizationMemberships] = await Promise.all([
    prisma.notification.count({
      where: {
        userId: user.id,
        readAt: null,
      },
    }),
    user.pushNotificationsEnabled
      ? prisma.notification.findMany({
          where: { userId: user.id, readAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, title: true, body: true, targetUrl: true },
        })
      : Promise.resolve([]),
    prisma.hrcfoEmployee.findFirst({
      where: { userId: user.id, status: { not: "EXITED" } },
      select: { id: true },
    }),
    prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
        removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null },
      },
      select: {
        role: true,
        organization: { select: { id: true, name: true, organizationType: true } },
      },
      orderBy: { organization: { name: "asc" } },
      take: 12,
    }),
  ]);
  const organizationOptions = organizationMemberships
    .filter((membership) => membership.organization.organizationType !== "DTSC_INTERNAL" || user.role !== "CLIENT")
    .map((membership) => ({ id: membership.organization.id, label: membership.organization.name, role: membership.role }));
  const showEmployeeActivities = dtscInternalContext && Boolean(employeeRecord);

  return (
    <div className="min-h-screen bg-dtsc-page text-dtsc-ink dtsc-mobile-mesh">
      <SessionTimeoutGuard />
      <GlobalCallToast />
      <MobilePwaHeader
        user={user}
        unreadNotifications={unreadNotifications}
        currentOrganizationId={activeOrganizationId}
        organizationOptions={organizationOptions}
        showInternalModules={dtscInternalContext}
      />
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col overflow-hidden border-r border-dtsc-border bg-dtsc-surface px-5 py-6 shadow-[0_18px_60px_rgba(0,23,54,0.08)] lg:flex">
        <DtscLogo href="/dashboard" />

        <Link
          href="/chat"
          title="Démarrer une nouvelle conversation avec l'assistant DTSC."
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001736] px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,43,91,0.12)] transition hover:-translate-y-0.5 hover:bg-[#002b5b]"
        >
          <Sparkles className="h-4 w-4 text-cyan-300" />
          Nouveau chat
        </Link>

        <nav className="mt-10 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          <NavLinks
            role={user.role}
            unreadNotifications={unreadNotifications}
            showEmployeeActivities={showEmployeeActivities}
            showInternalModules={dtscInternalContext}
            showCollaborationModule={organizationFeaturesEnabled}
            locale={user.locale}
          />
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 hidden border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl lg:block">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="font-extrabold text-dtsc-ink lg:hidden">
              DTSC
            </Link>
            <div className="hidden text-sm font-medium text-dtsc-muted md:block">
              {dtsc.slogan}
            </div>
            <div className="flex items-center gap-3">
              {organizationOptions.length > 0 && (
                <OrganizationContextSwitcher currentOrganizationId={activeOrganizationId} organizations={organizationOptions} />
              )}
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-dtsc-ink">{user.name}</p>
                <p className="text-xs font-medium text-dtsc-muted">{formatEnumLabel(user.role)}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-dtsc-soft text-sm font-bold text-dtsc-blue">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(user.name)
                )}
              </div>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="min-w-0 px-4 pb-36 pt-5 sm:px-6 lg:px-8 lg:pb-6 lg:pt-6">{children}</main>
        <MobileBottomNavigation
          user={user}
          unreadNotifications={unreadNotifications}
          showEmployeeActivities={showEmployeeActivities}
          showInternalModules={dtscInternalContext}
          showCollaborationModule={organizationFeaturesEnabled}
        />
        <PWAInstallPrompt />
        <PwaNotificationBridge notifications={latestUnreadNotifications} enabled={Boolean(user.pushNotificationsEnabled)} />
        <DtscFooter />
      </div>
    </div>
  );
}
