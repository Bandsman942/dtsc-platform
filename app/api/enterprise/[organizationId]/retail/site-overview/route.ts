import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { writeApiLog } from "@/lib/audit";
import { retailPostedSiteLedger } from "@/lib/enterprise/retail/site-financial-report";
import { loadRetailExecutiveSources } from "@/lib/enterprise/retail/executive-sources";
import { readRetailDashboardPreferences } from "@/lib/enterprise/retail/dashboard-preferences";
import { summarizeRetailExecutive } from "@/lib/enterprise/retail/executive-summary";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { civilMidnightUtc, followingCivilDate, isCivilDate } from "@/lib/enterprise/retail/civil-date";
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
  const organization = await prisma.organization.findFirst({ where: { id: organizationId }, select: { timezone: true, name: true } });
  const timezone = organization?.timezone || "UTC";
  const todayParts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayValue = (key: string) => todayParts.find((part) => part.type === key)?.value || "";
  const today = `${todayValue("year")}-${todayValue("month")}-${todayValue("day")}`;
  const from = start ? (isCivilDate(start) ? civilMidnightUtc(start, timezone) : new Date(start)) : civilMidnightUtc(today, timezone);
  const to = end ? (isCivilDate(end) ? new Date(civilMidnightUtc(followingCivilDate(end), timezone).getTime() - 1) : new Date(end)) : new Date();
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
  // Every optional ERP source is independently authorized. RETAIL_POS alone
  // does not grant access to Mobile Money, Telco or Treasury balances.
  const [agencyAccess, telcoAccess, treasuryAccess, inventoryAccess, reportsAccess, reportWriteAccess, accountingAccess, config] = await Promise.all([
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "MOBILE_MONEY_AGENCY", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "TELCO_TOPUPS", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "FINANCE_TREASURY", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "INVENTORY_LOGISTICS", action: "read" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "REPORTS", action: "read" }),
    getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "REPORTS", action: "submit" }),
    resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: "FINANCE_ACCOUNTING", action: "read" }),
    prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }),
  ]);
  const preferences = readRetailDashboardPreferences(config?.settingsJson);
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
    inventoryAccess.allowed ? prisma.enterpriseInventoryBalance.groupBy({
      by: ["warehouseId"], where: { organizationId, warehouse: { siteId: { in: ids } } },
      _sum: { quantityOnHand: true, quantityReserved: true }, _count: { _all: true },
    }) : Promise.resolve([]),
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
      COALESCE(SUM(invoice."grandTotal" - invoice."amountCredited"), 0) AS "gross",
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
  // Canonical Finance customer payments are counted by payment date AND
  // confirmed invoice allocation. Historical POS tenders stay separate.
  const financeCollectionRows = ids.length ? await prisma.$queryRaw<Array<{
    siteId: string; currencyCode: string; method: string; total: Prisma.Decimal; paymentCount: bigint;
  }>>(Prisma.sql`
    SELECT checkout."siteId" AS "siteId", payment."currencyCode" AS "currencyCode",
      payment."methodType" AS "method",
      COALESCE(SUM(allocation."amount"), 0) AS "total",
      COUNT(DISTINCT payment."id")::bigint AS "paymentCount"
    FROM "EnterpriseRetailInvoiceCheckout" checkout
    JOIN "EnterpriseReceivable" receivable
      ON receivable."salesInvoiceId" = checkout."salesInvoiceId"
      AND receivable."organizationId" = checkout."organizationId"
    JOIN "EnterprisePaymentAllocation" allocation
      ON allocation."receivableId" = receivable."id"
      AND allocation."organizationId" = checkout."organizationId"
    JOIN "EnterprisePayment" payment
      ON payment."id" = allocation."paymentId"
      AND payment."organizationId" = allocation."organizationId"
    WHERE checkout."organizationId" = ${organizationId}
      AND checkout."siteId" IN (${Prisma.join(ids)})
      AND payment."paymentDate" >= ${from} AND payment."paymentDate" <= ${to}
      AND payment."status" IN ('CONFIRMED', 'RECONCILED')
      AND payment."direction" = 'INBOUND' AND payment."paymentType" = 'CUSTOMER_PAYMENT'
      AND allocation."status" = 'CONFIRMED' AND allocation."reversedAt" IS NULL
    GROUP BY checkout."siteId", payment."currencyCode", payment."methodType"
  `) : [];
  // Posted accounting is the source for provisional margin figures; never
  // invent a catalog cost or add POS sales to Finance invoice balances.
  const [postedLedger, executiveSources, receivableRows, inventoryAlerts] = await Promise.all([
    accountingAccess.allowed ? retailPostedSiteLedger(organizationId, from, to, ids, !siteId) : Promise.resolve({ bySite: [], unallocated: [] }),
    loadRetailExecutiveSources({ organizationId, from, to, timezone, access: { agency: agencyAccess.allowed, telco: telcoAccess.allowed, treasury: treasuryAccess.allowed } }),
    ids.length ? prisma.$queryRaw<Array<{ siteId: string; currencyCode: string; total: Prisma.Decimal; overdue: Prisma.Decimal; count: bigint }>>(Prisma.sql`
      SELECT checkout."siteId" AS "siteId", invoice."currencyCode" AS "currencyCode",
        COALESCE(SUM(invoice."outstandingAmount"), 0) AS total,
        COALESCE(SUM(CASE WHEN invoice."dueDate" < ${new Date()} THEN invoice."outstandingAmount" ELSE 0 END), 0) AS overdue,
        COUNT(*)::bigint AS count
      FROM "EnterpriseRetailInvoiceCheckout" checkout
      JOIN "EnterpriseSalesInvoice" invoice ON invoice.id = checkout."salesInvoiceId" AND invoice."organizationId" = checkout."organizationId"
      WHERE checkout."organizationId" = ${organizationId} AND checkout."siteId" IN (${Prisma.join(ids)})
        AND invoice.status IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CREDIT_NOTE') AND invoice."outstandingAmount" > 0
      GROUP BY checkout."siteId", invoice."currencyCode"
    `) : Promise.resolve([]),
    inventoryAccess.allowed && ids.length ? prisma.$queryRaw<Array<{ siteId: string; lowStock: bigint; expiring: bigint; expired: bigint }>>(Prisma.sql`
      SELECT warehouse."siteId" AS "siteId",
        COUNT(DISTINCT CASE WHEN item."minimumQuantity" IS NOT NULL AND balance."quantityOnHand" - balance."quantityReserved" <= item."minimumQuantity" THEN item.id END)::bigint AS "lowStock",
        COUNT(DISTINCT CASE WHEN (lot."expiryDate" AT TIME ZONE 'UTC')::date >= ${today}::date AND (lot."expiryDate" AT TIME ZONE 'UTC')::date <= (${today}::date + ${preferences.warnStockDays}) AND balance."quantityOnHand" > balance."quantityReserved" THEN lot.id END)::bigint AS expiring,
        COUNT(DISTINCT CASE WHEN (lot."expiryDate" AT TIME ZONE 'UTC')::date < ${today}::date AND balance."quantityOnHand" > balance."quantityReserved" THEN lot.id END)::bigint AS expired
      FROM "EnterpriseInventoryBalance" balance
      JOIN "EnterpriseWarehouse" warehouse ON warehouse.id = balance."warehouseId" AND warehouse."organizationId" = balance."organizationId"
      JOIN "EnterpriseInventoryItem" item ON item.id = balance."inventoryItemId" AND item."organizationId" = balance."organizationId"
      LEFT JOIN "EnterpriseStockLot" lot ON lot.id = balance."stockLotId" AND lot."organizationId" = balance."organizationId"
      WHERE balance."organizationId" = ${organizationId} AND warehouse."siteId" IN (${Prisma.join(ids)})
      GROUP BY warehouse."siteId"
    `) : Promise.resolve([]),
  ]);
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
    financeCollections: financeCollectionRows.filter((row) => row.siteId === site.id).map((row) => ({
      currencyCode: row.currencyCode, method: row.method, total: row.total.toFixed(), count: Number(row.paymentCount),
    })),
    mobileMoney: executiveSources.mobileMoney.filter((row) => row.siteId === site.id),
    telco: executiveSources.telco.filter((row) => row.siteId === site.id),
    treasury: executiveSources.treasury.filter((row) => row.siteId === site.id),
    receivables: receivableRows.filter((row) => row.siteId === site.id).map((row) => ({ currencyCode: row.currencyCode, total: row.total.toFixed(6), overdue: row.overdue.toFixed(6), count: Number(row.count) })),
    stockAlerts: inventoryAlerts.find((row) => row.siteId === site.id) ? { lowStock: Number(inventoryAlerts.find((row) => row.siteId === site.id)!.lowStock), expiring: Number(inventoryAlerts.find((row) => row.siteId === site.id)!.expiring), expired: Number(inventoryAlerts.find((row) => row.siteId === site.id)!.expired) } : { lowStock: 0, expiring: 0, expired: 0 },
    inventory: stockByWarehouse.filter((row) => siteByWarehouse.get(row.warehouseId) === site.id).reduce((result, row) => ({
      quantityOnHand: result.quantityOnHand.plus(row._sum.quantityOnHand || 0),
      quantityReserved: result.quantityReserved.plus(row._sum.quantityReserved || 0),
      balanceRows: result.balanceRows + row._count._all,
    }), { quantityOnHand: new Prisma.Decimal(0), quantityReserved: new Prisma.Decimal(0), balanceRows: 0 }),
    cashSessions: sessions.filter((row) => row.siteId === site.id).map((row) => ({ status: row.status, count: row._count._all })),
    dailyCloses: closes.filter((row) => row.siteId === site.id).map((row) => ({ status: row.status, count: row._count._all })),
  }));
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "retail-site-overview", siteCount: items.length } });
  // Company-only balances without site attribution must never leak into a
  // single-site subtotal. Include historical closed-site journals in company
  // P&L, but report them as unallocated to current operating stores.
  const unallocated = {
    mobileMoney: siteId ? [] : executiveSources.mobileMoney.filter((row) => row.siteId === null || !ids.includes(row.siteId)),
    telco: siteId ? [] : executiveSources.telco.filter((row) => row.siteId === null || !ids.includes(row.siteId)),
    treasury: siteId ? [] : executiveSources.treasury.filter((row) => row.siteId === null || !ids.includes(row.siteId)),
    postedLedger: siteId ? [] : postedLedger.unallocated,
  };
  const summaries = items.map((item) => ({ siteId: item.id, currencies: summarizeRetailExecutive([item]) }));
  return NextResponse.json({
    items: items.map((item) => ({ ...item, inventory: { quantityOnHand: item.inventory.quantityOnHand.toFixed(), quantityReserved: item.inventory.quantityReserved.toFixed(), balanceRows: item.inventory.balanceRows } })),
    period: { from, to }, organizationName: organization?.name || "", timezone,
    scope: "OWNER_ONLY_OPERATIONAL", currencyPolicy: "SEPARATE_PER_CURRENCY", financeMarginCertified: false, postedLedgerScope: "PROVISIONAL_POSTED_ONLY", unallocatedPostedLedger: postedLedger.unallocated,
    unallocated, summaries, corporate: summarizeRetailExecutive(items, unallocated),
    timeline: executiveSources.timeline, sourceAvailability: { agency: agencyAccess.allowed, telco: telcoAccess.allowed, treasury: treasuryAccess.allowed, inventory: inventoryAccess.allowed, accounting: accountingAccess.allowed, reports: reportsAccess.allowed, reportCreate: Boolean(reportWriteAccess?.canCreate) },
    preferences,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
