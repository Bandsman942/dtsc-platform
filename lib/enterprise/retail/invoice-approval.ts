import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { requireRetailSiteCapability, retailStaffIsolationIsEnabled, RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";

type RetailApprovalReader = Pick<Prisma.TransactionClient, "enterpriseRetailInvoiceCheckout" | "enterpriseRetailConfiguration" | "organizationMember">;

/** Store invoicers may request an independent Finance approval for *their
 * store invoice*, without acquiring broad FINANCE_RECEIVABLES submit rights.
 * Candidates always need actual Finance approval permission. */
export async function listRetailInvoiceFinanceApprovers(
  organizationId: string,
  requesterUserId: string,
  siteId: string,
  database: RetailApprovalReader & Parameters<typeof requireRetailSiteCapability>[4] = prisma,
) {
  const [membership, configuration] = await Promise.all([
    database.organizationMember.findFirst({ where: { organizationId, userId: requesterUserId, status: "ACTIVE", removedAt: null }, select: { role: true } }),
    database.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  if (!membership) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
  const settings = configuration?.settingsJson;
  if (!settings || typeof settings !== "object" || Array.isArray(settings) || settings.invoiceCheckoutEnabled !== true) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
  }
  if (!RETAIL_OWNER_ROLES.has(membership.role) && !retailStaffIsolationIsEnabled(settings)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_CHECKOUT_NOT_ACTIVE", 403);
  }
  await requireRetailSiteCapability(organizationId, requesterUserId, siteId, "PREPARE_INVOICE", database, { requireAssignment: true });

  const members = await database.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", removedAt: null, userId: { not: requesterUserId } },
    take: 250, orderBy: { user: { name: "asc" } },
    select: { userId: true, role: true, positionTitle: true, user: { select: { name: true, email: true } } },
  });
  const candidates = await Promise.all(members.map(async (member) => {
    const access = await resolveEnterpriseModuleAccess({
      userId: member.userId, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "approve",
    });
    return access.allowed ? {
      userId: member.userId, name: member.user.name, email: member.user.email,
      positionTitle: member.positionTitle, role: member.role, isRequester: false, selfApprovalOverride: false,
    } : null;
  }));
  return { candidates: candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)), selfApprovalOverrideAvailable: false };
}

/** Never accept a caller-provided "Retail override" without proving its
 * target and site in the SAME Finance approval transaction. */
export async function assertRetailInvoiceFinanceApproverTx(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; invoiceId: string; siteId: string; requesterUserId: string; approverUserId: string },
) {
  const checkout = await tx.enterpriseRetailInvoiceCheckout.findFirst({
    where: { organizationId: input.organizationId, salesInvoiceId: input.invoiceId, siteId: input.siteId },
    select: { id: true },
  });
  if (!checkout) throw new EnterpriseRetailError("RETAIL_INVOICE_NOT_FOUND", 404);
  if (input.requesterUserId === input.approverUserId) throw new EnterpriseRetailError("RETAIL_INVOICE_SELF_APPROVAL_FORBIDDEN", 403);
  const result = await listRetailInvoiceFinanceApprovers(input.organizationId, input.requesterUserId, input.siteId, tx);
  if (!result.candidates.some((candidate) => candidate.userId === input.approverUserId)) {
    throw new EnterpriseRetailError("RETAIL_INVOICE_APPROVER_NOT_ELIGIBLE", 403);
  }
}
