import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { readMobileMoneyFxHistory } from "@/lib/enterprise/retail/mobile-money-fx-history";
import { writeApiLog } from "@/lib/audit";
import { getCommercialRetailDashboardRead } from "@/lib/enterprise/retail/commercial-dashboard";
import { RETAIL_MODULE_CODES, type RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

type MobileMoneyHistoryItem = {
  id: string;
  number: string;
  providerCode: string;
  transactionType: string;
  customerPhoneMasked?: string;
  currencyCode: string;
  principalAmount: string | number | { toString(): string };
  customerFeeAmount: string | number | { toString(): string };
  providerCommissionAmount: string | number | { toString(): string };
  externalReference: string | null;
  status: string;
  accountingStatus?: "POSTED" | "PENDING" | "NOT_APPLICABLE";
  accountingBlockerCode?: string | null;
  occurredAt: Date | string;
  revision: number;
};

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const url = new URL(req.url);
  const requestedModule = url.searchParams.get("moduleCode")?.trim().toUpperCase();
  const moduleCode: RetailModuleCode = RETAIL_MODULE_CODES.includes(requestedModule as RetailModuleCode) ? requestedModule as RetailModuleCode : "RETAIL_POS";
  const auth = await authorizeRetailRequest(req, organizationId, moduleCode, "read");
  if (!auth.ok) return auth.response;
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  const dashboardRead = await getCommercialRetailDashboardRead(
    organizationId,
    auth.session.userId,
    from && !Number.isNaN(from.getTime()) ? from : undefined,
    to && !Number.isNaN(to.getTime()) ? to : undefined,
    moduleCode,
  );
  const dashboard = dashboardRead.dashboard;

  const common = {
    configuration: dashboard.configuration,
    accounts: dashboard.accounts,
    cashSession: dashboard.cashSession,
    cashSessions: dashboard.cashSessions,
    readiness: dashboard.readiness,
    access: { canWrite: auth.access.canWrite, canManage: auth.access.canAdminister },
    range: dashboard.range,
  };
  const mobileMoneyRecent: MobileMoneyHistoryItem[] = dashboard.recent.mobileMoney.map((entry) => {
    const item = { ...entry };
    Reflect.deleteProperty(item, "customerPhone");
    return item as MobileMoneyHistoryItem;
  });
  const topupRecent = dashboard.recent.topups.map((entry) => {
    const item = { ...entry };
    Reflect.deleteProperty(item, "destinationPhone");
    return item;
  });

  let mobileMoneyHistory: MobileMoneyHistoryItem[] = mobileMoneyRecent;
  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    const history = await prisma.$transaction(tx => readMobileMoneyFxHistory(tx, {
      organizationId, userId: auth.session.userId, page: 1, pageSize: 100,
      from: new Date(dashboard.range.from), to: new Date(dashboard.range.to),
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const fxHistory: MobileMoneyHistoryItem[] = history.items.map(transfer => {
      const posted = transfer.accountingStatus === "POSTED";
      const reversed = transfer.status === "REVERSED";
      const accountingErrorCode = transfer.accountingBlockerCode || "POSTING_PENDING";
      return {
        id: transfer.id,
        number: transfer.number,
        providerCode: transfer.providerCode,
        transactionType: reversed
          ? "FX_CONVERSION_REVERSED"
          : posted
            ? "FX_CONVERSION_POSTED"
            : `FX_CONVERSION_PENDING:${accountingErrorCode}`,
        customerPhoneMasked: `${transfer.targetAmount} ${transfer.targetCurrencyCode} · 1 ${transfer.sourceCurrencyCode} = ${transfer.exchangeRate} ${transfer.targetCurrencyCode}`,
        currencyCode: transfer.sourceCurrencyCode,
        principalAmount: transfer.sourceAmount,
        customerFeeAmount: "0",
        providerCommissionAmount: "0",
        externalReference: `${transfer.sourceCurrencyCode}→${transfer.targetCurrencyCode}`,
        status: reversed ? "REVERSED" : posted ? "SUCCESS" : "CONFIRMED",
        accountingStatus: posted ? "POSTED" : "PENDING",
        accountingBlockerCode: posted ? null : accountingErrorCode,
        occurredAt: transfer.occurredAt,
        revision: transfer.revision,
      };
    });

    mobileMoneyHistory = [...mobileMoneyRecent, ...fxHistory]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 100);
  }

  const scoped = moduleCode === "RETAIL_POS"
    ? { ...common, warehouses: dashboard.warehouses, catalogItems: dashboard.catalogItems, inventoryItems: dashboard.inventoryItems, metricsByCurrency: { sales: dashboard.metricsByCurrency.sales }, recent: { sales: dashboard.recent.sales } }
    : moduleCode === "MOBILE_MONEY_AGENCY"
      ? { ...common, providers: dashboard.providers.filter((item) => item.providerType === "MOBILE_MONEY"), metricsByCurrency: { mobileMoney: dashboard.metricsByCurrency.mobileMoney }, recent: { mobileMoney: mobileMoneyHistory } }
      : moduleCode === "TELCO_TOPUPS"
        ? { ...common, providers: dashboard.providers.filter((item) => item.providerType === "TELCO" || item.providerType === "BOTH"), telcoConfiguration: dashboard.telcoConfiguration, catalogItems: dashboard.catalogItems, metricsByCurrency: { telco: dashboard.metricsByCurrency.telco }, recent: { topups: topupRecent } }
        : { ...common, metricsByCurrency: {}, recent: { closes: dashboard.recent.closes } };

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: {
      organizationId,
      domain: "retail-dashboard",
      moduleCode,
      retailCache: dashboardRead.cacheSources,
    },
  });
  return NextResponse.json(scoped);
}
