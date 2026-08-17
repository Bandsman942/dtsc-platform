import { redirect } from "next/navigation";
import { CtoScalabilityDashboard } from "@/components/admin/cto-scalability-dashboard";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdministration, parseAdminRoleAccess } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { canAccessAdminSection } from "@/lib/business-roles";
import { CONSOLE_CAPABILITIES, getConsoleAccessDecision } from "@/lib/console/console-capabilities";
import { getDashboardUrl } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";
import { getProductionObservabilitySnapshot } from "@/lib/scalability/production-observability";
import { getAppSettings } from "@/lib/settings";
import { getIteration07UserGuide } from "@/lib/user-guides/iteration07-guides";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeWindow(value?: string) {
  const hours = Number(value);
  return hours === 1 || hours === 24 || hours === 168 ? hours : 24;
}

export default async function CtoScalabilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) redirect(getDashboardUrl());

  const settings = await getAppSettings();
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const [ctoAllowed, securityDecision] = await Promise.all([
    canAccessAdminSection(user, "cto", adminRoleAccess),
    getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.SECURITY_READ, adminRoleAccess }),
  ]);
  if (!ctoAllowed || !securityDecision.allowed) redirect("/admin/cto");

  const raw = await searchParams;
  const rawWindow = Array.isArray(raw.windowHours) ? raw.windowHours[0] : raw.windowHours;
  const windowHours = normalizeWindow(rawWindow);
  const snapshot = await getProductionObservabilitySnapshot(windowHours);
  const locale = user.locale === "en" ? "en" : "fr";
  const guide = getIteration07UserGuide("DTSC_CTO", locale);

  return (
    <AppShell user={user}>
      <div className="w-full min-w-0 max-w-full space-y-5">
        <div className="flex justify-end">{guide ? <ContextualUserGuide guide={guide} /> : null}</div>
        <CtoScalabilityDashboard snapshot={snapshot} locale={locale} />
      </div>
    </AppShell>
  );
}
