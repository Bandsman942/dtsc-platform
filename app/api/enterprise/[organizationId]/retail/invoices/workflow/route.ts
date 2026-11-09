import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { retailFinanceReadSiteScope, RETAIL_OWNER_ROLES, siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** Two deliberately separate queues: only the designated Finance validator
 * may decide; only a store manager or Finance poster may issue afterwards. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") === "issue" ? "issue" : "approvals";
    const { page, pageSize } = retailListParams(req);
    const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const dateFrom = url.searchParams.get("dateFrom") || "";
    const dateTo = url.searchParams.get("dateTo") || "";
    const siteId = url.searchParams.get("siteId") || "";
    if ((dateFrom && !isCivilDate(dateFrom)) || (dateTo && !isCivilDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) throw new EnterpriseRetailError("RETAIL_REPORT_DATE_INVALID", 400);

    const [membership, organization, selectedSite, assignments, financeAccess] = await Promise.all([
      prisma.organizationMember.findFirst({ where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null }, select: { role: true } }),
      prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { timezone: true } }),
      siteId ? prisma.enterpriseSite.findFirst({ where: { organizationId, id: siteId, status: "ACTIVE", archivedAt: null }, select: { timezone: true } }) : Promise.resolve(null),
      prisma.enterpriseRetailSiteAssignment.findMany({ where: { organizationId, userId: auth.session.userId, isActive: true }, select: { siteId: true, roleCode: true, permissionsJson: true } }),
      resolveEnterpriseModuleAccess({ userId: auth.session.userId, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: view === "issue" ? "manage" : "approve" }),
    ]);
    if (!membership || !organization) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    if (siteId && !selectedSite) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    const owners = RETAIL_OWNER_ROLES.has(membership.role);
    const financeScope = financeAccess.allowed ? await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES") : [];
    const issuerSites = assignments.filter((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes("ISSUE_INVOICE")).map((assignment) => assignment.siteId);
    if (view === "approvals" && !financeAccess.allowed) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);
    if (view === "issue" && !owners && !issuerSites.length && !financeAccess.allowed) throw new EnterpriseRetailError("RETAIL_SITE_ACCESS_DENIED", 403);

    // Finance is company-wide only for users without a scoped Retail
    // assignment. Scoped Finance access cannot hop to another store.
    const allSitesAllowed = view === "issue" && (owners || (financeAccess.allowed && financeScope === null));
    const allowedSites = view === "issue"
      ? [...new Set([...issuerSites, ...(Array.isArray(financeScope) ? financeScope : [])])]
      : financeScope;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."organizationId" = ${organizationId}`,
      Prisma.sql`i."organizationId" = ${organizationId}`,
      Prisma.sql`i."archivedAt" IS NULL`,
      Prisma.sql`i."status" = ${view === "issue" ? "APPROVED" : "PENDING_APPROVAL"}`,
    ];
    if (!allSitesAllowed && allowedSites !== null) {
      if (!allowedSites.length) return NextResponse.json({ items: [], sites: [], pagination: { page, pageSize, total: 0, pageCount: 1 } });
      conditions.push(Prisma.sql`c."siteId" IN (${Prisma.join(allowedSites)})`);
    }
    if (siteId) conditions.push(Prisma.sql`c."siteId" = ${siteId}`);
    if (search) {
      const term = `%${search}%`;
      conditions.push(Prisma.sql`(i."number" ILIKE ${term} OR EXISTS (SELECT 1 FROM "EnterpriseSalesInvoiceItem" l WHERE l."salesInvoiceId" = i."id" AND l."organizationId" = ${organizationId} AND l."description" ILIKE ${term}))`);
    }
    const timezone = selectedSite?.timezone || organization.timezone || "UTC";
    if (dateFrom) conditions.push(Prisma.sql`i."invoiceDate" >= ${civilMidnightUtc(dateFrom, timezone)}`);
    if (dateTo) conditions.push(Prisma.sql`i."invoiceDate" < ${civilMidnightUtc(followingCivilDate(dateTo), timezone)}`);
    const approvalJoin = view === "approvals" ? Prisma.sql`INNER JOIN "EnterpriseApproval" a ON a."targetEntityType" = 'EnterpriseSalesInvoice' AND a."targetEntityId" = i."id" AND a."organizationId" = ${organizationId} AND a."approverUserId" = ${auth.session.userId} AND a."status" = 'PENDING' AND a."archivedAt" IS NULL` : Prisma.empty;
    const from = Prisma.sql`FROM "EnterpriseRetailInvoiceCheckout" c INNER JOIN "EnterpriseSalesInvoice" i ON i."id" = c."salesInvoiceId" ${approvalJoin} WHERE ${Prisma.join(conditions, " AND ")}`;
    const [ids, totals] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT c."id" ${from} ORDER BY i."invoiceDate" DESC, c."createdAt" DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count ${from}`),
    ]);
    const count = Number(totals[0]?.count || 0);
    const checkouts = ids.length ? await prisma.enterpriseRetailInvoiceCheckout.findMany({
      where: { organizationId, id: { in: ids.map((entry) => entry.id) } },
      include: { lines: true, site: { select: { id: true, name: true, code: true } }, invoice: { include: { items: true } } },
    }) : [];
    const byId = new Map(checkouts.map((entry) => [entry.id, entry]));
    const items = ids.flatMap(({ id }) => { const entry = byId.get(id); return entry ? [{ ...entry, canApprove: view === "approvals", canIssue: view === "issue" }] : []; });
    const sites = await prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(allSitesAllowed || allowedSites === null ? {} : { id: { in: allowedSites } }) },
      select: { id: true, name: true, code: true }, orderBy: { name: "asc" }, take: 200,
    });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId, metadata: { organizationId, domain: "retail-invoice-workflow", view, page } });
    return NextResponse.json({ items, sites, pagination: { page, pageSize, total: count, pageCount: Math.max(1, Math.ceil(count / pageSize)) } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return retailErrorResponse(error, "RETAIL_INVOICE_WORKFLOW_READ_FAILED"); }
}
