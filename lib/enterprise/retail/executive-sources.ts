import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ValueRow = { siteId: string | null; currencyCode: string; total: Prisma.Decimal; count: bigint };
type AgencyRow = ValueRow & { transactionType: string; principal: Prisma.Decimal; commission: Prisma.Decimal; fees: Prisma.Decimal };
type TelcoRow = ValueRow & { margin: Prisma.Decimal; operatorCost: Prisma.Decimal };
type TreasuryRow = ValueRow & { accountType: string; reconciled: Prisma.Decimal; available: Prisma.Decimal | null };
type TrendRow = { siteId: string | null; currencyCode: string; day: string; metric: string; total: Prisma.Decimal };

export type ExecutiveSourceAccess = { agency: boolean; telco: boolean; treasury: boolean; financeCollections: boolean; invoices: boolean; expenses: boolean };

/** No speculative site attribution: cash/float account site is the canonical
 * operational dimension. Unassigned accounts remain visible company-wide. */
export async function loadRetailExecutiveSources(args: {
  organizationId: string; from: Date; to: Date; timezone: string; access: ExecutiveSourceAccess;
}) {
  const { organizationId, from, to, timezone, access } = args;
  const dateRange = Prisma.sql`BETWEEN ${from} AND ${to}`;
  const [agency, telco, treasury, posTrend, financeTrend, invoiceTrend, expenseTrend, agencyTrend, agencyFeesTrend, telcoTrend] = await Promise.all([
    access.agency ? prisma.$queryRaw<AgencyRow[]>(Prisma.sql`
      SELECT cash."siteId" AS "siteId", mm."currencyCode" AS "currencyCode", mm."transactionType" AS "transactionType",
        SUM(mm."principalAmount") AS principal, SUM(mm."providerCommissionAmount") AS commission,
        SUM(mm."customerFeeAmount") AS fees, SUM(mm."providerCommissionAmount" + mm."customerFeeAmount") AS total,
        COUNT(*)::bigint AS count
      FROM "EnterpriseMobileMoneyTransaction" mm
      LEFT JOIN "EnterpriseFinancialAccount" cash ON cash.id = mm."cashAccountId" AND cash."organizationId" = mm."organizationId"
      WHERE mm."organizationId" = ${organizationId} AND mm.status = 'CONFIRMED' AND mm."occurredAt" ${dateRange}
      GROUP BY cash."siteId", mm."currencyCode", mm."transactionType"
    `) : Promise.resolve([]),
    access.telco ? prisma.$queryRaw<TelcoRow[]>(Prisma.sql`
      SELECT account."siteId" AS "siteId", t."currencyCode" AS "currencyCode",
        SUM(t."saleAmount") AS total, SUM(t."marginAmount") AS margin,
        SUM(t."operatorCost") AS "operatorCost", COUNT(*)::bigint AS count
      FROM "EnterpriseTelcoTopup" t
      LEFT JOIN "EnterpriseFinancialAccount" account ON account.id = t."tenderFinancialAccountId" AND account."organizationId" = t."organizationId"
      WHERE t."organizationId" = ${organizationId} AND t.status = 'SUCCESS' AND t."occurredAt" ${dateRange}
      GROUP BY account."siteId", t."currencyCode"
    `) : Promise.resolve([]),
    access.treasury ? prisma.$queryRaw<TreasuryRow[]>(Prisma.sql`
      SELECT "siteId", "currencyCode", "accountType", SUM("operationalBalance") AS total,
        SUM("reconciledBalance") AS reconciled,
        CASE WHEN COUNT(*) FILTER (WHERE "availableBalance" IS NULL) > 0 THEN NULL
          ELSE SUM("availableBalance") END AS available,
        COUNT(*)::bigint AS count
      FROM "EnterpriseFinancialAccount" WHERE "organizationId" = ${organizationId} AND status = 'ACTIVE' AND "archivedAt" IS NULL
      GROUP BY "siteId", "currencyCode", "accountType"
    `) : Promise.resolve([]),
    prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT "siteId", "currencyCode", ("soldAt" AT TIME ZONE ${timezone})::date::text AS day,
        'posSales'::text AS metric, SUM("grandTotal") AS total
      FROM "EnterpriseRetailSale" WHERE "organizationId" = ${organizationId} AND status = 'COMPLETED' AND "soldAt" ${dateRange}
      GROUP BY "siteId", "currencyCode", day
    `),
    access.financeCollections ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT checkout."siteId" AS "siteId", payment."currencyCode" AS "currencyCode",
        (payment."paymentDate" AT TIME ZONE ${timezone})::date::text AS day,
        'financeCollections'::text AS metric, SUM(allocation.amount) AS total
      FROM "EnterpriseRetailInvoiceCheckout" checkout
      JOIN "EnterpriseReceivable" receivable ON receivable."salesInvoiceId" = checkout."salesInvoiceId" AND receivable."organizationId" = checkout."organizationId"
      JOIN "EnterprisePaymentAllocation" allocation ON allocation."receivableId" = receivable.id AND allocation."organizationId" = checkout."organizationId"
      JOIN "EnterprisePayment" payment ON payment.id = allocation."paymentId" AND payment."organizationId" = allocation."organizationId"
      WHERE checkout."organizationId" = ${organizationId} AND payment."paymentDate" ${dateRange}
        AND payment.status IN ('CONFIRMED', 'RECONCILED') AND payment.direction = 'INBOUND'
        AND payment."paymentType" = 'CUSTOMER_PAYMENT' AND allocation.status = 'CONFIRMED' AND allocation."reversedAt" IS NULL
      GROUP BY checkout."siteId", payment."currencyCode", day
    `) : Promise.resolve([]),
    access.invoices ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT checkout."siteId" AS "siteId", invoice."currencyCode" AS "currencyCode",
        (invoice."issuedAt" AT TIME ZONE ${timezone})::date::text AS day,
        'invoices'::text AS metric, SUM(invoice."grandTotal" - invoice."amountCredited") AS total
      FROM "EnterpriseRetailInvoiceCheckout" checkout
      JOIN "EnterpriseSalesInvoice" invoice ON invoice.id = checkout."salesInvoiceId" AND invoice."organizationId" = checkout."organizationId"
      WHERE checkout."organizationId" = ${organizationId} AND invoice."issuedAt" ${dateRange}
        AND invoice.status IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CREDIT_NOTE')
      GROUP BY checkout."siteId", invoice."currencyCode", day
    `) : Promise.resolve([]),
    access.expenses ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT "siteId", currency AS "currencyCode", ("expenseDate" AT TIME ZONE ${timezone})::date::text AS day,
        'expenses'::text AS metric, SUM(amount) AS total
      FROM "EnterpriseExpense" WHERE "organizationId" = ${organizationId} AND status = 'APPROVED' AND "archivedAt" IS NULL AND "expenseDate" ${dateRange}
      GROUP BY "siteId", currency, day
    `) : Promise.resolve([]),
    access.agency ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT cash."siteId" AS "siteId", mm."currencyCode" AS "currencyCode", (mm."occurredAt" AT TIME ZONE ${timezone})::date::text AS day,
        'mobileMoneyCommission'::text AS metric, SUM(mm."providerCommissionAmount") AS total
      FROM "EnterpriseMobileMoneyTransaction" mm LEFT JOIN "EnterpriseFinancialAccount" cash ON cash.id = mm."cashAccountId" AND cash."organizationId" = mm."organizationId"
      WHERE mm."organizationId" = ${organizationId} AND mm.status = 'CONFIRMED' AND mm."occurredAt" ${dateRange}
      GROUP BY cash."siteId", mm."currencyCode", day
    `) : Promise.resolve([]),
    access.agency ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT cash."siteId" AS "siteId", mm."currencyCode" AS "currencyCode", (mm."occurredAt" AT TIME ZONE ${timezone})::date::text AS day,
        'mobileMoneyFees'::text AS metric, SUM(mm."customerFeeAmount") AS total
      FROM "EnterpriseMobileMoneyTransaction" mm LEFT JOIN "EnterpriseFinancialAccount" cash ON cash.id = mm."cashAccountId" AND cash."organizationId" = mm."organizationId"
      WHERE mm."organizationId" = ${organizationId} AND mm.status = 'CONFIRMED' AND mm."occurredAt" ${dateRange}
      GROUP BY cash."siteId", mm."currencyCode", day
    `) : Promise.resolve([]),
    access.telco ? prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT account."siteId" AS "siteId", t."currencyCode" AS "currencyCode", (t."occurredAt" AT TIME ZONE ${timezone})::date::text AS day,
        'telcoMargin'::text AS metric, SUM(t."marginAmount") AS total
      FROM "EnterpriseTelcoTopup" t LEFT JOIN "EnterpriseFinancialAccount" account ON account.id = t."tenderFinancialAccountId" AND account."organizationId" = t."organizationId"
      WHERE t."organizationId" = ${organizationId} AND t.status = 'SUCCESS' AND t."occurredAt" ${dateRange}
      GROUP BY account."siteId", t."currencyCode", day
    `) : Promise.resolve([]),
  ]);
  const asMoney = (row: ValueRow) => ({ siteId: row.siteId, currencyCode: row.currencyCode, total: row.total.toFixed(6), count: Number(row.count) });
  return {
    mobileMoney: agency.map((row) => ({ ...asMoney(row), transactionType: row.transactionType, principal: row.principal.toFixed(6), commission: row.commission.toFixed(6), fees: row.fees.toFixed(6) })),
    telco: telco.map((row) => ({ ...asMoney(row), margin: row.margin.toFixed(6), operatorCost: row.operatorCost.toFixed(6) })),
    treasury: treasury.map((row) => ({ ...asMoney(row), accountType: row.accountType, reconciled: row.reconciled.toFixed(6), available: row.available?.toFixed(6) ?? null })),
    timeline: [...posTrend, ...financeTrend, ...invoiceTrend, ...expenseTrend, ...agencyTrend, ...agencyFeesTrend, ...telcoTrend].map((row) => ({ ...row, total: row.total.toFixed(6) })),
  };
}
