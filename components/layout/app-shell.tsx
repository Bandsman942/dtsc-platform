import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { UserRole } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionTimeoutGuard } from "@/components/auth/session-timeout-guard";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { MobileGroupSwipeNavigation } from "@/components/dtsc/mobile-group-swipe-navigation";
import { MobileBottomNavigation, MobilePwaHeader } from "@/components/dtsc/mobile-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { NavLinks } from "@/components/layout/nav-links";
import { OrganizationContextSwitcher } from "@/components/layout/organization-context-switcher";
import { PrivateMobileChromeController } from "@/components/layout/private-mobile-chrome-controller";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { AppResumeSync } from "@/components/pwa/app-resume-sync";
import { PWAInstallPrompt } from "@/components/pwa/pwa-install-prompt";
import { PwaNotificationBridge } from "@/components/pwa/pwa-notification-bridge";
import { GlobalCallToast } from "@/components/calls/global-call-toast";
import { PromotionalBannerHost } from "@/components/promotions/promotional-banner-host";
import { getSession } from "@/lib/auth";
import { loadAppShellData, type AppShellData } from "@/lib/app-shell-data";
import { getCurrentHostType, getDashboardUrl, getProductBranding } from "@/lib/domains";
import { dtsc } from "@/lib/dtsc";
import { organizationLogoProxyUrl } from "@/lib/enterprise/organization-logo-storage";
import { getExperienceCopy } from "@/lib/experience-i18n";
import { initials } from "@/lib/format";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";
import type { SessionPayload } from "@/lib/session";

function brandingColor(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const primaryColor = (value as Record<string, unknown>).primaryColor;
  return typeof primaryColor === "string" && /^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : null;
}

export async function AppShell({
  children,
  user,
  session: providedSession,
  preloadedData,
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
  session?: SessionPayload | null;
  preloadedData?: AppShellData;
}) {
  const session = providedSession === undefined ? await getSession() : providedSession;
  const [requestHeaders, shellData] = await Promise.all([
    headers(),
    preloadedData ? Promise.resolve(preloadedData) : loadAppShellData({ user, session }),
  ]);
  const currentHostType = getCurrentHostType(requestHeaders.get("host"));
  const productBranding = getProductBranding(currentHostType, user.locale);
  const showCollaborationModule = Boolean(session);
  const copy = getExperienceCopy(user.locale);
  const {
    activeOrganizationId,
    organizationContext,
    dtscInternalContext,
    organizationMemberships,
    pendingEnterpriseInvitations,
    unreadNotifications,
    unreadCollaboratorMessages,
    pendingCompanyRelationships,
    employeeRecord,
    enterpriseModules,
    enterpriseActivityBlocks,
    enterpriseAdminDecision,
    promotionalBanners,
  } = shellData;

  const activeOrganization = activeOrganizationId
    ? organizationMemberships.find((membership) => membership.organization.id === activeOrganizationId)?.organization || null
    : null;
  const activeOrganizationLogoUrl = activeOrganization
    ? organizationLogoProxyUrl(activeOrganization.id, activeOrganization.logoUrl)
    : null;
  const primaryColor = organizationContext ? brandingColor(activeOrganization?.brandingJson) : null;
  const enterpriseBrandStyle = primaryColor
    ? ({ "--dtsc-product-accent": primaryColor } as CSSProperties)
    : undefined;
  const enterpriseContext =
    organizationContext && activeOrganizationId
      ? {
          organizationName: session?.activeOrganizationName || copy.dashboard.company,
          showAdmin: enterpriseAdminDecision?.allowed === true,
          showActivities: enterpriseActivityBlocks.length > 0,
          modules: enterpriseModules,
        }
      : null;
  const organizationOptions = organizationMemberships
    .filter((membership) => membership.organization.organizationType !== "DTSC_INTERNAL" || user.role !== "CLIENT")
    .map((membership) => ({ id: membership.organization.id, label: membership.organization.name, role: membership.role }));
  const showEmployeeActivities = dtscInternalContext && Boolean(employeeRecord);

  return (
    <LocaleProvider locale={user.locale}>
      <div style={enterpriseBrandStyle} className="min-h-screen bg-dtsc-page text-dtsc-ink dtsc-mobile-mesh">
        <SessionTimeoutGuard />
        <AppResumeSync pushEnabled={Boolean(user.pushNotificationsEnabled)} />
        <PrivateMobileChromeController />
        <GlobalCallToast />
        <PromotionalBannerHost banners={promotionalBanners} />
        <MobilePwaHeader
          user={user}
          unreadNotifications={unreadNotifications}
          currentOrganizationId={activeOrganizationId}
          organizationOptions={organizationOptions}
          productBranding={productBranding}
        />
        <MobileGroupSwipeNavigation
          role={user.role}
          showInternalModules={dtscInternalContext}
          showEmployeeActivities={showEmployeeActivities}
        />
        <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col overflow-hidden border-r border-dtsc-border bg-dtsc-surface px-5 py-6 shadow-[0_18px_60px_rgba(0,23,54,0.08)] lg:flex">
          <DtscLogo href={getDashboardUrl()} />
          <div className="mt-3 inline-flex w-fit items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-600 dark:text-cyan-200">
            {productBranding}
          </div>
          {organizationContext && activeOrganization ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              {activeOrganizationLogoUrl ? <Image src={activeOrganizationLogoUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-xl bg-white object-contain p-1" /> : <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--dtsc-product-accent)] text-xs font-black text-white">{initials(activeOrganization.name)}</div>}
              <div className="min-w-0"><p className="truncate text-sm font-black text-dtsc-ink">{activeOrganization.name}</p><p className="mt-0.5 text-[11px] font-bold text-dtsc-muted">{user.locale === "en" ? "Company workspace" : "Espace entreprise"}</p></div>
            </div>
          ) : null}
          <ProductNavigation currentHostType={currentHostType} isDtscInternal={dtscInternalContext} className="mt-5" />

          <Link
            href="/chat"
            title={copy.dashboard.newChat}
            className="mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001736] px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,43,91,0.12)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#002b5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:translate-y-px"
          >
            <Sparkles className="h-4 w-4 text-cyan-300" />
            {copy.dashboard.newChat}
          </Link>

          <nav className="mt-10 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            <NavLinks
              role={user.role}
              unreadNotifications={unreadNotifications}
              unreadCollaboratorMessages={unreadCollaboratorMessages}
              pendingEnterpriseInvitations={pendingEnterpriseInvitations}
              pendingCompanyRelationships={pendingCompanyRelationships}
              showEmployeeActivities={showEmployeeActivities}
              showInternalModules={dtscInternalContext}
              showCollaborationModule={showCollaborationModule}
              enterpriseContext={enterpriseContext}
              locale={user.locale}
            />
          </nav>
        </aside>

        <div className="lg:pl-72">
          <header className="sticky top-0 z-30 hidden border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl lg:block">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
              <Link href={getDashboardUrl()} className="font-extrabold text-dtsc-ink lg:hidden">
                DTSC
              </Link>
              <div className="hidden items-center gap-2 text-sm font-medium text-dtsc-muted md:flex">
                {organizationContext && activeOrganizationLogoUrl ? <Image src={activeOrganizationLogoUrl} alt="" width={28} height={28} unoptimized className="h-7 w-7 rounded-lg bg-white object-contain p-0.5" /> : null}
                <span>{organizationContext && activeOrganization ? activeOrganization.name : productBranding} · {dtsc.slogan}</span>
              </div>
              <div className="flex items-center gap-3">
                {organizationOptions.length > 0 && (
                  <OrganizationContextSwitcher currentOrganizationId={activeOrganizationId} organizations={organizationOptions} />
                )}
                <ThemeToggle />
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-dtsc-ink">{user.name}</p>
                  <p className="text-xs font-medium text-dtsc-muted">{formatEnumLabelForLocale(user.role, user.locale)}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-dtsc-soft text-sm font-bold text-dtsc-blue">
                  {user.avatarUrl ? (
                    <Image src={user.avatarUrl} alt="" width={36} height={36} unoptimized className="h-full w-full object-cover" />
                  ) : (
                    initials(user.name)
                  )}
                </div>
                <SignOutButton />
              </div>
            </div>
          </header>
          <main className="dtsc-private-main min-w-0 px-4 pb-36 pt-5 sm:px-6 lg:px-8 lg:pb-6 lg:pt-6">{children}</main>
          <MobileBottomNavigation
            user={user}
            unreadCollaboratorMessages={unreadCollaboratorMessages}
            pendingEnterpriseInvitations={pendingEnterpriseInvitations}
            pendingCompanyRelationships={pendingCompanyRelationships}
            showEmployeeActivities={showEmployeeActivities}
            showInternalModules={dtscInternalContext}
            showCollaborationModule={showCollaborationModule}
            enterpriseContext={enterpriseContext}
          />
          <PWAInstallPrompt />
          <PwaNotificationBridge enabled={Boolean(user.pushNotificationsEnabled)} />
          <DtscFooter />
        </div>
      </div>
    </LocaleProvider>
  );
}
