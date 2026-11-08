import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { writeApiLog } from "@/lib/audit";
import { retailPostedSiteLedger } from "@/lib/enterprise/retail/site-financial-report";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const ADMIN_ROLES = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"];

/** Owner-only operational overview. Financial profit is intentionally omitted:
 * it must come from the general ledger, not from guessed catalog costs. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "RETAIL_POS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.userId, status: "ACTIVE", removedAt: null, role: { in: ADMIN_ROLES } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const start = url.searchParams.get("from") || "";
  const end = url.searchParams.get("to") || "";
  const from = start ? new Date(start) : new Date(new Date().setUTCHours(0, 0, 0, 0));
  const to = end ? new Date(end) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 400 * 86_400_000) {
    return NextResponse.json({ error: "RETAIL_REPORT_DATE_INVALID", message: "Choisissez une période valide, de 400 jours au maximum." }, { status: 400 });
  }
  const siteId = url.searchParams.get("siteId") || undefined;
  const sites = await prisma.enterpriseSite.findMany({
    where: { organizationId, status: "ACTIVE", archivedAt: null, ...(siteId ? { id: siteId } : {}) },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true },
  });
  if (siteId && !sites.length) return NextResponse.json({ error: "RETAIL_SITE_NOT_FOUND", message: "Cette boutique est introuvable dans votre entreprise." }, { status: 404 });
  const ids = sites.map((site) => site.id);
  const dateWhere = { gte: from, lte: to };
  const [sales, expenses, stockByWarehouse, sessions, closes] = await Promise.all([
    prisma.enterpriseRetailSale.groupBy({
      by: ["siteId", "currencyCode"],
      where: { organizationId, siteId: { in: ids }, status: "COMPLETED", soldAt: dateWhere },
      _sum: { grandTotal: true }, _count: { _all: true },
    }),
    prisma.enterpriseExpense.groupBy({
      by: ["siteId", "currency"], where: { organizationId, siteId: { in: ids }, status: "APPROVED", expenseDate: dateWhere, archivedAt: null },
      _sum: { amount: true }, _count: { _all: true },
    }),
    prisma.enterpriseInventoryBalance.groupBy({
      by: ["warehouseId"], where: { organizationId, warehouse: { siteId: { in: ids } } },
      _sum: { quantityOnHand: true, quantityReserved: true }, _count: { _all: true },
    }),
    prisma.enterpriseCashSession.groupBy({
      by: ["siteId", "status"], where: { organizationId, siteId: { in: ids } }, _count: { _all: true },
    }),
    prisma.enterpriseRetailDailyClose.groupBy({
      by: ["siteId", "status"], where: { organizationId, siteId: { in: ids }, businessDate: dateWhere }, _count: { _all: true },
    }),
  ]);
  const warehouses = await prisma.enterpriseWarehouse.findMany({
    where: { organizationId, siteId: { in: ids }, status: "ACTIVE", archivedAt: null },
    select: { id: true, siteId: true },
  });
  const siteByWarehouse = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.siteId]));
  // Finance and classic POS are separate sale channels. Do not sum these
  // columns or label lifetime invoice allocations as current-period cashflow.
  // Group on the source site and currency in SQL: no capped list or cross-FX sum.
  const invoiceRows = ids.length ? await prisma.$queryRaw<Array<{
    siteId: string; currencyCode: string; invoiceCount: bigint;
    gross: Prisma.Decimal; allocated: Prisma.Decimal; outstanding: Prisma.Decimal;
  }>>(Prisma.sql`
    SELECT checkout."siteId" AS "siteId", invoice."currencyCode" AS "currencyCode",
      COUNT(*)::bigint AS "invoiceCount",
      COALESCE(SUM(invoice."grandTotal"), 0) AS "gross",
      COALESCE(SUM(invoice."amountPaid"), 0) AS "allocated",
      COALESCE(SUM(invoice."outstandingAmount"), 0) AS "outstanding"
    FROM "EnterpriseRetailInvoiceCheckout" checkout
    JOIN "EnterpriseSalesInvoice" invoice
      ON invoice."id" = checkout."salesInvoiceId"
      AND invoice."organizationId" = checkout."organizationId"
    WHERE checkout."organizationId" = ${organizationId}
      AND checkout."siteId" IN (${Prisma.join(ids)})
      AND invoice."issuedAt" >= ${from} AND invoice."issuedAt" <= ${to}
      AND invoice."status" IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDIT_NOTE')
    GROUP BY checkout."siteId", invoice."currencyCode"
  `) : [];
  const tenderRows = await Promise.all(sites.map((site) => prisma.enterpriseRetailTender.groupBy({
    by: ["currencyCode", "methodType"],
    where: { organizationId, sale: { organizationId, siteId: site.id, status: "COMPLETED", soldAt: dateWhere } },
    _sum: { amount: true }, _count: { _all: true },
  })));
  // Posted accounting is the source for provisional margin figures; never
  // invent a catalog cost or add POS sales to Finance invoice balances.
  const postedLedger = await retailPostedSiteLedger(organizationId, from, to, ids);
  const items = sites.map((site, index) => ({
    ...site,
    sales: sales.filter((row) => row.siteId === site.id).map((row) => ({ currencyCode: row.currencyCode, total: (row._sum.grandTotal || new Prisma.Decimal(0)).toFixed(), count: row._count._all })),
    financeInvoices: invoiceRows.filter((row) => row.siteId === site.id).map((row) => ({
      currencyCode: row.currencyCode, count: Number(row.invoiceCount),
      issuedTotal: row.gross.toFixed(), allocatedToDate: row.allocated.toFixed(),
      outstandingToDate: row.outstanding.toFixed(),
    })),
    postedLedger: postedLedger.bySite.filter((row) => row.siteId === site.id),
    approvedExpenses: expenses.filter((row) => row.siteId === site.id).map((row) => ({ currencyCode: row.currency, total: (row._sum.amount || new Prisma.Decimal(0)).toFixed(), count: row._count._all })),
    collections: tenderRows[index].map((row) => ({ currencyCode: row.currencyCode, method: row.methodType, total: (row._sum.amount || new Prisma.Decimal(0)).toFixed(), count: row._count._all })),
    inventory: stockByWarehouse.filter((row) => siteByWarehouse.get(row.warehouseId) === site.id).reduce((result, row) => ({
      quantityOnHand: result.quantityOnHand.plus(row._sum.quantityOnHand || 0),
      quantityReserved: result.quantityReserved.plus(row._sum.quantityReserved || 0),
      balanceRows: result.balanceRows + row._count._all,
    }), { quantityOnHand: new Prisma.Decimal(0), quantityReserved: new Prisma.Decimal(0), balanceRows: 0 }),
    cashSessions: sessions.filter((row) => row.siteId === site.id).map((row) => ({ status: row.status, count: row._count._all })),
    dailyCloses: closes.filter((row) => row.siteId === site.id).map((row) => ({ status: row.status, count: row._count._all })),
  }));
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "retail-site-overview", siteCount: items.length } });
  return NextResponse.json({ items: items.map((item) => ({ ...item, inventory: { quantityOnHand: item.inventory.quantityOnHand.toFixed(), quantityReserved: item.inventory.quantityReserved.toFixed(), balanceRows: item.inventory.balanceRows } })), period: { from, to }, scope: "OWNER_ONLY_OPERATIONAL", currencyPolicy: "SEPARATE_PER_CURRENCY", financeMarginCertified: false, postedLedgerScope: "PROVISIONAL_POSTED_ONLY", unallocatedPostedLedger: postedLedger.unallocated }, { headers: { "Cache-Control": "private, no-store" } });
}
