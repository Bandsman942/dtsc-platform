import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { getCommercialRetailDashboard } from "@/lib/enterprise/retail/commercial-dashboard";
import { RETAIL_MODULE_CODES, type RetailModuleCode } from "@/lib/enterprise/retail/constants";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

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
  const dashboard = await getCommercialRetailDashboard(
    organizationId,
    auth.session.userId,
    from && !Number.isNaN(from.getTime()) ? from : undefined,
    to && !Number.isNaN(to.getTime()) ? to : undefined,
    moduleCode,
  );

  const common = {
    configuration: dashboard.configuration,
    accounts: dashboard.accounts,
    cashSession: dashboard.cashSession,
    readiness: dashboard.readiness,
    access: { canWrite: auth.access.canWrite, canManage: auth.access.canAdminister },
    range: dashboard.range,
  };
  const mobileMoneyRecent = dashboard.recent.mobileMoney.map((entry) => {
    const item = { ...entry };
    Reflect.deleteProperty(item, "customerPhone");
    return item;
  });
  const topupRecent = dashboard.recent.topups.map((entry) => {
    const item = { ...entry };
    Reflect.deleteProperty(item, "destinationPhone");
    return item;
  });

  let mobileMoneyHistory = mobileMoneyRecent;
  if (moduleCode === "MOBILE_MONEY_AGENCY") {
    const fxTransfers = await prisma.enterpriseMobileMoneyFxTransfer.findMany({
      where: {
        organizationId,
        occurredAt: { gte: new Date(dashboard.range.from), lte: new Date(dashboard.range.to) },
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        providerCode: true,
        sourceCurrencyCode: true,
        targetCurrencyCode: true,
        sourceAmount: true,
        targetAmount: true,
        exchangeRate: true,
        status: true,
        occurredAt: true,
        revision: true,
      },
    });
    const fxTransferIds = fxTransfers.map((transfer) => transfer.id);
    const postingBatches = fxTransferIds.length
      ? await prisma.enterprisePostingBatch.findMany({
          where: {
            organizationId,
            sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
            sourceEntityId: { in: fxTransferIds },
            postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED",
          },
          orderBy: [{ sourceEntityId: "asc" }, { postingVersion: "desc" }, { updatedAt: "desc" }],
          select: { sourceEntityId: true, status: true, errorCode: true, postingVersion: true },
        })
      : [];
    const postingByTransferId = new Map<string, (typeof postingBatches)[number]>();
    for (const batch of postingBatches) {
      if (!postingByTransferId.has(batch.sourceEntityId)) postingByTransferId.set(batch.sourceEntityId, batch);
    }

    const fxHistory = fxTransfers.map((transfer) => {
      const batch = postingByTransferId.get(transfer.id);
      const posted = batch?.status === "COMPLETED";
      const reversed = transfer.status === "REVERSED";
      const accountingErrorCode = batch?.errorCode || "POSTING_PENDING";
      return {
        id: transfer.id,
        number: transfer.number,
        providerCode: transfer.providerCode,
        transactionType: reversed
          ? "FX_CONVERSION_REVERSED"
          : posted
            ? "FX_CONVERSION_POSTED"
            : `FX_CONVERSION_PENDING:${accountingErrorCode}`,
        customerPhoneMasked: `${transfer.targetAmount.toFixed()} ${transfer.targetCurrencyCode} · 1 ${transfer.sourceCurrencyCode} = ${transfer.exchangeRate.toFixed()} ${transfer.targetCurrencyCode}`,
        currencyCode: transfer.sourceCurrencyCode,
        principalAmount: transfer.sourceAmount,
        customerFeeAmount: "0",
        providerCommissionAmount: "0",
        externalReference: `${transfer.sourceCurrencyCode}→${transfer.targetCurrencyCode}`,
        status: reversed ? "REVERSED" : posted ? "SUCCESS" : "PENDING",
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
        ? { ...common, providers: dashboard.providers.filter((item) => item.providerType === "TELCO"), catalogItems: dashboard.catalogItems, metricsByCurrency: { telco: dashboard.metricsByCurrency.telco }, recent: { topups: topupRecent } }
        : { ...common, metricsByCurrency: {}, recent: { closes: dashboard.recent.closes } };

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-dashboard", moduleCode } });
  return NextResponse.json(scoped);
}
