import { redirect } from "next/navigation";
import { ErpCommercialReadinessDashboard } from "@/components/admin/erp-commercial-readiness-dashboard";
import { ContextualUserGuide } from "@/components/user-guides/contextual-user-guide";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdministration } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { listCommercialMaturityCards } from "@/lib/commercial-maturity-governance";
import { CONSOLE_CAPABILITIES, getConsoleAccessDecision } from "@/lib/console/console-capabilities";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { getDashboardUrl } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";
import { getAppSettings } from "@/lib/settings";
import { parseAdminRoleAccess } from "@/lib/admin-access";
import { getIteration05UserGuide } from "@/lib/user-guides/iteration05-guides";

export default async function CommercialReadinessPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) redirect(getDashboardUrl());
  const settings = await getAppSettings();
  const access = await getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.MODULE_MATURITY_READ, adminRoleAccess: parseAdminRoleAccess(settings.adminRoleAccess) });
  if (!access.allowed) redirect("/admin");
  const isAdmin = user.role === "ADMIN";
  const [cards, canManage, canPromoteCommercial, canDegrade] = await Promise.all([
    listCommercialMaturityCards(),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.MANAGE_COMMERCIAL_MATURITY),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.PROMOTE_COMMERCIAL_READY),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.DEGRADE_COMMERCIAL_MATURITY),
  ]);
  return (
    <AppShell user={user}>
      <div className="w-full min-w-0 max-w-full space-y-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><p className="text-sm font-black uppercase tracking-[0.14em] text-cyan-600">Console DTSC</p><h1 className="mt-1 break-words text-3xl font-black text-dtsc-ink">Maturité commerciale des modules</h1></div>
          <ContextualUserGuide guide={getIteration05UserGuide("COMMERCIAL_MATURITY_KANBAN", user.locale)} />
        </div>
        <ErpCommercialReadinessDashboard cards={cards} locale={user.locale} canManage={canManage} canPromoteCommercial={canPromoteCommercial} canDegrade={canDegrade} />
      </div>
    </AppShell>
  );
}
