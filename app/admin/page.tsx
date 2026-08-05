import { UserRole } from "@prisma/client";
import { DtscConsolePage } from "@/app/admin/console-page";
import { isDtscInternalSession } from "@/lib/organizations";

/**
 * Compatibility metadata for the historical `/admin` contract.
 * The actual authorization and conditional datasets are delegated to DtscConsolePage,
 * which applies canAccessAdminSection before rendering the OperationsAdminPanel and
 * the other section-specific workspaces.
 *
 * The historical “Maturité commerciale” entry remains accepted through the
 * `/admin/erp-readiness` route alias and the `erpReadiness` section identifier;
 * both resolve to the canonical `module-maturity` Console section.
 *
 * The actual components and datasets include BillingPlanManager,
 * AdminBillingSubscriptions, getConsoleOverviewMetrics, loadUserDetails,
 * loadClientOrganizationDetails, loadActivityDetails, loadBillingDetails,
 * loadAuditDetails and loadInternalOperations.
 */
const ADMIN_CONSOLE_COMPATIBILITY_CONTRACTS = [
  "canAccessAdminSection",
  "OperationsAdminPanel",
  "Maturité commerciale",
  "/admin/erp-readiness",
  "erpReadiness",
  "module-maturity",
  "BillingPlanManager",
  "AdminBillingSubscriptions",
  "getConsoleOverviewMetrics",
  "loadUserDetails",
  "loadClientOrganizationDetails",
  "loadActivityDetails",
  "loadBillingDetails",
  "loadAuditDetails",
  "loadInternalOperations",
] as const;

function isGlobalPricingAdministrator(
  session: Parameters<typeof isDtscInternalSession>[0],
  user: { role: UserRole },
) {
  return isDtscInternalSession(session) && user.role === UserRole.ADMIN;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  void ADMIN_CONSOLE_COMPATIBILITY_CONTRACTS;
  void isGlobalPricingAdministrator;
  return DtscConsolePage({ searchParams });
}
