import { Prisma } from "@prisma/client";
import type { MonetaryTotal } from "@/lib/enterprise/common/analytics";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { NextResponse } from "next/server";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prepareCommercialMobileMoney } from "@/lib/enterprise/retail/commercial-guardrails";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { authorizeRetailRequest, retailErrorResponse, retailListParams } from "@/lib/enterprise/retail/http";
import { retailFailureOutcome, retailPendingOutcome, retailSuccessOutcome } from "@/lib/enterprise/retail/mutation-outcome";
import { createConnectedMobileMoneyOperation } from "@/lib/enterprise/retail/operator-orchestration";
import { mobileMoneyCreateSchema } from "@/lib/enterprise/retail/schemas";
import { createMobileMoneyTransactionWithPosting } from "@/lib/enterprise/retail/service";
import { retailFinanceReadSiteScope } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

const historyFields = {
  principalAmount: true, customerFeeAmount: true, providerCommissionAmount: true,
  cashEffectAmount: true, floatEffectAmount: true,
} as const;
type HistoryAmounts = Record<keyof typeof historyFields, Prisma.Decimal | null>;
type HistoryGroup = { currencyCode: string; status: string; transactionType: string; _sum: HistoryAmounts; _count: { _all: number } };
const ExactAmount = Prisma.Decimal.clone({ precision: 48 });

function historyTotals(groups: HistoryGroup[]) {
  return groups.map(({ currencyCode, status, transactionType, _sum, _count }) => ({
    currencyCode, status, transactionType, count: _count._all,
    principalAmount: _sum.principalAmount?.toFixed() ?? null,
    customerFeeAmount: _sum.customerFeeAmount?.toFixed() ?? null,
    providerCommissionAmount: _sum.providerCommissionAmount?.toFixed() ?? null,
    cashEffectAmount: _sum.cashEffectAmount?.toFixed() ?? null,
    floatEffectAmount: _sum.floatEffectAmount?.toFixed() ?? null,
  }));
}

function historyPageTotals(rows: (HistoryAmounts & Pick<HistoryGroup, "currencyCode" | "status" | "transactionType">)[]) {
  const groups = new Map<string, HistoryGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.currencyCode, row.status, row.transactionType]);
    const group = groups.get(key) ?? {
      currencyCode: row.currencyCode, status: row.status, transactionType: row.transactionType,
      _sum: { principalAmount: null, customerFeeAmount: null, providerCommissionAmount: null, cashEffectAmount: null, floatEffectAmount: null },
      _count: { _all: 0 },
    };
    for (const field of Object.keys(historyFields) as (keyof HistoryAmounts)[]) {
      if (row[field] != null) group._sum[field] = new Prisma.Decimal(new ExactAmount(group._sum[field] ?? 0).plus(row[field]).toFixed());
    }
    group._count._all++;
    groups.set(key, group);
  }
  return historyTotals([...groups.values()]);
}

const monetaryMetrics = [
  ["principalAmount", "mobileMoneyPrincipal"], ["customerFeeAmount", "mobileMoneyFee"],
  ["providerCommissionAmount", "mobileMoneyCommission"], ["cashEffectAmount", "mobileMoneyCashEffect"],
  ["floatEffectAmount", "mobileMoneyFloatEffect"],
] as const;
function monetaryTotals(groups: ReturnType<typeof historyTotals>): MonetaryTotal[] {
  return groups.flatMap(group => monetaryMetrics.flatMap(([field, metric]) =>
    group[field] === null ? [] : [{ currencyCode: group.currencyCode, status: group.status, operationType: group.transactionType, metric, amount: group[field]! }]
  ));
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "read");
  if (!auth.ok) return auth.response;
  const { page, pageSize, status, providerCode, search, from, to } = retailListParams(req);
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || !Number.isSafeInteger((page - 1) * pageSize) || search.length > 120) {
    return NextResponse.json({ error: "MOBILE_MONEY_HISTORY_FILTER_INVALID", message: "Vérifiez la pagination et limitez la recherche à 120 caractères." }, { status: 400 });
  }
  const transactionType = (new URL(req.url).searchParams.get("transactionType") || "").trim().toUpperCase();
  if (transactionType && !["DEPOSIT", "WITHDRAWAL"].includes(transactionType)) {
    return NextResponse.json({ error: "MOBILE_MONEY_HISTORY_FILTER_INVALID", message: "Choisissez un type d’opération valide." }, { status: 400 });
  }
  const effectiveFrom = dates.from || from;
  const effectiveTo = dates.to || to;
  try {
    const result = await prisma.$transaction(async tx => {
      // An operation belongs to the shop of its cash account, not the provider's
      // shared float. Archived cash accounts retain their historical site.
      const visibleSites = await retailFinanceReadSiteScope(organizationId, auth.session.userId, "VIEW_SALES", tx);
      const permittedCashAccountIds = visibleSites === null ? null : (await tx.enterpriseFinancialAccount.findMany({
        where: { organizationId, siteId: { in: visibleSites }, accountType: "CASH" },
        select: { id: true },
      })).map(account => account.id);
      const authorizedScope: Prisma.EnterpriseMobileMoneyTransactionWhereInput = {
        organizationId,
        ...(permittedCashAccountIds !== null ? { cashAccountId: { in: permittedCashAccountIds } } : {}),
      };
      const where: Prisma.EnterpriseMobileMoneyTransactionWhereInput = {
        ...authorizedScope,
        ...(status ? { status } : {}),
        ...(providerCode ? { providerCode } : {}),
        ...(transactionType ? { transactionType } : {}),
        ...(effectiveFrom || effectiveTo ? { occurredAt: { ...(effectiveFrom ? { gte: effectiveFrom } : {}), ...(effectiveTo ? { lte: effectiveTo } : {}) } } : {}),
        ...(search ? { OR: [
          { number: { contains: search, mode: "insensitive" } },
          { providerCode: { contains: search, mode: "insensitive" } },
          { externalReference: { contains: search, mode: "insensitive" } },
          { customerPhone: { contains: search } },
        ] } : {}),
      };
      const summarize = (scope: Prisma.EnterpriseMobileMoneyTransactionWhereInput) => tx.enterpriseMobileMoneyTransaction.groupBy({
        by: ["currencyCode", "status", "transactionType"], where: scope,
        _sum: historyFields, _count: { _all: true },
        orderBy: [{ currencyCode: "asc" }, { status: "asc" }, { transactionType: "asc" }],
      });
      const general = summarize(authorizedScope);
      const filtered = status || providerCode || transactionType || effectiveFrom || effectiveTo || search ? summarize(where) : general;
      const [items, filteredGroups, generalGroups] = await Promise.all([
        tx.enterpriseMobileMoneyTransaction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
        filtered, general,
      ]);
      const total = filteredGroups.reduce((count, group) => count + group._count._all, 0);
      const operationTotals = { filtered: historyTotals(filteredGroups), general: historyTotals(generalGroups), page: historyPageTotals(items) };
      return {
        items: items.map(item => {
          const phone = item.customerPhone.length > 6 ? item.customerPhone.slice(0, 4) + "••••" + item.customerPhone.slice(-3) : "••••";
          return { ...item, customerPhone: phone, customerPhoneMasked: phone,
            principalAmount: item.principalAmount.toFixed(), customerFeeAmount: item.customerFeeAmount.toFixed(),
            providerCommissionAmount: item.providerCommissionAmount.toFixed(), cashEffectAmount: item.cashEffectAmount.toFixed(),
            floatEffectAmount: item.floatEffectAmount.toFixed() };
        }),
        pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
        operationTotals,
        filteredTotals: monetaryTotals(operationTotals.filtered),
        generalTotals: monetaryTotals(operationTotals.general),
        pageTotals: monetaryTotals(operationTotals.page),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", page } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_HISTORY_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "MOBILE_MONEY_AGENCY", "submit", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const parsed = mobileMoneyCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_MOBILE_MONEY_INPUT_INVALID", req);
  try {
    const prepared = await prepareCommercialMobileMoney(organizationId, parsed.data);
    if (prepared.executionMode === "CONNECTED") {
      const connected = await createConnectedMobileMoneyOperation(organizationId, auth.session.userId, prepared.input);
      if (!connected) throw new EnterpriseRetailError("RETAIL_PROVIDER_NOT_CONNECTED", 409, { providerCode: prepared.input.providerCode });
      const finalized = connected.finalized?.kind === "MOBILE_MONEY" ? connected.finalized.transaction : null;
      const failed = connected.operation.status === "FAILED";
      const pending = !failed && !finalized;
      const statusCode = failed ? 422 : pending ? 202 : connected.idempotent ? 200 : 201;
      await Promise.allSettled([
        writeAuditLog({
          userId: auth.session.userId,
          action: `ENTERPRISE_MOBILE_MONEY_PROVIDER_${connected.operation.status}`,
          entity: "EnterpriseRetailProviderOperation",
          entityId: connected.operation.id,
          request: req,
          metadata: {
            organizationId,
            providerCode: prepared.input.providerCode,
            transactionType: prepared.input.transactionType,
            amount: String(prepared.input.principalAmount),
            currency: prepared.input.currencyCode,
            providerStatus: connected.operation.status,
            businessTransactionId: finalized?.id || null,
            idempotent: connected.idempotent,
          },
        }),
        writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "provider-initiate", providerStatus: connected.operation.status, finalized: Boolean(finalized), outcome: failed ? "FAILURE" : pending ? "PENDING" : "SUCCESS" } }),
      ]);
      if (failed) {
        return NextResponse.json(
          retailFailureOutcome("RETAIL_PROVIDER_FAILED", { mode: "CONNECTED", operation: connected.operation, transaction: finalized, idempotent: connected.idempotent }),
          { status: statusCode },
        );
      }
      if (pending) {
        return NextResponse.json(
          retailPendingOutcome("RETAIL_PROVIDER_PENDING", { mode: "CONNECTED", operation: connected.operation, transaction: finalized, idempotent: connected.idempotent }),
          { status: statusCode },
        );
      }
      return NextResponse.json(
        retailSuccessOutcome({ mode: "CONNECTED", operation: connected.operation, transaction: finalized, idempotent: connected.idempotent }),
        { status: statusCode },
      );
    }

    const result = await createMobileMoneyTransactionWithPosting(organizationId, auth.session.userId, prepared.input);
    const accounting = result.accounting;
    const statusCode = result.idempotent ? 200 : 201;
    await Promise.allSettled([
      writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_MOBILE_MONEY_CONFIRMED", entity: "EnterpriseMobileMoneyTransaction", entityId: result.transaction.id, request: req, metadata: { organizationId, number: result.transaction.number, providerCode: result.transaction.providerCode, transactionType: result.transaction.transactionType, amount: result.transaction.principalAmount.toFixed(), currency: result.transaction.currencyCode, externalReference: result.transaction.externalReference, idempotent: result.idempotent, mode: "MANUAL", journalEntryId: accounting.entry.id } }),
      writeApiLog({ request: req, statusCode, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "mobile-money", action: "create", mode: "MANUAL", journalEntryId: accounting.entry.id, outcome: "SUCCESS" } }),
    ]);
    return NextResponse.json(retailSuccessOutcome({ mode: "MANUAL", ...result, accounting: { journalEntryId: accounting.entry.id, idempotent: accounting.idempotent } }), { status: statusCode });
  } catch (error) {
    return retailErrorResponse(error, "MOBILE_MONEY_CREATE_FAILED");
  }
}
