import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
import { RETAIL_FINANCIAL_TRACES, readRetailFinancialTrace } from "@/lib/enterprise/retail/financial-drilldown";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const ADMIN_ROLES = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"];
const querySchema = z.object({
  metric: z.enum(RETAIL_FINANCIAL_TRACES),
  from: z.string().refine(isCivilDate),
  to: z.string().refine(isCivilDate),
  siteId: z.string().max(191).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  search: z.string().trim().max(90).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

function requiredModules(metric: z.infer<typeof querySchema>["metric"]): string[] {
  if (metric.startsWith("posted")) return ["FINANCE_ACCOUNTING"];
  if (metric === "financeCollections") return ["FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"];
  if (metric === "invoices" || metric === "outstanding" || metric === "overdue") return ["FINANCE_RECEIVABLES"];
  if (metric === "treasuryAvailable") return ["FINANCE_TREASURY"];
  if (metric === "expenses") return ["FINANCE_BUDGETS"];
  if (metric === "mobileMoneyCommission") return ["MOBILE_MONEY_AGENCY"];
  if (metric === "telcoMargin") return ["TELCO_TOPUPS"];
  return metric === "invoiceAllocated" ? ["FINANCE_RECEIVABLES", "FINANCE_PAYMENTS"] : [];
}

/** No browser-provided monetary value, role, or store scope can authorize a read.
 * All detail queries are paginated, source-backed, tenant-scoped and read-only.
 */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const retail = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "RETAIL_POS", action: "read" });
  if (!retail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_FINANCIAL_TRACE_FILTERS_INVALID", req);
  const filter = parsed.data;
  const [membership, requiredAccess, organization] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ADMIN_ROLES } },
      select: { id: true },
    }),
    Promise.all(requiredModules(filter.metric).map((moduleCode) =>
      resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode, action: "read" }))),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  if (!membership || requiredAccess.some((value) => !value.allowed)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!organization) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (filter.siteId) {
    // Historical/archived stores can be inspected, but only within this tenant.
    const site = await prisma.enterpriseSite.findFirst({
      where: { id: filter.siteId, organizationId }, select: { id: true },
    });
    if (!site) return NextResponse.json({ error: "RETAIL_SITE_NOT_FOUND", message: "Boutique introuvable dans cette entreprise." }, { status: 404 });
  }
  const timezone = organization.timezone || "UTC";
  const from = civilMidnightUtc(filter.from, timezone);
  const to = new Date(civilMidnightUtc(followingCivilDate(filter.to), timezone).getTime() - 1);
  if (from > to || to.getTime() - from.getTime() > 400 * 86_400_000) {
    return NextResponse.json({ error: "RETAIL_REPORT_DATE_INVALID", message: "Période invalide, 400 jours au maximum." }, { status: 400 });
  }
  const result = await readRetailFinancialTrace({
    organizationId, metric: filter.metric, from, to, siteId: filter.siteId,
    currency: filter.currency, search: filter.search, page: filter.page, pageSize: filter.pageSize,
  });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId,
    metadata: { organizationId, domain: "retail-financial-drilldown", metric: filter.metric, page: filter.page, resultCount: result.totalLines },
  });
  return NextResponse.json({ ...result, timezone, certification: "PROVISIONAL_SOURCE_TRACE" }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
