import { Prisma } from "@prisma/client";
import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import { FINANCE_AI_TOOL_CODES, type FinanceAiToolCode } from "@/lib/ai/tools/finance-contract";
import { resolveEnterpriseFinanceReadiness } from "@/lib/enterprise/accounting/finance-readiness-service";
import { serializeFinanceValue } from "@/lib/enterprise/accounting/helpers";
import {
  enterpriseBudgetVisibilityWhere,
  enterpriseExpenseVisibilityWhere,
  getEnterpriseFinanceAccess,
} from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type FinanceReadArgs = { periodDays?: number; limit?: number };
type FinanceToolResult = {
  toolName: FinanceAiToolCode;
  label: string;
  status: "AVAILABLE" | "EMPTY";
  summary: string;
  asOf: string;
  data: Record<string, unknown>;
};

const MAX_QUERY_ROWS = 25;
const LABELS: Record<FinanceAiToolCode, string> = {
  FINANCE_OVERVIEW_READ: "Vue d’ensemble financière",
  FINANCE_BUDGETS_READ: "Finances & budgets",
  FINANCE_RECEIVABLES_READ: "Ventes & créances",
  FINANCE_PAYABLES_READ: "Achats & dettes",
  FINANCE_PAYMENTS_READ: "Paiements",
  FINANCE_TREASURY_READ: "Trésorerie",
  FINANCE_CASH_READ: "Caisse",
  FINANCE_BANK_READ: "Banque",
  FINANCE_RECONCILIATION_READ: "Rapprochement",
  FINANCE_ACCOUNTING_READ: "Comptabilité",
  FINANCE_TAX_READ: "Taxes",
  FINANCE_CLOSE_READ: "Clôture financière",
  FINANCE_STATEMENTS_READ: "États financiers",
  FINANCE_ASSETS_READ: "Comptabilité des immobilisations",
  FINANCE_INVENTORY_READ: "Valorisation du stock",
};

function requireOrganization(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  return organizationId;
}

function windowFor(args: FinanceReadArgs) {
  const periodDays = Math.min(366, Math.max(1, args.periodDays || 30));
  const limit = Math.min(MAX_QUERY_ROWS, Math.max(1, args.limit || 12));
  const end = new Date();
  return { limit, end, start: new Date(end.getTime() - periodDays * 86_400_000) };
}

function dataRecord(value: unknown): Record<string, unknown> {
  const serialized = serializeFinanceValue(value);
  return serialized && typeof serialized === "object" && !Array.isArray(serialized)
    ? serialized as Record<string, unknown>
    : { value: serialized };
}

function output(toolName: FinanceAiToolCode, count: number, summary: string, data: unknown): FinanceToolResult {
  return {
    toolName,
    label: LABELS[toolName],
    status: count > 0 ? "AVAILABLE" : "EMPTY",
    summary,
    asOf: new Date().toISOString(),
    data: dataRecord(data),
  };
}

async function overview(organizationId: string, toolName: FinanceAiToolCode) {
  const readiness = await resolveEnterpriseFinanceReadiness(prisma, organizationId, { mode: "SETUP" });
  return output(
    toolName,
    readiness.diagnostics.length || (readiness.configuration ? 1 : 0),
    readiness.ready
      ? "Le diagnostic financier canonique indique que la configuration est prête."
      : "Le diagnostic financier canonique a été lu et signale encore des points à traiter.",
    {
      configured: Boolean(readiness.configuration),
      ready: readiness.ready,
      functionalCurrencyCode: readiness.configuration?.functionalCurrencyCode || null,
      presentationCurrencyCode: readiness.configuration?.presentationCurrencyCode || readiness.configuration?.functionalCurrencyCode || null,
      readinessStatus: readiness.configuration?.readinessStatus || null,
      blockers: readiness.blockers.slice(0, 12).map((item) => ({ labelFr: item.labelFr, messageFr: item.messageFr })),
      warnings: readiness.warnings.slice(0, 12).map((item) => ({ labelFr: item.labelFr, messageFr: item.messageFr })),
    },
  );
}

async function budgets(context: AiToolRuntimeContext, organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const access = await getEnterpriseFinanceAccess({ session: context.session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) throw new Error("FINANCE_BUDGETS_ACCESS_DENIED");

  const budgetVisibility = enterpriseBudgetVisibilityWhere({ organizationId, userId: context.userId, canSeeAll: access.canSeeAll });
  const expenseVisibility = enterpriseExpenseVisibilityWhere({ organizationId, userId: context.userId, canSeeAll: access.canSeeAll });
  const budgetsFound = await prisma.enterpriseBudget.findMany({
    where: budgetVisibility,
    orderBy: [{ periodEnd: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: { id: true, reference: true, title: true, status: true, currency: true, periodStart: true, periodEnd: true, forecastAmount: true },
  });

  const items = await Promise.all(budgetsFound.map(async (budget) => {
    const [planned, commitments, actual] = await Promise.all([
      prisma.enterpriseBudgetLine.aggregate({
        where: { organizationId, budgetId: budget.id },
        _sum: { plannedAmount: true, forecastAmount: true },
      }),
      prisma.enterpriseBudgetCommitment.aggregate({
        where: { organizationId, budgetLine: { budgetId: budget.id }, status: "ACTIVE" },
        _sum: { committedAmount: true, realizedAmount: true, releasedAmount: true },
      }),
      prisma.enterpriseExpense.aggregate({
        where: { ...expenseVisibility, status: "APPROVED", budgetLine: { budgetId: budget.id } },
        _sum: { amount: true },
      }),
    ]);
    const plannedAmount = new Prisma.Decimal(planned._sum.plannedAmount || 0);
    const committedRemaining = new Prisma.Decimal(commitments._sum.committedAmount || 0)
      .minus(commitments._sum.realizedAmount || 0)
      .minus(commitments._sum.releasedAmount || 0);
    const approvedActual = new Prisma.Decimal(actual._sum.amount || 0);
    const nonNegativeCommitted = committedRemaining.isNegative() ? new Prisma.Decimal(0) : committedRemaining;
    return {
      reference: budget.reference,
      title: budget.title,
      status: budget.status,
      currency: budget.currency,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      plannedAmount,
      forecastAmount: budget.forecastAmount || planned._sum.forecastAmount || null,
      committedRemaining: nonNegativeCommitted,
      approvedActual,
      availableAmount: plannedAmount.minus(nonNegativeCommitted).minus(approvedActual),
    };
  }));

  return output(toolName, items.length, items.length ? "Budgets autorisés lus avec engagements, dépenses approuvées et disponible calculé par budget et devise." : "Aucun budget visible pour cet utilisateur.", { items });
}

async function receivables(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const where = { organizationId, status: "OPEN", outstandingAmount: { gt: 0 } } as const;
  const [totals, items] = await Promise.all([
    prisma.enterpriseReceivable.groupBy({ by: ["currencyCode"], where, _sum: { outstandingAmount: true }, _count: { _all: true } }),
    prisma.enterpriseReceivable.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: { currencyCode: true, outstandingAmount: true, dueDate: true, status: true, salesInvoice: { select: { number: true, invoiceDate: true } } },
    }),
  ]);
  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, total, total ? `${total} créance(s) ouverte(s), regroupées par devise avec les prochaines échéances.` : "Aucune créance ouverte.", { totals, items });
}

async function payables(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const where = { organizationId, status: "OPEN", outstandingAmount: { gt: 0 } } as const;
  const [totals, items] = await Promise.all([
    prisma.enterprisePayable.groupBy({ by: ["currencyCode"], where, _sum: { outstandingAmount: true }, _count: { _all: true } }),
    prisma.enterprisePayable.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: { currencyCode: true, outstandingAmount: true, dueDate: true, status: true, supplierInvoice: { select: { number: true, invoiceDate: true } } },
    }),
  ]);
  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, total, total ? `${total} dette(s) fournisseur ouverte(s), regroupées par devise avec les prochaines échéances.` : "Aucune dette fournisseur ouverte.", { totals, items });
}

async function payments(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit, start, end } = windowFor(args);
  const where = { organizationId, paymentDate: { gte: start, lte: end } };
  const [totals, items] = await Promise.all([
    prisma.enterprisePayment.groupBy({ by: ["currencyCode", "direction"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.enterprisePayment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { number: true, direction: true, paymentType: true, methodType: true, currencyCode: true, amount: true, unallocatedAmount: true, paymentDate: true, status: true, reference: true, confirmedAt: true, reconciledAt: true },
    }),
  ]);
  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, total, total ? `${total} paiement(s) trouvé(s) sur la période, regroupés par devise et sens.` : "Aucun paiement dans la période.", { periodStart: start, periodEnd: end, totals, items });
}

async function financialAccounts(organizationId: string, accountTypes?: string[]) {
  const where = { organizationId, status: "ACTIVE", archivedAt: null, ...(accountTypes?.length ? { accountType: { in: accountTypes } } : {}) };
  const [total, items] = await Promise.all([
    prisma.enterpriseFinancialAccount.count({ where }),
    prisma.enterpriseFinancialAccount.findMany({
      where,
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
      take: MAX_QUERY_ROWS,
      select: { code: true, name: true, accountType: true, currencyCode: true, maskedReference: true, openingBalance: true, operationalBalance: true, reconciledBalance: true, availableBalance: true, updatedAt: true },
    }),
  ]);
  return { total, items };
}

async function treasuryFlow(organizationId: string, args: FinanceReadArgs, accountTypes?: string[]) {
  const { limit, start, end } = windowFor(args);
  const accountFilter = accountTypes?.length ? { financialAccount: { accountType: { in: accountTypes } } } : {};
  const where = { organizationId, status: "CONFIRMED", transactionDate: { gte: start, lte: end }, ...accountFilter };
  const [totals, items] = await Promise.all([
    prisma.enterpriseTreasuryTransaction.groupBy({ by: ["currencyCode", "direction"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.enterpriseTreasuryTransaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { transactionType: true, direction: true, currencyCode: true, amount: true, transactionDate: true, reference: true, reconciliationStatus: true, financialAccount: { select: { code: true, name: true, accountType: true } } },
    }),
  ]);
  return { periodStart: start, periodEnd: end, totals, items };
}

async function treasury(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const [accounts, flow] = await Promise.all([financialAccounts(organizationId), treasuryFlow(organizationId, args)]);
  const flowCount = flow.totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, accounts.total + flowCount, accounts.total || flowCount ? "Positions de trésorerie actuelles et flux confirmés récents lus par devise." : "Aucun compte financier actif ni mouvement confirmé.", { accounts, flow });
}

async function cash(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const [accounts, flow, sessions, discrepancyTotals] = await Promise.all([
    financialAccounts(organizationId, ["CASH", "MOBILE_MONEY"]),
    treasuryFlow(organizationId, args, ["CASH", "MOBILE_MONEY"]),
    prisma.enterpriseCashSession.findMany({
      where: { organizationId },
      orderBy: [{ openedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { number: true, status: true, openedAt: true, openingAmount: true, expectedClosingAmount: true, countedClosingAmount: true, discrepancyAmount: true, submittedAt: true, validatedAt: true, financialAccount: { select: { code: true, name: true, currencyCode: true } } },
    }),
    prisma.enterpriseCashDiscrepancy.groupBy({ by: ["status"], where: { organizationId }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return output(toolName, accounts.total + sessions.length, accounts.total || sessions.length ? "Positions de caisse/Mobile Money, sessions récentes et écarts ont été lus." : "Aucune donnée de caisse active.", { accounts, sessions, discrepancyTotals, flow });
}

async function bank(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const [accounts, statements] = await Promise.all([
    financialAccounts(organizationId, ["BANK"]),
    prisma.enterpriseBankStatement.findMany({
      where: { organizationId },
      orderBy: [{ statementDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { reference: true, statementDate: true, periodStart: true, periodEnd: true, currencyCode: true, openingBalance: true, closingBalance: true, status: true, financialAccount: { select: { code: true, name: true } } },
    }),
  ]);
  return output(toolName, accounts.total + statements.length, accounts.total || statements.length ? "Positions bancaires et relevés récents autorisés ont été lus." : "Aucune donnée bancaire active.", { accounts, statements });
}

async function reconciliation(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const [transactionStatuses, sessions, unreconciledItems] = await Promise.all([
    prisma.enterpriseTreasuryTransaction.groupBy({ by: ["reconciliationStatus"], where: { organizationId, status: "CONFIRMED" }, _count: { _all: true } }),
    prisma.enterpriseReconciliationSession.findMany({
      where: { organizationId },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { number: true, status: true, periodStart: true, periodEnd: true, bookBalance: true, statementBalance: true, reconciledDifference: true, completedAt: true, financialAccount: { select: { code: true, name: true, currencyCode: true } } },
    }),
    prisma.enterpriseTreasuryTransaction.findMany({
      where: { organizationId, status: "CONFIRMED", reconciliationStatus: { not: "RECONCILED" } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { transactionType: true, direction: true, currencyCode: true, amount: true, transactionDate: true, reference: true, reconciliationStatus: true, financialAccount: { select: { code: true, name: true } } },
    }),
  ]);
  const total = transactionStatuses.reduce((sum, row) => sum + row._count._all, 0) + sessions.length;
  return output(toolName, total, total ? "Sessions de rapprochement, statuts de mouvements et éléments non rapprochés ont été lus." : "Aucune donnée de rapprochement disponible.", { transactionStatuses, sessions, unreconciledItems });
}

async function accounting(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit, start, end } = windowFor(args);
  const where = { organizationId, status: "POSTED", accountingDate: { gte: start, lte: end } };
  const [totals, entries, openPeriods] = await Promise.all([
    prisma.enterpriseJournalEntry.groupBy({ by: ["functionalCurrencyCode"], where, _sum: { totalDebit: true, totalCredit: true }, _count: { _all: true } }),
    prisma.enterpriseJournalEntry.findMany({
      where,
      orderBy: [{ accountingDate: "desc" }, { postedAt: "desc" }],
      take: limit,
      select: { number: true, accountingDate: true, description: true, reference: true, totalDebit: true, totalCredit: true, functionalCurrencyCode: true, postedAt: true, journal: { select: { code: true, nameFr: true, journalType: true } } },
    }),
    prisma.enterpriseFiscalPeriod.count({ where: { organizationId, status: "OPEN" } }),
  ]);
  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, total + openPeriods, total ? `${total} écriture(s) postée(s) sur la période, avec contrôle débit/crédit par devise fonctionnelle.` : "Aucune écriture postée sur la période.", { periodStart: start, periodEnd: end, openPeriods, totals, entries });
}

async function tax(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit, start, end } = windowFor(args);
  const rows = await prisma.$queryRaw<Array<{ code: string; category: string; currencyCode: string; taxableAmount: Prisma.Decimal; outputTax: Prisma.Decimal; inputTax: Prisma.Decimal; netTax: Prisma.Decimal }>>(Prisma.sql`
    SELECT c.code, c.category, t."currencyCode",
      SUM(t."taxableAmount") AS "taxableAmount",
      SUM(CASE WHEN t.direction = 'OUTPUT' THEN t."taxAmount" ELSE 0 END) AS "outputTax",
      SUM(CASE WHEN t.direction = 'INPUT' THEN t."taxAmount" ELSE 0 END) AS "inputTax",
      SUM(CASE WHEN t.direction = 'OUTPUT' THEN t."taxAmount" ELSE -t."taxAmount" END) AS "netTax"
    FROM "EnterpriseTaxLine" t
    INNER JOIN "EnterpriseTaxCode" c ON c.id = t."taxCodeId" AND c."organizationId" = t."organizationId"
    WHERE t."organizationId" = ${organizationId} AND t."createdAt" BETWEEN ${start} AND ${end}
    GROUP BY c.code, c.category, t."currencyCode"
    ORDER BY c.code, t."currencyCode"
    LIMIT ${limit}
  `);
  return output(toolName, rows.length, rows.length ? "Synthèse fiscale calculée depuis les lignes de taxe canoniques, séparée par devise." : "Aucune ligne de taxe dans la période.", { periodStart: start, periodEnd: end, rows });
}

async function close(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const periods = await prisma.enterpriseFiscalPeriod.findMany({
    where: { organizationId },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { code: true, startDate: true, endDate: true, status: true, softClosedAt: true, closedAt: true, lockedAt: true, reopenedAt: true, closes: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, requestedAt: true, approvedAt: true, closedAt: true, reopenedAt: true, blockersJson: true } } },
  });
  return output(toolName, periods.length, periods.length ? "Périodes financières et derniers états de clôture ont été lus." : "Aucune période financière configurée.", { periods });
}

async function statements(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const snapshots = await prisma.enterpriseFinancialStatementSnapshot.findMany({
    where: { organizationId },
    orderBy: [{ periodEnd: "desc" }, { generatedAt: "desc" }],
    take: Math.min(limit, 12),
    select: { statementType: true, periodStart: true, periodEnd: true, currencyCode: true, status: true, publishedAt: true, generatedAt: true },
  });
  return output(toolName, snapshots.length, snapshots.length ? "États financiers disponibles lus sous forme de métadonnées bornées; aucun snapshot complet n’a été injecté dans le modèle." : "Aucun état financier généré ou publié.", { statements: snapshots });
}

async function assets(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit } = windowFor(args);
  const [totals, profiles] = await Promise.all([
    prisma.enterpriseAssetAccountingProfile.groupBy({ by: ["currencyCode"], where: { organizationId }, _sum: { originalCost: true, residualValue: true }, _count: { _all: true } }),
    prisma.enterpriseAssetAccountingProfile.findMany({
      where: { organizationId },
      orderBy: [{ inServiceDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { assetId: true, originalCost: true, residualValue: true, usefulLifeMonths: true, inServiceDate: true, depreciationMethod: true, currencyCode: true, status: true },
    }),
  ]);
  const assetIds = profiles.map((profile) => profile.assetId);
  const assetRows = assetIds.length ? await prisma.enterpriseAsset.findMany({
    where: { organizationId, id: { in: assetIds }, archivedAt: null },
    select: { id: true, code: true, name: true, status: true, condition: true },
  }) : [];
  const assetsById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const items = profiles.map(({ assetId, ...profile }) => ({
    ...profile,
    asset: assetsById.has(assetId)
      ? { code: assetsById.get(assetId)?.code, name: assetsById.get(assetId)?.name, status: assetsById.get(assetId)?.status, condition: assetsById.get(assetId)?.condition }
      : null,
  }));
  const total = totals.reduce((sum, row) => sum + row._count._all, 0);
  return output(toolName, total, total ? `${total} immobilisation(s) dans le registre comptable, agrégées par devise avec détail borné.` : "Aucune immobilisation dans le registre comptable.", { totals, items });
}

async function inventory(organizationId: string, toolName: FinanceAiToolCode, args: FinanceReadArgs) {
  const { limit, end } = windowFor(args);
  const [totals, positions] = await Promise.all([
    prisma.$queryRaw<Array<{ currencyCode: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>>(Prisma.sql`
      SELECT "currencyCode",
        COALESCE(SUM("remainingQuantity"), 0) AS quantity,
        COALESCE(SUM("remainingQuantity" * "unitCost"), 0) AS value
      FROM "EnterpriseInventoryCostLayer"
      WHERE "organizationId" = ${organizationId} AND "effectiveAt" <= ${end} AND "remainingQuantity" > 0
      GROUP BY "currencyCode"
      ORDER BY "currencyCode"
    `),
    prisma.$queryRaw<Array<{ inventoryItemId: string; warehouseId: string | null; currencyCode: string; quantity: Prisma.Decimal; value: Prisma.Decimal }>>(Prisma.sql`
      SELECT "inventoryItemId", "warehouseId", "currencyCode",
        COALESCE(SUM("remainingQuantity"), 0) AS quantity,
        COALESCE(SUM("remainingQuantity" * "unitCost"), 0) AS value
      FROM "EnterpriseInventoryCostLayer"
      WHERE "organizationId" = ${organizationId} AND "effectiveAt" <= ${end} AND "remainingQuantity" > 0
      GROUP BY "inventoryItemId", "warehouseId", "currencyCode"
      ORDER BY value DESC, "inventoryItemId", "warehouseId", "currencyCode"
      LIMIT ${limit}
    `),
  ]);
  return output(toolName, totals.length, totals.length ? "Valorisation du stock calculée depuis les couches de coût canoniques, séparée par devise avec positions bornées." : "Aucune couche de coût de stock valorisable.", { asOf: end, totals, positions });
}

export async function runFinanceReadToolData(input: {
  context: AiToolRuntimeContext;
  toolName: FinanceAiToolCode;
  args?: FinanceReadArgs;
}): Promise<FinanceToolResult> {
  const organizationId = requireOrganization(input.context);
  const args = input.args || {};
  switch (input.toolName) {
    case "FINANCE_OVERVIEW_READ": return overview(organizationId, input.toolName);
    case "FINANCE_BUDGETS_READ": return budgets(input.context, organizationId, input.toolName, args);
    case "FINANCE_RECEIVABLES_READ": return receivables(organizationId, input.toolName, args);
    case "FINANCE_PAYABLES_READ": return payables(organizationId, input.toolName, args);
    case "FINANCE_PAYMENTS_READ": return payments(organizationId, input.toolName, args);
    case "FINANCE_TREASURY_READ": return treasury(organizationId, input.toolName, args);
    case "FINANCE_CASH_READ": return cash(organizationId, input.toolName, args);
    case "FINANCE_BANK_READ": return bank(organizationId, input.toolName, args);
    case "FINANCE_RECONCILIATION_READ": return reconciliation(organizationId, input.toolName, args);
    case "FINANCE_ACCOUNTING_READ": return accounting(organizationId, input.toolName, args);
    case "FINANCE_TAX_READ": return tax(organizationId, input.toolName, args);
    case "FINANCE_CLOSE_READ": return close(organizationId, input.toolName, args);
    case "FINANCE_STATEMENTS_READ": return statements(organizationId, input.toolName, args);
    case "FINANCE_ASSETS_READ": return assets(organizationId, input.toolName, args);
    case "FINANCE_INVENTORY_READ": return inventory(organizationId, input.toolName, args);
  }
  const exhaustive: never = input.toolName;
  throw new Error(`FINANCE_TOOL_NOT_SUPPORTED:${exhaustive}`);
}

export const FINANCE_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = Object.fromEntries(
  FINANCE_AI_TOOL_CODES.map((toolName) => [
    toolName,
    async ({ args, context }) => runFinanceReadToolData({ context, toolName, args: args as FinanceReadArgs }),
  ]),
);
