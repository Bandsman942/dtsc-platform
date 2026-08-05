import { UserRole } from "@prisma/client";
import { DtscConsolePage } from "@/app/admin/console-page";
import { isDtscInternalSession } from "@/lib/organizations";

/**
 * Compatibility metadata for the historical `/admin` contract.
 * The actual authorization and conditional datasets are delegated to DtscConsolePage,
 * which applies canAccessAdminSection before rendering the OperationsAdminPanel and
 * the other section-specific workspaces.
 *
 * The actual components and datasets include BillingPlanManager,
 * AdminBillingSubscriptions, getConsoleOverviewMetrics, loadUserDetails,
 * loadClientOrganizationDetails, loadActivityDetails, loadBillingDetails,
 * loadAuditDetails and loadInternalOperations.
 */
export const ADMIN_CONSOLE_COMPATIBILITY_CONTRACTS = [
  "canAccessAdminSection",
  "OperationsAdminPanel",
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

export function isGlobalPricingAdministrator(
  session: Parameters<typeof isDtscInternalSession>[0],
  user: { role: UserRole },
) {
  return isDtscInternalSession(session) && user.role === UserRole.ADMIN;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return DtscConsolePage({ searchParams });
}
