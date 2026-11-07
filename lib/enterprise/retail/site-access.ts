import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";

export const RETAIL_SITE_STAFF_ROLES = ["MANAGER", "INVOICER", "CASHIER"] as const;
export const RETAIL_SITE_CAPABILITIES = [
  "VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE", "CANCEL_UNPAID_INVOICE",
  "COLLECT_PAYMENT", "CLOSE_CASH", "VIEW_REPORTS", "AUTHORIZE_TRANSFER",
  "RECORD_EXPENSE", "APPROVE_EXPENSE",
] as const;

export const retailSiteAssignmentInputSchema = z.object({
  siteId: z.string().trim().min(1).max(191),
  userId: z.string().trim().min(1).max(191),
  roleCode: z.enum(RETAIL_SITE_STAFF_ROLES),
  permissions: z.array(z.enum(RETAIL_SITE_CAPABILITIES)).max(RETAIL_SITE_CAPABILITIES.length).optional(),
  isActive: z.boolean().default(true),
  revision: z.number().int().positive().optional(),
}).strict();

export const ROLE_DEFAULT_CAPABILITIES: Readonly<Record<typeof RETAIL_SITE_STAFF_ROLES[number], readonly typeof RETAIL_SITE_CAPABILITIES[number][]>> = {
  MANAGER: ["VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE", "CANCEL_UNPAID_INVOICE", "COLLECT_PAYMENT", "CLOSE_CASH", "VIEW_REPORTS"],
  INVOICER: ["VIEW_STOCK", "VIEW_SALES", "PREPARE_INVOICE"],
  CASHIER: ["VIEW_SALES", "COLLECT_PAYMENT", "CLOSE_CASH"],
};

export const RETAIL_OWNER_ROLES = new Set(["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"]);
type RetailSiteCapability = typeof RETAIL_SITE_CAPABILITIES[number];
type RetailSiteAccessReader = Pick<Prisma.TransactionClient, "organizationMember" | "enterpriseRetailConfiguration" | "enterpriseRetailSiteAssignment">;

export function siteStaffCapabilities(roleCode: string, permissions: unknown): RetailSiteCapability[] {
  if (!RETAIL_SITE_STAFF_ROLES.some((role) => role === roleCode)) return [];
  if (permissions !== null && permissions !== undefined) {
    const validated = z.array(z.enum(RETAIL_SITE_CAPABILITIES)).safeParse(permissions);
    if (!validated.success) return []; // Malformed stored policy is deny-all.
    return [...new Set(validated.data)];
  }
  return [...ROLE_DEFAULT_CAPABILITIES[roleCode as typeof RETAIL_SITE_STAFF_ROLES[number]]];
}

// Intentionally off for existing tenants. Do not expose the activation switch
// until every Retail/Common endpoint used by scoped staff has a fail-closed
// site filter and the full multi-role E2E is green.
export function retailStaffIsolationIsEnabled(settings: Prisma.JsonValue | null | undefined): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  return (settings as Prisma.JsonObject).siteStaffIsolationEnabled === true;
}

export async function requireRetailSiteCapability(
  organizationId: string,
  userId: string,
  siteId: string | null | undefined,
  capability: RetailSiteCapability,
  database: RetailSiteAccessReader = prisma,
  options: { requireAssignment?: boolean } = {},
) {
  const [membership, configuration] = await Promise.all([
    database.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE", removedAt: null },
      select: { role: true },
    }),
    database.enterpriseRetailConfiguration.findUnique({
      where: { organizationId }, select: { settingsJson: true },
    }),
  ]);
  if (!membership) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  if (RETAIL_OWNER_ROLES.has(membership.role)) return;
  if (!options.requireAssignment && !retailStaffIsolationIsEnabled(configuration?.settingsJson)) return;
  if (!siteId) throw new EnterpriseRetailError("RETAIL_SITE_REQUIRED", 403);
  const assignment = await database.enterpriseRetailSiteAssignment.findUnique({
    where: { organizationId_siteId_userId: { organizationId, siteId, userId } },
    select: { roleCode: true, isActive: true, permissionsJson: true },
  });
  if (!assignment?.isActive || !siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes(capability)) {
    throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  }
}

/** Scope invoices to the operator's *assigned* stores. Staff cutover is
 * deliberately gated twice until every legacy route has been audited.
 * Owners keep a complete company-wide view.
 */
export async function retailInvoiceVisibleSites(
  organizationId: string,
  userId: string,
  database: RetailSiteAccessReader = prisma,
): Promise<{ isOwner: boolean; siteIds: string[]; cancellableSiteIds: string[]; submittableSiteIds: string[]; collectibleSiteIds: string[] }> {
  const [membership, configuration] = await Promise.all([
    database.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE", removedAt: null }, select: { role: true },
    }),
    database.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  if (!membership) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  if (RETAIL_OWNER_ROLES.has(membership.role)) return { isOwner: true, siteIds: [], cancellableSiteIds: [], submittableSiteIds: [], collectibleSiteIds: [] };
  const settings = configuration?.settingsJson;
  if (!retailStaffIsolationIsEnabled(settings) || !settings || typeof settings !== "object" || Array.isArray(settings) || (settings as Prisma.JsonObject).invoiceCheckoutEnabled !== true) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
  }
  const assignments = await database.enterpriseRetailSiteAssignment.findMany({
    where: { organizationId, userId, isActive: true },
    select: { siteId: true, roleCode: true, permissionsJson: true },
  });
  const siteIds = assignments.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("VIEW_SALES"))
    .map((assignment) => assignment.siteId);
  if (!siteIds.length) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  const cancellableSiteIds = assignments.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("CANCEL_UNPAID_INVOICE"))
    .map((assignment) => assignment.siteId);
  const submittableSiteIds = assignments.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("PREPARE_INVOICE"))
    .map((assignment) => assignment.siteId);
  const collectibleSiteIds = assignments.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("COLLECT_PAYMENT"))
    .map((assignment) => assignment.siteId);
  return { isOwner: false, siteIds: [...new Set(siteIds)], cancellableSiteIds: [...new Set(cancellableSiteIds)], submittableSiteIds: [...new Set(submittableSiteIds)], collectibleSiteIds: [...new Set(collectibleSiteIds)] };
}
