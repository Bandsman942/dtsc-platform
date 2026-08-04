import { redirect } from "next/navigation";
import { ErpCommercialReadinessDashboard } from "@/components/admin/erp-commercial-readiness-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdministration } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { DTSC_SPECIAL_PERMISSIONS, hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import { listCommercialMaturityCards } from "@/lib/commercial-maturity-governance";
import { isDtscInternalSession } from "@/lib/organizations";
import { getDashboardUrl } from "@/lib/domains";

export default async function CommercialReadinessPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) redirect(getDashboardUrl());
  const isAdmin = user.role === "ADMIN";
  const [cards, canManage, canPromoteCommercial, canDegrade] = await Promise.all([
    listCommercialMaturityCards(),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.MANAGE_COMMERCIAL_MATURITY),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.PROMOTE_COMMERCIAL_READY),
    isAdmin ? Promise.resolve(true) : hasDtscIndividualPermission(user.id, DTSC_SPECIAL_PERMISSIONS.DEGRADE_COMMERCIAL_MATURITY),
  ]);
  return <AppShell user={user}><ErpCommercialReadinessDashboard cards={cards} locale={user.locale} canManage={canManage} canPromoteCommercial={canPromoteCommercial} canDegrade={canDegrade} /></AppShell>;
}
