import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { readRetailCogsAnalysis } from "@/lib/enterprise/retail/cogs-analysis";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const ADMIN_ROLES = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"];
export const cogsFiltersSchema = z.object({
  from: z.string().refine(isCivilDate), to: z.string().refine(isCivilDate),
  siteId: z.string().max(191).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  status: z.enum(["TRACEABLE", "UNMATCHED", "AMBIGUOUS"]).optional(),
  search: z.string().trim().max(90).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

/** COGS access requires RETAIL owner/admin AND independent accounting access.
 * Inventory item, movements and sale source details are separately gated.
 * No tenant, role, or site dimension is trusted from the browser alone.
 */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const retailAccess = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "RETAIL_POS", action: "read" });
  if (!retailAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [membership, accounting, inventory] = await Promise.all([
    prisma.organizationMember.findFirst({ where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ADMIN_ROLES } }, select: { id: true } }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "FINANCE_ACCOUNTING", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" }),
  ]);
  if (!membership || !accounting.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const parsed = cogsFiltersSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_COGS_FILTERS_INVALID", req);
  const { from, to, siteId, currency, status, search, page, pageSize } = parsed.data;
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  if (!organization) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const timezone = organization.timezone || "UTC";
  const fromDate = civilMidnightUtc(from, timezone);
  const toDate = new Date(civilMidnightUtc(followingCivilDate(to), timezone).getTime() - 1);
  if (fromDate > toDate || toDate.getTime() - fromDate.getTime() > 400 * 86_400_000) {
    return NextResponse.json({ error: "RETAIL_REPORT_DATE_INVALID", message: "Choisissez une période valide de 400 jours au maximum." }, { status: 400 });
  }
  if (siteId) {
    const site = await prisma.enterpriseSite.findFirst({ where: { id: siteId, organizationId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    if (!site) return NextResponse.json({ error: "RETAIL_SITE_NOT_FOUND", message: "Cette boutique n'appartient pas à votre entreprise." }, { status: 404 });
  }
  const result = await readRetailCogsAnalysis({ organizationId, from: fromDate, to: toDate, timezone, siteId, currency, status, search, page, pageSize, includeInventory: inventory.allowed });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "retail-cogs-analysis", siteFilter: Boolean(siteId), rows: result.totalLines } });
  return NextResponse.json({ ...result, sourceAvailability: { accounting: true, inventory: inventory.allowed } });
}
