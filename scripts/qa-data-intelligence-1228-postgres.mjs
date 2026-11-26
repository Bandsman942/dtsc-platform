import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Run after migrate deploy on the isolated CI DB. Fixture writes are rolled back.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; PostgreSQL verification cannot be skipped");
const target = new URL(process.env.DATABASE_URL);
if (process.env.QA_1228_DATABASE_FIXTURE !== "true" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_test")) {
  throw new Error("An explicitly enabled local isolated *_test database is required for the rollback fixture");
}
const queryTimings=[];
const db = new PrismaClient({log:[{emit:"event",level:"query"}]});
db.$on("query",event=>{if(event.duration>=25)queryTimings.push({ms:event.duration,sql:event.query.slice(0,180)});});
const { planFefoLots } = workflowTestLoader({})("@/lib/enterprise/inventory/lot-allocation");
const { appendCatalogUnitConversion, projectCatalogConversion, resolveCatalogUnitConversion } =
  workflowTestLoader({})("@/lib/enterprise/master-data/unit-conversions");
const { getAccountingGeneralLedger } = workflowTestLoader({})("@/lib/enterprise/accounting/accounting-query-service");
const { assertTransferUnitsStillMatch, listTransferUnitConversions, resolveTransferUnitConversionTx } =
  workflowTestLoader({})("@/lib/enterprise/inventory/transfer-unit-conversion");
const handlerLoadStarted=performance.now();
const inventoryFixture={reader:null,organizationId:"",siteId:"",actor:""};
const {GET:inventoryGet}=workflowTestLoader({
        "@/lib/prisma":{prisma:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,"RepeatableRead");assert(inventoryFixture.reader,"Fixture transaction must be initialized");return fn(inventoryFixture.reader);}}},
        "@/lib/auth":{getSession:async()=>({userId:inventoryFixture.actor})},
        "@/lib/audit":{writeApiLog:async()=>{}},
        "@/lib/enterprise/common/access":{getEnterpriseCommonDomainAccess:async({organizationId})=>organizationId===inventoryFixture.organizationId?{canManage:false,canWrite:false,canAdminister:false}:null},
        "@/lib/enterprise/retail/site-access":{retailInventoryVisibleSites:async()=>({isolationEnabled:true,siteIds:[inventoryFixture.siteId]})},
        "@/lib/enterprise/retail/http":{},
      })("@/app/api/enterprise/[organizationId]/inventory/route");
console.log(`#1228 test handler loading outside PostgreSQL transaction: ${(performance.now()-handlerLoadStarted).toFixed(0)}ms`);
const treasuryFixture = { reader: null, organizationId: "", actor: "" };
const { GET: getTreasuryHistory } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    assert.ok(treasuryFixture.reader);
    return callback(treasuryFixture.reader);
  } } },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/http": {
    authorizeFinanceRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "FINANCE_TREASURY");
      assert.equal(action, "view");
      return organizationId === treasuryFixture.organizationId
        ? { ok: true, session: { userId: treasuryFixture.actor } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    financeListParams(req) {
      const params = new URL(req.url).searchParams;
      return { page: Number(params.get("page") || 1), pageSize: 25, search: params.get("search") };
    },
  },
})("@/app/api/enterprise/[organizationId]/treasury-history/route");
const { GET: getExpenses } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(treasuryFixture.reader);
  } } },
  "@/lib/auth": { getSession: async () => ({ userId: treasuryFixture.actor }) },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange: () => ({ ok: true, from: null, to: null }) },
  "@/lib/enterprise/core-v2/access": {},
  "@/lib/enterprise/module-access": { resolveEnterpriseModuleCapabilities: async () => ({ canRead: true, canManage: false, canApprove: false }) },
  "@/lib/enterprise-sector-templates": { requireEnterpriseMembership: async (_session, org) => org === treasuryFixture.organizationId ? {} : null },
  "@/lib/enterprise/finance/document-visibility": {},
  "@/lib/enterprise/finance/expense-service": {},
  "@/lib/rate-limit": {},
})("@/app/api/enterprise/[organizationId]/expenses/route");
let payrollWrite = true;
const { GET: getPayrollRuns } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(treasuryFixture.reader);
  } } },
  "@/lib/auth": { getSession: async () => ({ userId: treasuryFixture.actor }) },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange: () => ({ ok: true, from: null, to: null }) },
  "@/lib/enterprise/common/access": { getEnterpriseCommonDomainAccess: async ({ organizationId, moduleCode, action }) => {
    assert.equal(moduleCode, "PAYROLL_OPERATIONS");
    return organizationId === treasuryFixture.organizationId && (action === "read" || (action === "write" && payrollWrite))
      ? { canManage: false }
      : null;
  } },
  "@/lib/enterprise/hr-payroll/payroll": {},
  "@/lib/enterprise/hr-payroll/schemas": {},
  "@/lib/rate-limit": {},
})("@/app/api/enterprise/[organizationId]/payroll-runs/route");

class RollbackFixture extends Error {}

const cashFixture = { reader: null, organizationId: "", siteId: "", actor: "" };
const ledgerFixture = { reader: null, organizationId: "", actor: "" };
const { previewSyscohadaMerchandisePolicy } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(ledgerFixture.reader);
  } } },
})("@/lib/enterprise/accounting/chart-version-migration-service");
const { GET: getAccountingLedger } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(ledgerFixture.reader);
  } } },
  "@/lib/enterprise/accounting/http": {
    authorizeFinanceRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "FINANCE_ACCOUNTING");
      assert.equal(action, "view");
      return organizationId === ledgerFixture.organizationId
        ? { ok: true, session: { userId: ledgerFixture.actor } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    financeErrorResponse: error => { throw error; },
  },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/accounting-source-link-registry": {},
  "@/lib/enterprise/accounting/journal-entry-capabilities": {},
})("@/app/api/enterprise/[organizationId]/accounting-query/route");
const { GET: getCashSessions } = workflowTestLoader({
  "@/lib/prisma": { prisma: {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return callback(cashFixture.reader);
    },
    get organizationMember() { return cashFixture.reader.organizationMember; },
    get enterpriseApproval() { return cashFixture.reader.enterpriseApproval; },
  } },
  "@/lib/enterprise/accounting/http": {
    authorizeFinanceRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "FINANCE_CASH");
      assert.equal(action, "view");
      return organizationId === cashFixture.organizationId
        ? { ok: true, session: { userId: cashFixture.actor }, access: { capabilities: {} } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    financeListParams(req) {
      const params = new URL(req.url).searchParams;
      return { page: Number(params.get("page") || 1), pageSize: 25, search: params.get("search"), status: params.get("status") };
    },
    financeBusinessDateRange(req) {
      const params = new URL(req.url).searchParams;
      return { ok: true, from: params.get("dateFrom") ? new Date(params.get("dateFrom")) : null, to: null };
    },
  },
  "@/lib/enterprise/retail/site-access": { retailFinanceReadSiteScope: async (organizationId, actor, action, tx) => {
    assert.equal(action, "CLOSE_CASH");
    assert.equal(organizationId, cashFixture.organizationId);
    assert.equal(actor, cashFixture.actor);
    assert.equal(tx, cashFixture.reader);
    return [cashFixture.siteId];
  } },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/treasury-service": {},
  "@/lib/enterprise/accounting/treasury-schemas": {},
  "@/lib/enterprise/accounting/access": {},
  "@/lib/enterprise/approval-targets": {},
})("@/app/api/enterprise/[organizationId]/cash-sessions/route");

const { GET: getTelcoTopups } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(cashFixture.reader);
  } } },
  "@/lib/enterprise/retail/http": {
    authorizeRetailRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "TELCO_TOPUPS");
      assert.equal(action, "read");
      return organizationId === cashFixture.organizationId
        ? { ok: true, session: { userId: cashFixture.actor } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    retailListParams(req) {
      const params = new URL(req.url).searchParams;
      return { page: Number(params.get("page") || 1), pageSize: 25,
        search: params.get("search") || "", status: params.get("status"), providerCode: params.get("providerCode") };
    },
    retailErrorResponse: error => { throw error; },
  },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange(req) {
    const params = new URL(req.url).searchParams;
    return { ok: true, from: params.get("dateFrom") ? new Date(params.get("dateFrom")) : null, to: null };
  } },
  "@/lib/enterprise/retail/site-access": { retailFinanceReadSiteScope: async (organizationId, actor, action, tx) => {
    assert.equal(action, "VIEW_SALES");
    assert.equal(organizationId, cashFixture.organizationId);
    assert.equal(actor, cashFixture.actor);
    assert.equal(tx, cashFixture.reader);
    return [cashFixture.siteId];
  } },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/retail/commercial-guardrails": {},
  "@/lib/enterprise/retail/operator-orchestration": {},
  "@/lib/enterprise/retail/schemas": {},
  "@/lib/enterprise/retail/service": {},
})("@/app/api/enterprise/[organizationId]/retail/telco-topups/route");

const { GET: getMobileMoneyHistory } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(cashFixture.reader);
  } } },
  "@/lib/enterprise/retail/http": {
    authorizeRetailRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "MOBILE_MONEY_AGENCY");
      assert.equal(action, "read");
      return organizationId === cashFixture.organizationId
        ? { ok: true, session: { userId: cashFixture.actor } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    retailListParams(req) {
      const params = new URL(req.url).searchParams;
      return { page: Number(params.get("page") || 1), pageSize: 25,
        search: params.get("search") || "", status: params.get("status"), providerCode: params.get("providerCode") };
    },
    retailErrorResponse: error => { throw error; },
  },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange(req) {
    const params = new URL(req.url).searchParams;
    return { ok: true, from: params.get("dateFrom") ? new Date(params.get("dateFrom")) : null, to: null };
  } },
  "@/lib/enterprise/retail/site-access": { retailFinanceReadSiteScope: async (organizationId, actor, action, tx) => {
    assert.equal(action, "VIEW_SALES");
    assert.equal(organizationId, cashFixture.organizationId);
    assert.equal(actor, cashFixture.actor);
    assert.equal(tx, cashFixture.reader);
    return [cashFixture.siteId];
  } },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/retail/commercial-guardrails": {},
  "@/lib/enterprise/retail/operator-orchestration": {},
  "@/lib/enterprise/retail/schemas": {},
  "@/lib/enterprise/retail/service": {},
})("@/app/api/enterprise/[organizationId]/retail/mobile-money/route");

const { GET: getMobileMoneyFxHistory } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(cashFixture.reader);
  } } },
  "@/lib/enterprise/retail/http": {
    authorizeRetailRequest: async (_req, organizationId, feature, action) => {
      assert.equal(feature, "MOBILE_MONEY_AGENCY");
      assert.equal(action, "read");
      return organizationId === cashFixture.organizationId
        ? { ok: true, session: { userId: cashFixture.actor } }
        : { ok: false, response: new Response(null, { status: 403 }) };
    },
    retailListParams(req) {
      const params = new URL(req.url).searchParams;
      return { page: Number(params.get("page") || 1), pageSize: 25,
        search: params.get("search") || "", status: params.get("status"), providerCode: params.get("providerCode") };
    },
    retailErrorResponse: error => { throw error; },
  },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange(req) {
    const params = new URL(req.url).searchParams;
    return { ok: true, from: params.get("dateFrom") ? new Date(params.get("dateFrom")) : null, to: null };
  } },
  "@/lib/enterprise/retail/site-access": { retailFinanceReadSiteScope: async (organizationId, actor, action, tx) => {
    assert.equal(action, "VIEW_SALES");
    assert.equal(organizationId, cashFixture.organizationId);
    assert.equal(actor, cashFixture.actor);
    assert.equal(tx, cashFixture.reader);
    return [cashFixture.siteId];
  } },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/retail/commercial-guardrails": {},
  "@/lib/enterprise/retail/operator-orchestration": {},
  "@/lib/enterprise/retail/schemas": {},
  "@/lib/enterprise/retail/service": {},
  "@/lib/enterprise/retail/mobile-money-multicurrency-service": {},
  "@/lib/enterprise/retail/mobile-money-multicurrency-schemas": {},
})("@/app/api/enterprise/[organizationId]/retail/mobile-money/fx/route");

async function verifyCashAnalytics(tenant, otherTenant, actor) {
  await assert.rejects(db.$transaction(async tx => {
    const siteA = `${tenant}-cash-shop-a`;
    const siteB = `${tenant}-cash-shop-b`;
    const account = async (organizationId, code, currencyCode) => {
      const chart = await tx.enterpriseChartOfAccounts.create({ data: { organizationId, code, nameFr: code, nameEn: code, createdByUserId: actor } });
      const ledger = await tx.enterpriseLedgerAccount.create({ data: { organizationId, chartId: chart.id, code, nameFr: code, nameEn: code, accountType: "ASSET" } });
      return tx.enterpriseFinancialAccount.create({
        data: { organizationId, ledgerAccountId: ledger.id, code, name: code, accountType: "CASH", currencyCode },
      });
    };
    const cdf = await account(tenant, "QA-CDF", "CDF");
    const usd = await account(tenant, "QA-USD", "USD");
    const foreign = await account(otherTenant, "QA-CDF", "CDF");
    const amount = "99999999999999.999999";
    const session = { organizationId: tenant, financialAccountId: cdf.id, cashierUserId: actor, siteId: siteA,
      status: "OPEN", openedAt: new Date("2026-11-05"), openingAmount: amount };
    const bulk = Array.from({ length: 56 }, (_, index) => ({
      ...session, id: `${tenant}-till-${String(index).padStart(2, "0")}`, number: `CASH-TARGET-${index}`,
    }));
    const closed = { status: "CLOSED", expectedClosingAmount: "10", countedClosingAmount: "9.5", discrepancyAmount: "-0.5" };
    const extra = [
      { ...session, ...closed, id: `${tenant}-shortage`, number: "CASH-SHORTAGE" },
      { ...session, ...closed, id: `${tenant}-surplus`, financialAccountId: usd.id, number: "CASH-SURPLUS", countedClosingAmount: "10.6", discrepancyAmount: "0.6" },
      { ...session, ...closed, id: `${tenant}-surplus-cdf`, number: "CASH-SURPLUS-CDF", countedClosingAmount: "10.2", discrepancyAmount: "0.2" },
      { ...session, ...closed, status: "PENDING_VALIDATION", id: `${tenant}-pending`, number: "CASH-PENDING" },
      { ...session, id: `${tenant}-old`, number: "CASH-TARGET-OLD", openedAt: new Date("2026-10-31") },
      { ...session, id: `${tenant}-forbidden`, number: "CASH-TARGET-FORBIDDEN", siteId: siteB },
      { ...session, id: `${tenant}-foreign`, number: "CASH-TARGET-FOREIGN", organizationId: otherTenant, financialAccountId: foreign.id },
      { ...session, id: `${tenant}-invalid`, number: "CASH-INVALID-EVIDENCE" },
    ];
    await tx.enterpriseCashSession.createMany({ data: [...bulk, ...extra] });
    const movement = { organizationId: tenant, direction: "INBOUND", currencyCode: "CDF", movementType: "PAYMENT", amount, createdByUserId: actor,
      createdAt: new Date("2026-11-09") };
    await tx.enterpriseCashMovement.createMany({ data: [
      ...bulk.map(row => ({ ...movement, cashSessionId: row.id })),
      { ...movement, cashSessionId: bulk[0].id, direction: "OUTBOUND", amount: "0.000001" },
      { ...movement, cashSessionId: `${tenant}-surplus`, currencyCode: "USD", amount: "4.65" },
      { ...movement, cashSessionId: `${tenant}-forbidden`, amount: "4545" },
      { ...movement, cashSessionId: `${tenant}-foreign`, organizationId: otherTenant, amount: "4545" },
      { ...movement, cashSessionId: `${tenant}-invalid`, currencyCode: "USD", amount: "0.5" },
    ] });
    Object.assign(cashFixture, { reader: tx, organizationId: tenant, siteId: siteA, actor });
    const read = (query, organizationId = tenant) => getCashSessions(new Request(`http://localhost/api/enterprise/${organizationId}/cash-sessions?${query}`), {
      params: Promise.resolve({ organizationId }),
    });
    const scope = "search=CASH-TARGET&status=OPEN&dateFrom=2026-11-01";
    const response = await read(scope);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const first = await response.json();
    const third = await (await read(scope + "&page=3")).json();
    const absent = await (await read(scope + "&page=4")).json();
    const total = (body, field, metric, currencyCode) => body[field].find(row => row.metric === metric && row.currencyCode === currencyCode)?.amount;
    assert.deepEqual(first.pagination, { page: 1, pageSize: 25, total: 56, pageCount: 3 });
    assert.deepEqual(first.metrics, { total: 56, open: 56, pending: 0,
      general: { total: 62, open: 58, pending: 1 }, page: { total: 25, open: 25, pending: 0 } });
    assert.equal(third.metrics.page.open, 6);
    assert.deepEqual(absent.pageTotals, []);
    assert.deepEqual(third.filteredTotals, first.filteredTotals);
    assert.deepEqual(absent.generalTotals, first.generalTotals);
    assert.equal(total(first, "filteredTotals", "inbound", "CDF"), "5599999999999999.999944");
    assert.equal(total(first, "filteredTotals", "outbound", "CDF"), "0.000001");
    assert.equal(total(third, "pageTotals", "inbound", "CDF"), "599999999999999.999994");
    assert.equal(total(first, "generalTotals", "inbound", "CDF"), "5599999999999999.999944");
    assert.equal(total(first, "generalTotals", "inbound", "USD"), "5.15");
    assert.equal(total(first, "generalTotals", "cashClosingShortage", "CDF"), "0.5", "Unvalidated counts must not inflate closing shortages");
    assert.equal(total(first, "generalTotals", "cashClosingSurplus", "CDF"), "0.2", "Surpluses must remain distinct from shortages");
    assert.equal(total(first, "generalTotals", "cashClosingSurplus", "USD"), "0.6");
    assert.equal(third.items.find(row => row.id === bulk[0].id).theoreticalClosingAmount, "199999999999999.999997");
    const invalid = await (await read(`recordId=${tenant}-invalid`)).json();
    assert.equal(invalid.items[0].expectedCurrentAmount, null);
    assert.equal(invalid.items[0].inboundAmount, null);
    assert.equal(invalid.filteredTotals, undefined);
    const forbidden = await (await read(`recordId=${tenant}-forbidden`)).json();
    assert.deepEqual(forbidden.items, []);
    assert.equal(forbidden.generalTotals, undefined);
    assert.equal((await read(scope, otherTenant)).status, 403);
    const otherStore = await account(tenant, "QA-OTHER-SHOP", "CDF");
    for (const registered of [cdf, usd, otherStore]) {
      await tx.enterpriseFinancialAccount.update({ where: { id: registered.id }, data: { siteId: registered.id === otherStore.id ? siteB : siteA } });
    }
    const telco = {
      organizationId: tenant, providerCode: "QA-PROVIDER", destinationPhone: "243811234567", offerLabel: "QA Recharge",
      currencyCode: "CDF", saleAmount: amount, operatorCost: "99999999999999.999998", marginAmount: "0.000001",
      tenderFinancialAccountId: cdf.id, operatorFloatAccountId: cdf.id, agentUserId: actor, status: "SUCCESS",
      occurredAt: new Date("2026-11-05"),
    };
    const records = [
      ...Array.from({ length: 56 }, (_, index) => ({ ...telco, number: `RECHARGE-TARGET-${index}` })),
      { ...telco, number: "RECHARGE-TARGET-USD", currencyCode: "USD", tenderFinancialAccountId: usd.id },
      { ...telco, number: "RECHARGE-TARGET-REVERSED", status: "REVERSED", saleAmount: "1", operatorCost: "1", marginAmount: "0" },
      { ...telco, number: "RECHARGE-TARGET-OTHER-SHOP", tenderFinancialAccountId: otherStore.id },
      { ...telco, number: "RECHARGE-TARGET-OTHER-TENANT", organizationId: otherTenant, tenderFinancialAccountId: foreign.id },
      { ...telco, number: "RECHARGE-TARGET-AUGUST", occurredAt: new Date("2026-08-01"), saleAmount: "1", operatorCost: "1", marginAmount: "0" },
      { ...telco, number: "RECHARGE-EXCLUDED", saleAmount: "1", operatorCost: "1", marginAmount: "0" },
    ];
    await tx.enterpriseTelcoTopup.createMany({ data: records.map(row => ({ ...row, idempotencyKey: row.number })) });
    const telcoQuery = "search=RECHARGE-TARGET&status=SUCCESS&dateFrom=2026-11-01&providerCode=QA-PROVIDER";
    const topups = (query, organizationId = tenant) => getTelcoTopups(
      new Request(`http://localhost/api/enterprise/${organizationId}/retail/telco-topups?${query}`),
      { params: Promise.resolve({ organizationId }) },
    );
    const telcoResponse = await topups(telcoQuery);
    assert.equal(telcoResponse.status, 200);
    assert.equal(telcoResponse.headers.get("cache-control"), "private, no-store");
    const firstTelco = await telcoResponse.json();
    const lastTelco = await (await topups(telcoQuery + "&page=3")).json();
    assert.deepEqual(firstTelco.pagination, { page: 1, pageSize: 25, total: 57, pageCount: 3 });
    assert.equal(firstTelco.items[0].destinationPhone, "2438••••567");
    assert.equal(firstTelco.items[0].saleAmount, amount);
    assert.equal(lastTelco.items.length, 7);
    assert.deepEqual(lastTelco.filteredTotals, firstTelco.filteredTotals);
    assert.deepEqual(lastTelco.generalTotals, firstTelco.generalTotals);
    assert.equal(total(firstTelco, "filteredTotals", "telcoSale", "CDF"), "5599999999999999.999944");
    assert.equal(total(firstTelco, "filteredTotals", "telcoCost", "CDF"), "5599999999999999.999888");
    assert.equal(total(firstTelco, "filteredTotals", "telcoMargin", "CDF"), "0.000056");
    assert.equal(total(firstTelco, "filteredTotals", "telcoSale", "USD"), amount);
    assert.equal(firstTelco.generalTotals.find(row => row.metric === "telcoSale" && row.status === "REVERSED")?.amount, "1");
    assert.equal(firstTelco.generalTotals.find(row => row.metric === "telcoSale" && row.status === "SUCCESS" && row.currencyCode === "CDF")?.amount, "5600000000000001.999944");
    assert.equal((await topups(telcoQuery, otherTenant)).status, 403);
    // Deposit/withdrawal history uses the cash shop, not a shared operator float.
    const mobile = {
      organizationId: tenant, providerCode: "QA-PROVIDER", transactionType: "DEPOSIT", customerPhone: "243811234567",
      currencyCode: "CDF", principalAmount: amount, customerFeeAmount: "0.000001", providerCommissionAmount: "0.000002",
      cashEffectAmount: amount, floatEffectAmount: "-99999999999999.999999", cashAccountId: cdf.id,
      floatAccountId: otherStore.id, agentUserId: actor, status: "CONFIRMED", occurredAt: new Date("2026-11-05"),
    };
    const mobileRecords = [
      ...Array.from({ length: 56 }, (_, index) => ({ ...mobile, number: "MM-TARGET-" + index })),
      { ...mobile, number: "MM-TARGET-USD", currencyCode: "USD", cashAccountId: usd.id },
      { ...mobile, number: "MM-TARGET-WITHDRAWAL", transactionType: "WITHDRAWAL", principalAmount: "2", cashEffectAmount: "-2", floatEffectAmount: "2" },
      { ...mobile, number: "MM-TARGET-REVERSED", status: "REVERSED", principalAmount: "1" },
      { ...mobile, number: "MM-TARGET-OTHER-SHOP", cashAccountId: otherStore.id, floatAccountId: cdf.id },
      { ...mobile, number: "MM-TARGET-OTHER-TENANT", organizationId: otherTenant, cashAccountId: foreign.id, floatAccountId: foreign.id },
      { ...mobile, number: "MM-TARGET-AUGUST", occurredAt: new Date("2026-08-01"), principalAmount: "1" },
    ];
    await tx.enterpriseMobileMoneyTransaction.createMany({ data: mobileRecords.map(row => ({ ...row, idempotencyKey: row.number })) });
    const mobileQuery = "search=MM-TARGET&status=CONFIRMED&dateFrom=2026-11-01&providerCode=QA-PROVIDER";
    const history = (query, organizationId = tenant) => getMobileMoneyHistory(
      new Request("http://localhost/api/enterprise/" + organizationId + "/retail/mobile-money?" + query),
      { params: Promise.resolve({ organizationId }) },
    );
    const mobileResponse = await history(mobileQuery);
    assert.equal(mobileResponse.status, 200);
    assert.equal(mobileResponse.headers.get("cache-control"), "private, no-store");
    const firstMobile = await mobileResponse.json();
    const lastMobile = await (await history(mobileQuery + "&page=3")).json();
    const emptyMobile = await (await history(mobileQuery + "&page=4")).json();
    assert.deepEqual(firstMobile.pagination, { page: 1, pageSize: 25, total: 58, pageCount: 3 });
    assert.equal(firstMobile.items[0].customerPhoneMasked, "2438••••567");
    assert.equal(firstMobile.items[0].customerPhone, "2438••••567");
    assert.equal(lastMobile.items.length, 8);
    assert.deepEqual(emptyMobile.operationTotals.page, []);
    assert.deepEqual(lastMobile.operationTotals.filtered, firstMobile.operationTotals.filtered);
    assert.deepEqual(emptyMobile.operationTotals.general, firstMobile.operationTotals.general);
    const deposits = firstMobile.operationTotals.filtered.find(row => row.currencyCode === "CDF" && row.status === "CONFIRMED" && row.transactionType === "DEPOSIT");
    assert.equal(deposits.count, 56);
    assert.equal(deposits.principalAmount, "5599999999999999.999944");
    assert.equal(deposits.customerFeeAmount, "0.000056");
    assert.equal(deposits.providerCommissionAmount, "0.000112");
    assert.equal(deposits.floatEffectAmount, "-5599999999999999.999944");
    assert.equal(firstMobile.operationTotals.filtered.find(row => row.transactionType === "WITHDRAWAL").cashEffectAmount, "-2");
    assert.equal(firstMobile.operationTotals.filtered.find(row => row.currencyCode === "USD").principalAmount, amount);
    assert.equal(firstMobile.operationTotals.general.find(row => row.status === "REVERSED").principalAmount, "1");
    assert.deepEqual(lastMobile.filteredTotals, firstMobile.filteredTotals);
    assert.deepEqual(emptyMobile.generalTotals, firstMobile.generalTotals);
    assert.deepEqual(emptyMobile.pageTotals, []);
    assert.equal(firstMobile.filteredTotals.find(row => row.operationType === "DEPOSIT" && row.metric === "mobileMoneyPrincipal" && row.currencyCode === "CDF").amount, deposits.principalAmount);
    assert.equal(firstMobile.filteredTotals.find(row => row.operationType === "WITHDRAWAL" && row.metric === "mobileMoneyCashEffect").amount, "-2");
    const withdrawals = await (await history(mobileQuery + "&transactionType=WITHDRAWAL")).json();
    assert.equal(withdrawals.pagination.total, 1);
    assert.equal(withdrawals.filteredTotals.length, 5);
    assert.ok(withdrawals.filteredTotals.every(row => row.operationType === "WITHDRAWAL"));
    assert.deepEqual(withdrawals.generalTotals, firstMobile.generalTotals);
    assert.equal((await history(mobileQuery + "&transactionType=INVALID")).status, 400);
    assert.equal((await history(mobileQuery, otherTenant)).status, 403);
    const wallet = async (code, currencyCode, siteId) => {
      const row = await account(tenant, code, currencyCode);
      return tx.enterpriseFinancialAccount.update({ where: { id: row.id }, data: { accountType: "MOBILE_MONEY", siteId } });
    };
    const fxCdf = await wallet("QA-FX-CDF", "CDF", siteA);
    const fxUsd = await wallet("QA-FX-USD", "USD", siteA);
    const fxOther = await wallet("QA-FX-OTHER", "USD", siteB);
    const fxShared = await wallet("QA-FX-SHARED", "USD", null);
    const fxBase = {
      organizationId: tenant, providerId: "QA-PROVIDER", providerCode: "QA-PROVIDER",
      sourceProviderAccountId: "QA-SOURCE", targetProviderAccountId: "QA-TARGET",
      sourceFloatAccountId: fxCdf.id, targetFloatAccountId: fxUsd.id,
      sourceCurrencyCode: "CDF", targetCurrencyCode: "USD", sourceAmount: amount, targetAmount: "0.000001",
      exchangeRate: "0.000000000001", exchangeRateDate: new Date("2026-11-05"), exchangeRateSource: "QA",
      occurredAt: new Date("2026-11-05"), status: "CONFIRMED", agentUserId: actor,
    };
    const fxRecords = [
      ...Array.from({ length: 56 }, (_, index) => ({ ...fxBase, id: tenant + "-fx-" + index, number: "FX-TARGET-" + index })),
      { ...fxBase, number: "FX-TARGET-REVERSED", status: "REVERSED", sourceAmount: "1", targetAmount: "1" },
      { ...fxBase, number: "FX-TARGET-OTHER-SHOP", targetFloatAccountId: fxOther.id },
      { ...fxBase, number: "FX-TARGET-OTHER-SOURCE", sourceFloatAccountId: fxOther.id },
      { ...fxBase, number: "FX-TARGET-SHARED", targetFloatAccountId: fxShared.id },
      { ...fxBase, number: "FX-TARGET-FOREIGN", organizationId: otherTenant },
      { ...fxBase, number: "FX-TARGET-AUGUST", occurredAt: new Date("2026-08-01"), sourceAmount: "1" },
      { ...fxBase, number: "FX-TARGET-REVERSE-PAIR", sourceFloatAccountId: fxUsd.id, targetFloatAccountId: fxCdf.id,
        sourceCurrencyCode: "USD", targetCurrencyCode: "CDF", sourceAmount: "2", targetAmount: "4000", exchangeRate: "2000" },
    ];
    await tx.enterpriseMobileMoneyFxTransfer.createMany({ data: fxRecords.map(row => ({ ...row, idempotencyKey: row.number })) });
    await tx.enterprisePostingBatch.createMany({ data: [
      { organizationId: tenant, reference: "QA-FX-1", postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED", sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
        sourceEntityId: tenant + "-fx-0", postingVersion: 1, idempotencyKey: "QA-FX-POST-1", status: "FAILED", errorCode: "POSTING_FAILED", createdByUserId: actor },
      { organizationId: tenant, reference: "QA-FX-2", postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED", sourceEntityType: "EnterpriseMobileMoneyFxTransfer",
        sourceEntityId: tenant + "-fx-0", postingVersion: 2, idempotencyKey: "QA-FX-POST-2", status: "COMPLETED", createdByUserId: actor },
    ] });
    const fxQuery = "view=history&search=FX-TARGET&status=CONFIRMED&dateFrom=2026-11-01";
    const fxRead = (query, organizationId = tenant) => getMobileMoneyFxHistory(
      new Request("http://localhost/api/enterprise/" + organizationId + "/retail/mobile-money/fx?" + query),
      { params: Promise.resolve({ organizationId }) },
    );
    const fxResponse = await fxRead(fxQuery);
    assert.equal(fxResponse.status, 200);
    assert.equal(fxResponse.headers.get("cache-control"), "private, no-store");
    const firstFx = await fxResponse.json();
    const secondFx = await (await fxRead(fxQuery + "&page=2")).json();
    const thirdFx = await (await fxRead(fxQuery + "&page=3")).json();
    const emptyFx = await (await fxRead(fxQuery + "&page=4")).json();
    assert.deepEqual(firstFx.pagination, { page: 1, pageSize: 25, total: 57, pageCount: 3 });
    assert.equal(thirdFx.items.length, 7);
    assert.deepEqual(emptyFx.fxTotals.page, []);
    assert.deepEqual(thirdFx.fxTotals.filtered, firstFx.fxTotals.filtered);
    assert.deepEqual(emptyFx.fxTotals.general, firstFx.fxTotals.general);
    assert.deepEqual(emptyFx.pageTotals, []);
    assert.deepEqual(thirdFx.filteredTotals, firstFx.filteredTotals);
    assert.deepEqual(emptyFx.generalTotals, firstFx.generalTotals);
    assert.equal(firstFx.filteredTotals.find(row => row.metric === "mobileMoneyFxSource" && row.currencyPair === "CDF → USD").amount, "5599999999999999.999944");
    assert.equal(firstFx.filteredTotals.find(row => row.metric === "mobileMoneyFxTarget" && row.currencyPair === "USD → CDF").amount, "4000");
    assert.equal(firstFx.filteredTotals.length, 4);
    const directPair = firstFx.fxTotals.filtered.find(row => row.sourceCurrencyCode === "CDF");
    assert.equal(directPair.sourceAmount, "5599999999999999.999944");
    assert.equal(directPair.targetAmount, "0.000056");
    assert.equal(firstFx.fxTotals.filtered.find(row => row.sourceCurrencyCode === "USD").targetAmount, "4000");
    assert.equal(firstFx.fxTotals.general.find(row => row.status === "REVERSED").sourceAmount, "1");
    const fxItems = [...firstFx.items, ...secondFx.items, ...thirdFx.items];
    assert.equal(fxItems.find(row => row.id === tenant + "-fx-0").accountingStatus, "POSTED");
    assert.equal(fxItems.find(row => row.id === tenant + "-fx-1").accountingStatus, "PENDING");
    assert.equal(fxItems.find(row => row.id === tenant + "-fx-1").exchangeRate, "0.000000000001");
    assert.equal((await fxRead(fxQuery, otherTenant)).status, 403);
    assert.equal((await fxRead("view=history&status=INVALID")).status, 400);
    throw new RollbackFixture();
  }, { isolationLevel: "RepeatableRead", timeout: 10000 }), RollbackFixture);
  assert.equal(await db.enterpriseCashSession.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0);
  console.log("PASS #1228 PostgreSQL cash sessions: exact 56-session totals, page/authorized scopes, signed closing variances and store isolation");
  assert.equal(await db.enterpriseMobileMoneyTransaction.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0);
  assert.equal(await db.enterpriseMobileMoneyFxTransfer.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0);
  console.log("PASS #1228 PostgreSQL FX history: 57 filtered transfers, exact directional currency pairs, both wallet scopes, posting version and rollback");
  console.log("PASS #1228 PostgreSQL Mobile Money history: exact multi-page totals, operation types, status, currency, cash shop and masked phone");
  console.log("PASS #1228 PostgreSQL Telco history: exact 57-record sales, costs and margins, mixed currencies and statuses, phone masking and store isolation");
}

async function verifyLedgerSearch(tenant, otherTenant, actor) {
  await assert.rejects(db.$transaction(async tx => {
    const accountingDate = new Date("2026-11-10");
    async function createAccountingContext(organizationId, catalogName) {
      const year = await tx.enterpriseFiscalYear.create({ data: {
        organizationId, code: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), createdByUserId: actor,
      } });
      const period = await tx.enterpriseFiscalPeriod.create({ data: {
        organizationId, fiscalYearId: year.id, code: "2026-11", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), createdByUserId: actor,
      } });
      const chart = await tx.enterpriseChartOfAccounts.create({ data: {
        organizationId, code: "QA-LEDGER", nameFr: "Plan", nameEn: "Chart", createdByUserId: actor,
        templateCode: "OHADA_SYSCOHADA@0.1.0",
      } });
      const ledger = await tx.enterpriseLedgerAccount.create({ data: {
        organizationId, chartId: chart.id, code: "QA-LEDGER-35", nameFr: "Stock test", nameEn: "Stock test", accountType: "ASSET",
      } });
      const journal = await tx.enterpriseJournal.create({ data: {
        organizationId, code: "QA-LEDGER", nameFr: "Journal", nameEn: "Journal", journalType: "GENERAL", createdByUserId: actor,
      } });
      const unit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId, code: "GL-QA", name: "Test unit", decimalScale: 6 } });
      const item = await tx.enterpriseCatalogItem.create({ data: {
        organizationId, code: "SEARCH_1228", name: catalogName, normalizedName: catalogName.toLowerCase(), itemType: "PRODUCT",
        unitOfMeasureId: unit.id, createdByUserId: actor,
      } });
      const inventory = await tx.enterpriseInventoryItem.create({ data: { organizationId, catalogItemId: item.id, createdByUserId: actor } });
      return { organizationId, chartId: chart.id, fiscalPeriodId: period.id, journalId: journal.id, ledgerAccountId: ledger.id, item, inventoryItemId: inventory.id };
    }
    const currentName = "Produit actuel 75%_test";
    const local = await createAccountingContext(tenant, "Ancienne désignation");
    const foreign = await createAccountingContext(otherTenant, "FOREIGN DESIGNATION");
    const amount = "99999999999999.999999";
    const exact = context => `ISSUE ${context.inventoryItemId}`;
    async function journalLine(context, index, { status = "POSTED", currency = "CDF", site = "warehouse-a", narrative = exact(context), inventoryItemId = context.inventoryItemId, debit = amount } = {}) {
      const number = `GL-${String(index).padStart(3, "0")}`;
      const entry = await tx.enterpriseJournalEntry.create({ data: {
        organizationId: context.organizationId, fiscalPeriodId: context.fiscalPeriodId, journalId: context.journalId,
        number, reference: `QA-${number}`, description: "Movement", accountingDate, sourceModule: "INVENTORY", sourceEntityType: "StockMovement",
        functionalCurrencyCode: currency, preparedByUserId: actor, status, totalDebit: debit, totalCredit: debit,
        ...(status === "DRAFT" ? {} : { postedAt: accountingDate, postedByUserId: actor }),
      } });
      await tx.enterpriseJournalLine.createMany({ data: [
        { organizationId: entry.organizationId, journalEntryId: entry.id, ledgerAccountId: context.ledgerAccountId,
          siteId: site, inventoryItemId, description: narrative, debit, functionalAmount: debit },
        { organizationId: entry.organizationId, journalEntryId: entry.id, ledgerAccountId: context.ledgerAccountId,
          siteId: site, description: "Counterpart", credit: debit, functionalAmount: debit },
      ] });
    }
    for (let index = 1; index <= 26; index++) await journalLine(local, index);
    await journalLine(local, 27, { status: "REVERSED", debit: "0.000001" });
    await journalLine(local, 28, { currency: "USD", debit: "3.65" });
    await journalLine(local, 29, { site: "warehouse-b" });
    await journalLine(local, 30, { status: "DRAFT" });
    await journalLine(local, 31, { narrative: "ISSUE Ancienne désignation" });
    await journalLine(local, 32, { narrative: `ISSUE ${local.inventoryItemId} commentaire libre` });
    await journalLine(local, 33, { narrative: exact(foreign), inventoryItemId: foreign.inventoryItemId });
    await journalLine(foreign, 1);
    await tx.enterpriseCatalogItem.update({ where: { id: local.item.id }, data: { name: currentName, normalizedName: currentName.toLowerCase() } });

    const search = { search: "75%_test", siteId: "warehouse-a", sourceModule: "INVENTORY", sourceEntityType: "StockMovement",
      fiscalPeriodId: local.fiscalPeriodId, journalId: local.journalId, ledgerAccountId: local.ledgerAccountId,
      dateFrom: new Date("2026-11-01"), dateTo: new Date("2026-11-30"), pageSize: 25 };
    const ledger = filters => getAccountingGeneralLedger(tx, tenant, filters);
    Object.assign(ledgerFixture, { reader: tx, organizationId: tenant, actor });
    const requestQuery = new URLSearchParams({ ...search, dateFrom: search.dateFrom.toISOString(), dateTo: search.dateTo.toISOString() });
    const request = (organizationId = tenant) => getAccountingLedger(
      new Request(`http://localhost/api/enterprise/${organizationId}/accounting-query?${requestQuery}`),
      { params: Promise.resolve({ organizationId }) },
    );
    const firstResponse = await request();
    assert.equal(firstResponse.status, 200);
    assert.equal((await request(otherTenant)).status, 403);
    const first = await firstResponse.json();
    const second = await ledger({ ...search, page: 2 });
    const empty = await ledger({ ...search, page: 3 });
    assert.deepEqual(first.pagination, { page: 1, pageSize: 25, total: 28, pageCount: 2 });
    assert.equal(first.items.length, 25);
    assert.equal(first.items[0].journalEntry.number, "GL-028");
    assert.deepEqual(second.items.map(row => row.journalEntry.number), ["GL-003", "GL-002", "GL-001"]);
    assert.deepEqual(empty.items, []);
    assert.deepEqual(first.filteredTotals, [
      { currencyCode: "CDF", metric: "debit", amount: "2599999999999999.999975" },
      { currencyCode: "CDF", metric: "credit", amount: "0" },
      { currencyCode: "USD", metric: "debit", amount: "3.65" },
      { currencyCode: "USD", metric: "credit", amount: "0" },
    ]);
    assert.deepEqual(second.filteredTotals, first.filteredTotals);
    assert.deepEqual(empty.filteredTotals, first.filteredTotals);
    assert.equal(first.items[0].description, exact(local));
    assert.equal(first.items[0].displayDescription, `ISSUE current catalog ${currentName} · SEARCH_1228`);
    assert.equal((await ledger({ ...search, search: "search_1228", currencyCode: "USD" })).pagination.total, 1);
    assert.equal((await ledger({ ...search, status: "REVERSED" })).pagination.total, 1);
    assert.equal((await ledger({ ...search, status: "DRAFT" })).pagination.total, 0);
    assert.equal((await ledger({ ...search, search: "75%_nom-absent" })).pagination.total, 0);
    assert.equal((await ledger({ ...search, search: "search%1228" })).pagination.total, 0);
    assert.equal((await ledger({ search: "foreign designation" })).pagination.total, 0);
    const missing = await ledger({ search: "QA-GL-033" });
    assert.equal(missing.items.find(row => row.inventoryItemId)?.displayDescription, "ISSUE catalog unavailable");
    const snapshot = await ledger({ search: "ancienne désignation" });
    assert.equal(snapshot.pagination.total, 1);
    assert.equal(snapshot.items[0].displayDescription, "ISSUE Ancienne désignation");
    assert.equal((await ledger({ search: "commentaire libre" })).items[0].displayDescription, `ISSUE ${local.inventoryItemId} commentaire libre`);
    for (const context of [local, foreign]) await tx.enterpriseLedgerAccount.create({ data: {
      organizationId: context.organizationId, chartId: context.chartId, code: "6031",
      nameFr: context === local ? "Compte de l’entreprise" : "Compte étranger", nameEn: "Test account", accountType: "EXPENSE",
    } });
    const comparison = await previewSyscohadaMerchandisePolicy(tenant, local.chartId);
    assert.deepEqual(comparison.diff.accounts.added.map(row => row.code), ["6031"]);
    assert.equal(comparison.journalHistoryCount, 32);
    assert.deepEqual(comparison.accountConflicts, [{ code: "6031", nameFr: "Compte de l’entreprise", nameEn: "Test account" }]);
    assert.equal(comparison.canApplyAutomatically, false);
    await assert.rejects(previewSyscohadaMerchandisePolicy(tenant, foreign.chartId), { code: "CHART_OF_ACCOUNTS_NOT_FOUND" });
    assert.equal((await tx.enterpriseChartOfAccounts.findUniqueOrThrow({ where: { id: local.chartId } })).templateCode, "OHADA_SYSCOHADA@0.1.0");
    throw new RollbackFixture();
  }, { isolationLevel: "RepeatableRead", timeout: 10000 }), RollbackFixture);
  console.log("PASS #1228 PostgreSQL general ledger: current catalog search, immutable descriptions, exact multi-currency totals and tenant isolation");
  console.log("PASS #1228 PostgreSQL SYSCOHADA preview: account conflict, posted and reversed history, tenant isolation and no chart mutation");
}

async function verifyConversionHistory(tenant, otherTenant, actor) {
  await assert.rejects(db.$transaction(async tx => {
    const createUnit = (organizationId, code, decimalScale) => tx.enterpriseUnitOfMeasure.create({
      data: { organizationId, code, name: code, decimalScale },
    });
    const carton = await createUnit(tenant, "CARTON", 3);
    const stock = await createUnit(tenant, "STOCK", 6);
    const foreignUnit = await createUnit(otherTenant, "CARTON", 3);
    const createItem = (organizationId, unitOfMeasureId) => tx.enterpriseCatalogItem.create({
      data: { organizationId, unitOfMeasureId, code: "CONVERSION-QA", name: "Conversion QA", normalizedName: "conversion qa", itemType: "PRODUCT", trackInventory: true, createdByUserId: actor },
    });
    const item = await createItem(tenant, stock.id);
    const foreignItem = await createItem(otherTenant, foreignUnit.id);
    const context = { organizationId: tenant, catalogItemId: item.id, sourceUnitId: carton.id, actorUserId: actor };
    const first = await appendCatalogUnitConversion(tx, { ...context, factor: "12.123", expectedVersion: 0 });
    assert.equal(first.factor.toFixed(), "12.123");
    const resolve = () => resolveCatalogUnitConversion(tx, { ...context, quantity: "1.001" });
    assert.equal((await resolve()).stockQuantity, "12.135123");
    const inventory = await tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: item.id, createdByUserId: actor } });
    const site = await tx.enterpriseSite.create({ data: { organizationId: tenant, code: "TRANSFERS", name: "Test", siteType: "STORE", createdByUserId: actor } });
    const warehouses = await Promise.all(["SOURCE", "TARGET"].map(code => tx.enterpriseWarehouse.create({
      data: { organizationId: tenant, siteId: site.id, code, name: code, createdByUserId: actor },
    })));
    await tx.enterpriseInventoryBalance.create({ data: { organizationId: tenant, inventoryItemId: inventory.id,
      warehouseId: warehouses[0].id, quantityOnHand: "100" } });
    const transferConversion = await resolveTransferUnitConversionTx(tx, { ...context, quantity: "1.001", expectedVersion: first.version });
    const transfer = await tx.enterpriseStockTransfer.create({ data: {
      organizationId: tenant, reference: "UNIT-CONVERSION", sourceWarehouseId: warehouses[0].id,
      destinationWarehouseId: warehouses[1].id, requestedByUserId: actor,
      lines: { create: { inventoryItemId: inventory.id, quantity: transferConversion.stockQuantity, unitConversionJson: transferConversion } },
    }, select: { lines: true } });
    assert.deepEqual(transfer.lines[0].unitConversionJson, transferConversion);
    assert.equal((await listTransferUnitConversions(tx, tenant, inventory.id, warehouses[0].id))[0].version, 1);
    assert.deepEqual(await listTransferUnitConversions(tx, otherTenant, inventory.id, warehouses[0].id), []);
    assert.deepEqual(await listTransferUnitConversions(tx, tenant, inventory.id, warehouses[1].id), []);
    await assert.rejects(appendCatalogUnitConversion(tx, { ...context, factor: "24", expectedVersion: 0 }),
      { code: "CATALOG_CONVERSION_REVISION_CONFLICT" });

    await tx.enterpriseUnitOfMeasure.update({ where: { id: carton.id }, data: { code: "PACK" } });
    await assert.rejects(resolve(), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
    const second = await appendCatalogUnitConversion(tx, { ...context, factor: "24", expectedVersion: 1 });
    assert.equal(second.version, 2);
    assert.equal((await resolve()).sourceCode, "PACK");
    assert.equal((await resolve()).stockQuantity, "24.024");
    assert.equal((await listTransferUnitConversions(tx, tenant, inventory.id, warehouses[0].id))[0].version, 2);
    await assert.rejects(resolveTransferUnitConversionTx(tx, { ...context, quantity: "1.001", expectedVersion: first.version }), { code: "CATALOG_CONVERSION_REVISION_CONFLICT" });
    await assertTransferUnitsStillMatch(tx, tenant, transfer.lines);
    await tx.enterpriseUnitOfMeasure.update({ where: { id: stock.id }, data: { decimalScale: 5 } });
    assert.deepEqual(await listTransferUnitConversions(tx, tenant, inventory.id, warehouses[0].id), []);
    await assert.rejects(assertTransferUnitsStillMatch(tx, tenant, transfer.lines), { code: "INVENTORY_UNIT_CONVERSION_REQUIRED" });
    const historical = await tx.enterpriseCatalogUnitConversion.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(historical.sourceCode, "CARTON");
    assert.equal(projectCatalogConversion(historical, "1.001").stockQuantity, "12.135123");
    assert.equal(await tx.enterpriseOperationalEvent.count({
      where: { organizationId: tenant, entityId: item.id, eventType: "CATALOG_UNIT_CONVERSION_VERSION_CREATED" },
    }), 2);

    const { id, createdAt, ...conversion } = second;
    assert.ok(id && createdAt);
    for (const [changes, code] of [
      [{}, "P2002"],
      [{ version: 3, catalogItemId: foreignItem.id }, "P2003"],
      [{ version: 3, sourceUnitId: foreignUnit.id }, "P2003"],
      [{ version: 3, targetUnitId: foreignUnit.id }, "P2003"],
    ]) {
      await tx.$executeRaw`SAVEPOINT qa_1228_conversion_constraint`;
      await assert.rejects(tx.enterpriseCatalogUnitConversion.create({ data: { ...conversion, ...changes } }), { code });
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT qa_1228_conversion_constraint`;
      await tx.$executeRaw`RELEASE SAVEPOINT qa_1228_conversion_constraint`;
    }
    assert.equal(await tx.enterpriseCatalogUnitConversion.count({ where: { organizationId: tenant } }), 2);
    throw new RollbackFixture();
  }, { isolationLevel: "Serializable", timeout: 10000 }), RollbackFixture);
  assert.equal(await db.enterpriseCatalogUnitConversion.count({ where: { organizationId: tenant } }), 0);
  assert.equal(await db.enterpriseOperationalEvent.count({ where: { organizationId: tenant } }), 0);
  console.log("PASS #1228 PostgreSQL conversion history: exact factors, stale unit proof, unique versions, tenant FKs and rollback");
  console.log("PASS #1228 PostgreSQL transfers: exact conversion snapshot, latest choice, historical factor replay, tenant and changed-target guards");
}

const projectFixture = { reader: null, organizationId: "", actor: "" };
const { GET: getProjects } = workflowTestLoader({
  "@/lib/prisma": { prisma: { $transaction: async (callback, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return callback(projectFixture.reader);
  } } },
  "@/lib/auth": { getSession: async () => ({ userId: projectFixture.actor }) },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/business-context": { resolveEnterpriseBusinessDate: async () => "2026-11-26" },
  "@/lib/enterprise/common/access": { getEnterpriseCommonDomainAccess: async ({ organizationId, action }) =>
    organizationId === projectFixture.organizationId && action === "read" ? { canManage: false } : null },
  "@/lib/enterprise/accounting/http": { financeBusinessDateRange: (req) => {
    const requested = new URL(req.url).searchParams.get("dateFrom");
    return { ok: true, from: requested ? new Date(requested) : null, to: null };
  } },
  "@/lib/enterprise/projects-assets/projects": {},
  "@/lib/enterprise/projects-assets/schemas": {},
  "@/lib/rate-limit": {},
})("@/app/api/enterprise/[organizationId]/projects/route");

async function verifyProjectAnalytics(tenant, otherTenant, actor) {
  await assert.rejects(db.$transaction(async tx => {
    const today = new Date("2026-11-26");
    const past = new Date("2026-11-01");
    const project = { organizationId: tenant, name: "Portfolio QA #1228", status: "ACTIVE", currency: "CDF",
      indicativeBudget: "9999999999999999.99", createdAt: past, targetEndDate: past, createdByUserId: actor };
    const filtered = Array.from({ length: 56 }, (_, index) => ({
      ...project, id: `${tenant}-project-${index}`, reference: `TARGET-${index}`, targetEndDate: index === 55 ? today : past,
    }));
    await tx.enterpriseProject.createMany({ data: [
      ...filtered,
      { ...project, id: `${tenant}-usd`, reference: "USD", name: "Another project", status: "COMPLETED", currency: "USD", indicativeBudget: "12.34" },
      { ...project, id: `${tenant}-archived`, reference: "ARCHIVED", archivedAt: today },
      { ...project, reference: "NO-CURRENCY", name: "Another project", status: "DRAFT", currency: null, indicativeBudget: "5" },
      { ...project, organizationId: otherTenant, id: `${tenant}-foreign`, reference: "TARGET-0" },
    ] });
    const risk = { organizationId: tenant, reference: "RISK", title: "Risk", description: "Project risk", status: "OPEN", severity: "HIGH", createdByUserId: actor };
    await tx.enterpriseProjectRisk.createMany({ data: [
      { ...risk, projectId: filtered[55].id },
      { ...risk, projectId: `${tenant}-usd` },
      { ...risk, projectId: `${tenant}-archived` },
      { ...risk, projectId: `${tenant}-foreign`, organizationId: otherTenant },
    ] });
    await tx.enterpriseProjectDeliverable.createMany({ data: ["ACCEPTED", "DRAFT"].map(status => ({
      organizationId: tenant, projectId: filtered[55].id, reference: status, name: status, status, createdByUserId: actor,
    })) });
    Object.assign(projectFixture, { reader: tx, organizationId: tenant, actor });
    const read = (query, organizationId = tenant) => getProjects(
      new Request(`http://localhost/api/enterprise/${organizationId}/projects?${query}`),
      { params: Promise.resolve({ organizationId }) },
    );
    const query = "search=Portfolio%20QA&status=ACTIVE&pageSize=25.5&dateFrom=2026-11-01";
    const first = await read(query);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    const firstPage = await first.json();
    const lastPage = await (await read(query + "&page=3")).json();
    const absent = await (await read(query + "&page=4")).json();
    assert.deepEqual(firstPage.pagination, { page: 1, pageSize: 25, total: 56, pageCount: 3 });
    assert.deepEqual(firstPage.metrics, { active: 56, overdue: 55, highRisks: 1 });
    assert.deepEqual(firstPage.generalMetrics, { active: 56, overdue: 56, highRisks: 2 });
    assert.deepEqual(firstPage.pageMetrics, { active: 25, overdue: 25, highRisks: 0 });
    assert.deepEqual(lastPage.pageMetrics, { active: 6, overdue: 5, highRisks: 1 });
    assert.deepEqual(absent.pageMetrics, { active: 0, overdue: 0, highRisks: 0 });
    assert.equal(lastPage.items.find(row => row.id === filtered[55].id).progressPercent, 50);
    assert.deepEqual(lastPage.filteredTotals, firstPage.filteredTotals);
    assert.deepEqual(absent.generalTotals, firstPage.generalTotals);
    assert.deepEqual(absent.pageTotals, []);
    assert.deepEqual(firstPage.filteredTotals, [{ currencyCode: "CDF", status: "ACTIVE", metric: "projectIndicativeBudget", amount: "559999999999999999.44" }]);
    assert.equal(lastPage.pageTotals[0].amount, "59999999999999999.94");
    assert.equal(firstPage.generalTotals.find(row => row.currencyCode === "USD").amount, "12.34");
    assert.equal(firstPage.generalTotals.length, 2, "Legacy projects without proved currency are excluded from monetary totals");
    const noMatches = await (await read("search=Portfolio%20QA&dateFrom=2026-11-27")).json();
    assert.equal(noMatches.pagination.total, 0);
    assert.deepEqual(noMatches.filteredTotals, []);
    assert.equal((await read(query, otherTenant)).status, 403);
    throw new RollbackFixture();
  }, { isolationLevel: "RepeatableRead", timeout: 10000 }), RollbackFixture);
  assert.equal(await db.enterpriseProject.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0);
  console.log("PASS #1228 PostgreSQL projects: filtered/authorized/page counters and budget amounts, date and tenant scopes");
}

try {
  const expected = [
    ["EnterpriseInventoryBalance", "quantityOnHand", 21],
    ["EnterpriseInventoryBalance", "quantityReserved", 21],
    ["EnterpriseStockMovement", "quantity", 21],
    ["EnterpriseStockMovement", "balanceAfter", 21],
    ["EnterpriseInventoryReservation", "quantity", 21],
    ["EnterpriseStockTransferLine", "quantity", 21],
    ["EnterpriseQuoteItem", "quantity", 21],
    ["EnterpriseSalesOrderItem", "quantityOrdered", 21],
    ["EnterprisePurchaseItem", "quantity", 21],
    ["EnterpriseProductionOrder", "plannedQuantity", 21],
    ["EnterpriseInventoryCostLayer", "remainingQuantity", 21],
    ["EnterpriseInventoryTransferValuation", "quantity", 21],
    ["PharmacyStockMovement", "quantity", 17],
    ["HealthPharmacyStockMovement", "quantity", 17],
  ];
  const columns = await db.$queryRaw`SELECT table_name, column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND data_type='numeric'`;
  for (const [table, field, precision] of expected) {
    const found = columns.find(row => row.table_name === table && row.column_name === field);
    assert.ok(found, `${table}.${field} must exist`);
    assert.equal(found.numeric_precision, precision, `${table}.${field} preserves integer capacity`);
    assert.equal(found.numeric_scale, 6, `${table}.${field} preserves micro-units`);
  }
  const [row] = await db.$queryRaw`SELECT
    '999999999999999.999999'::numeric(21,6)::text AS common_max,
    '99999999999.999999'::numeric(17,6)::text AS sector_max,
    (5::numeric(21,6)-0.123456::numeric(21,6))::text AS residual`;
  assert.equal(row.common_max, "999999999999999.999999");
  assert.equal(row.sector_max, "99999999999.999999");
  assert.equal(row.residual, "4.876544");
  const [constraint] = await db.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"EnterpriseInventoryTransferValuation"'::regclass AND conname='inv_transfer_value_amount_ck'`;
  assert.match(constraint.definition, /round\(quantity, 6\)/);
  assert.match(constraint.definition, /sourceQuantityBefore/);
  assert.match(constraint.definition, /sourceValueBefore/);
  const tenant = `qa-1228-${randomUUID()}`;
  const otherTenant = `${tenant}-other`;
  const actor = "qa-1228-actor";
  await verifyConversionHistory(tenant, otherTenant, actor);
  await verifyProjectAnalytics(tenant, otherTenant, actor);
  await verifyCashAnalytics(tenant, otherTenant, actor);
  await verifyLedgerSearch(tenant, otherTenant, actor);
  try {
    await db.$transaction(async tx => {
      const fixtureStarted=performance.now();
      const unit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: tenant, code: "MICRO", name: "Micro-unit", decimalScale: 6 } });
      const otherUnit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: otherTenant, code: "MICRO", name: "Other unit", decimalScale: 6 } });
      const catalogData = { code: "MICRO", name: "Micro article", normalizedName: "micro article", itemType: "PRODUCT", trackInventory: true, createdByUserId: actor };
      const item = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: tenant, unitOfMeasureId: unit.id } });
      const foreign = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: otherTenant, unitOfMeasureId: otherUnit.id } });
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_tenant");
      await assert.rejects(async () => tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: foreign.id, createdByUserId: actor } }), { code: "P2003" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_tenant");
      const site = await tx.enterpriseSite.create({ data: { organizationId: tenant, code: "SHOP", name: "QA shop", siteType: "STORE", createdByUserId: actor } });
      const warehouse = await tx.enterpriseWarehouse.create({ data: { organizationId: tenant, siteId: site.id, code: "WH", name: "QA warehouse", createdByUserId: actor } });
      const inventory = await tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: item.id, createdByUserId: actor } });
      const coordinates = { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id };
      const balance = await tx.enterpriseInventoryBalance.create({ data: { ...coordinates, quantityOnHand: "999999999999999.999998" } });
      const updated = await tx.enterpriseInventoryBalance.update({ where: { id: balance.id }, data: { quantityOnHand: { increment: "0.000001" } } });
      assert.equal(updated.quantityOnHand.toFixed(), "999999999999999.999999", "Prisma round-trip and PostgreSQL increment retain the last micro-unit");
      const promisedBalance=await tx.enterpriseInventoryBalance.update({where:{id:balance.id},data:{quantityReserved:"0.000001"}});
      const maximumPlan=planFefoLots({candidates:[{id:promisedBalance.id,status:"AVAILABLE",expiryDate:null,quantityOnHand:promisedBalance.quantityOnHand,quantityReserved:promisedBalance.quantityReserved}],quantity:promisedBalance.quantityOnHand,businessDate:"2026-11-25",expiryMode:"BLOCK"});
      assert.equal(maximumPlan.allocations[0].quantity.toFixed(),"999999999999999.999998","The real Prisma NUMERIC values retain the last reserved micro-unit in FEFO");
      assert.equal(maximumPlan.shortfall.toFixed(),"0.000001");
      const movement = await tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", balanceAfter: "999999999999999.999999", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } });
      assert.equal(movement.quantity.toFixed(), "0.123456");
      assert.equal(movement.balanceAfter.toFixed(), "999999999999999.999999");
      const layer = await tx.enterpriseInventoryCostLayer.create({ data: { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: "0.123456", remainingQuantity: "0.123456", unitCost: "2.5", totalCost: "0.30864", currencyCode: "CDF", effectiveAt: new Date() } });
      assert.equal(layer.remainingQuantity.toFixed(), "0.123456");
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_idempotence");
      await assert.rejects(async () => tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } }), { code: "P2002" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_idempotence");
      // More than two analytical batches, with real orders, unpaid invoice
      // holds, another unit and forbidden site. No ledger posting is performed.
      const integerUnit=await tx.enterpriseUnitOfMeasure.create({data:{organizationId:tenant,code:"INTEGER",name:"Piece",decimalScale:0}});
      const bulk=Array.from({length:501},(_,i)=>({id:`${tenant}-bulk-${String(i).padStart(4,"0")}`,catalogId:`${tenant}-catalog-${i}`,invoiceItemId:`${tenant}-invoice-item-${i}`}));
      await tx.enterpriseCatalogItem.createMany({data:bulk.map((row,i)=>({...catalogData,id:row.catalogId,organizationId:tenant,code:`BULK-1228-${i}`,normalizedName:`bulk-1228-${i}`,name:`BULK-1228-${i}`,unitOfMeasureId:i%2?integerUnit.id:unit.id}))});
      await tx.enterpriseInventoryItem.createMany({data:bulk.map(row=>({id:row.id,organizationId:tenant,catalogItemId:row.catalogId,minimumQuantity:10,createdByUserId:actor}))});
      await tx.enterpriseInventoryBalance.createMany({data:bulk.map(row=>({organizationId:tenant,inventoryItemId:row.id,warehouseId:warehouse.id,quantityOnHand:10,quantityReserved:1}))});
      await tx.enterpriseInventoryReservation.createMany({data:bulk.map(row=>({organizationId:tenant,inventoryItemId:row.id,warehouseId:warehouse.id,salesOrderId:"fixture-order",salesOrderItemId:row.id,quantity:2,fulfilledQuantity:0,idempotencyKey:row.id,createdByUserId:actor}))});
      await tx.enterpriseInventoryItem.update({where:{id:bulk[1].id},data:{minimumQuantity:5}});
      const invoice=await tx.enterpriseSalesInvoice.create({data:{organizationId:tenant,number:"QA-1228-HOLDS",businessPartyId:`${tenant}-party`,invoiceDate:new Date(),currencyCode:"USD",subtotal:501,taxTotal:0,grandTotal:501,outstandingAmount:501,createdByUserId:actor}});
      await tx.enterpriseSalesInvoiceItem.createMany({data:bulk.map(row=>({id:row.invoiceItemId,organizationId:tenant,salesInvoiceId:invoice.id,catalogItemId:row.catalogId,description:"Unpaid fixture line",quantity:1,unitPrice:1,netAmount:1,taxAmount:0,totalAmount:1}))});
      const checkout=await tx.enterpriseRetailInvoiceCheckout.create({data:{organizationId:tenant,salesInvoiceId:invoice.id,siteId:site.id,warehouseId:warehouse.id,idempotencyKey:`${tenant}-checkout`,requestFingerprint:"a".repeat(64),preparedByUserId:actor}});
      await tx.enterpriseRetailInvoiceCheckoutLine.createMany({data:bulk.map(row=>({organizationId:tenant,checkoutId:checkout.id,invoiceItemId:row.invoiceItemId,inventoryItemId:row.id}))});
      const forbiddenSite=await tx.enterpriseSite.create({data:{organizationId:tenant,code:"FORBIDDEN",name:"Forbidden shop",siteType:"STORE",createdByUserId:actor}});
      const forbiddenWarehouse=await tx.enterpriseWarehouse.create({data:{organizationId:tenant,siteId:forbiddenSite.id,code:"FORBIDDEN",name:"Forbidden warehouse",createdByUserId:actor}});
      await tx.enterpriseInventoryBalance.create({data:{organizationId:tenant,inventoryItemId:bulk[0].id,warehouseId:forbiddenWarehouse.id,quantityOnHand:99999}});
      inventoryFixture.reader=new Proxy(tx,{get:(target,key)=>key==="organization"?{findUniqueOrThrow:async()=>({timezone:"UTC"})}:Reflect.get(target,key)});
      inventoryFixture.organizationId=tenant;inventoryFixture.siteId=site.id;inventoryFixture.actor=actor;
      console.log(`#1228 PostgreSQL fixture setup: ${(performance.now()-fixtureStarted).toFixed(0)}ms`);
      const inventoryPage=async(page,extra="")=>{const readStarted=performance.now();queryTimings.length=0;const response=await inventoryGet(new Request(`http://localhost/api/enterprise/${tenant}/inventory?search=BULK-1228&pageSize=5&page=${page}${extra}`),{params:Promise.resolve({organizationId:tenant})});assert.equal(response.status,200);const body=await response.json();const duration=performance.now()-readStarted;console.log(`#1228 actual inventory GET page ${page}: ${body.pagination.total} matches in ${duration.toFixed(0)}ms; slow queries ${JSON.stringify(queryTimings)}`);assert(duration<10000,`One inventory page alone exceeded the unchanged 10s three-page budget: ${duration.toFixed(0)}ms`);return body;};
      const started=performance.now();const firstPage=await inventoryPage(1),secondPage=await inventoryPage(2),beyondPage=await inventoryPage(999);
      const elapsed=performance.now()-started;assert(elapsed<10000,`501-item full analytics plus three HTTP projections exceeded 10s: ${elapsed}ms`);
      assert.equal(firstPage.pagination.total,501);assert.equal(firstPage.items.length,5);assert.equal(secondPage.items.length,5);assert.equal(beyondPage.items.length,0);
      assert.deepEqual(firstPage.quantityTotals,secondPage.quantityTotals);assert.deepEqual(firstPage.quantityTotals,beyondPage.quantityTotals);assert.deepEqual(beyondPage.pageQuantityTotals,[]);
      assert.deepEqual(firstPage.generalQuantityTotals,secondPage.generalQuantityTotals);
      for(const [unitId,onHand,reserved,sellable]of [[unit.id,"2510.000000","1004.000000","1506.000000"],[integerUnit.id,"2500","1000","1500"]])for(const [metric,value]of [["onHand",onHand],["reserved",reserved],["sellable",sellable]])assert.equal(firstPage.quantityTotals.find(row=>row.unitId===unitId&&row.metric===metric).value,value);
      assert.equal(firstPage.metrics.lowStockCount,500);
      assert.equal(firstPage.metrics.warehouseCount,1);assert.equal(firstPage.metrics.movementCount,0);
      assert.equal(firstPage.generalQuantityTotals.find(row=>row.unitId===unit.id&&row.metric==="onHand").value,"1000000000002509.999999");
      const lowPage=await inventoryPage(1,"&lowStock=true");assert.equal(lowPage.pagination.total,500);assert.equal(lowPage.quantityTotals.find(row=>row.unitId===integerUnit.id&&row.metric==="onHand").value,"2490");assert.equal(lowPage.quantityTotals.find(row=>row.unitId===integerUnit.id&&row.metric==="reserved").value,"996");assert.equal(lowPage.quantityTotals.find(row=>row.unitId===integerUnit.id&&row.metric==="sellable").value,"1494");assert.deepEqual(lowPage.generalQuantityTotals,firstPage.generalQuantityTotals);
      const forbiddenPage=await inventoryPage(1,`&warehouseId=${forbiddenWarehouse.id}`);assert.equal(forbiddenPage.pagination.total,0);assert.deepEqual(forbiddenPage.quantityTotals,[]);assert.deepEqual(forbiddenPage.generalQuantityTotals,firstPage.generalQuantityTotals);
      assert.equal((await inventoryGet(new Request(`http://localhost/api/enterprise/${otherTenant}/inventory`),{params:Promise.resolve({organizationId:otherTenant})})).status,403);
      console.log(`PASS #1228 PostgreSQL inventory analytics: 501 items, real reservations/holds, two units, forbidden site, three pages in ${elapsed.toFixed(0)}ms`);
      // Commercial aggregates use PostgreSQL NUMERIC across more than one page,
      // with both foreign rows and a second document status/currency present.
      const exactCents = 999999999999999999n;
      const money = count => { const cents=exactCents*BigInt(count); return `${cents/100n}.${String(cents%100n).padStart(2,"0")}`; };
      for(const model of ["enterpriseQuote","enterpriseSalesOrder","enterprisePurchase"]){
        const data=Array.from({length:104},(_,i)=>({organizationId:i<102?tenant:otherTenant,reference:`COMM-${i}`,title:i%2?"Other":"Target",status:i%3?"DRAFT":"CANCELLED",currency:i%5?"USD":"CDF",subtotalAmount:"9999999999999999.99",taxAmount:"0",totalAmount:"9999999999999999.99",createdByUserId:actor,...(model==="enterprisePurchase"?{requestedByUserId:i%7?actor:"other-actor"}:{businessPartyId:`${tenant}-party`,discountAmount:"0"})}));
        await tx[model].createMany({data});
        const base={organizationId:tenant,archivedAt:null,...(model==="enterprisePurchase"?{requestedByUserId:actor}:{})};
        const where={...base,status:"DRAFT",title:{contains:"Target",mode:"insensitive"}};
        const general=await tx[model].groupBy({by:["currency","status"],where:base,_sum:{totalAmount:true},_count:{_all:true}});
        const filtered=await tx[model].groupBy({by:["currency","status"],where,_sum:{totalAmount:true},_count:{_all:true}});
        for(const group of general){const count=data.filter(row=>row.organizationId===tenant&&row.currency===group.currency&&row.status===group.status&&(model!=="enterprisePurchase"||row.requestedByUserId===actor)).length;assert.equal(group._sum.totalAmount.toFixed(2),money(count));assert.equal(group._count._all,count);}
        for(const group of filtered){const count=data.filter(row=>row.organizationId===tenant&&row.currency===group.currency&&row.status==="DRAFT"&&row.title==="Target"&&(model!=="enterprisePurchase"||row.requestedByUserId===actor)).length;assert.equal(group._sum.totalAmount.toFixed(2),money(count));assert.equal(group._count._all,count);}
        assert.equal(await tx[model].count({where}),filtered.reduce((sum,row)=>sum+row._count._all,0));
        const first=await tx[model].findMany({where,take:5,orderBy:{id:"asc"}}),second=await tx[model].findMany({where,take:5,skip:5,orderBy:{id:"asc"}});
        assert.equal(first.length,5);assert.equal(second.length,5);assert.equal(new Set([...first,...second].map(row=>row.id)).size,10);
        assert.equal((await tx[model].findMany({where,take:5,skip:1000})).length,0);
        assert.deepEqual(await tx[model].groupBy({by:["currency","status"],where,_sum:{totalAmount:true},_count:{_all:true}}),filtered);
      }
      const makeFinancialAccount = async (organizationId, currencyCode) => {
        const chart = await tx.enterpriseChartOfAccounts.create({ data: {
          organizationId, code: "QA-TREASURY", nameFr: "Plan test", nameEn: "Test chart", createdByUserId: actor,
        } });
        const ledger = await tx.enterpriseLedgerAccount.create({ data: {
          organizationId, chartId: chart.id, code: "QA-CASH", nameFr: "Caisse test", nameEn: "Test cash", accountType: "ASSET",
        } });
        return tx.enterpriseFinancialAccount.create({ data: {
          organizationId, ledgerAccountId: ledger.id, code: "QA-ACCOUNT", name: "QA financial account", accountType: "CASH", currencyCode,
        } });
      };
      const localAccount = await makeFinancialAccount(tenant, "CDF");
      const otherAccount = await makeFinancialAccount(otherTenant, "USD");
      const entry = {
        organizationId: tenant, financialAccountId: localAccount.id, reference: "QA-1228",
        transactionDate: new Date(), direction: "INBOUND", status: "CONFIRMED",
        currencyCode: "CDF", transactionType: "FUNDING", amount: "99999999999999.999999", createdByUserId: actor,
      };
      await tx.enterpriseTreasuryTransaction.createMany({ data: [
        ...Array.from({ length: 56 }, () => entry),
        { ...entry, direction: "OUTBOUND", status: "REVERSED", amount: "0.000001" },
        { ...entry, organizationId: otherTenant, financialAccountId: otherAccount.id, currencyCode: "USD" },
      ] });
      Object.assign(treasuryFixture, { reader: tx, organizationId: tenant, actor });
      const treasuryPage = async (page) => {
        const request = new Request(`http://localhost/api/enterprise/${tenant}/treasury-history?search=QA-1228&direction=INBOUND&currencyCode=CDF&page=${page}`);
        const response = await getTreasuryHistory(request, { params: Promise.resolve({ organizationId: tenant }) });
        assert.equal(response.status, 200);
        return response.json();
      };
      const firstTreasuryPage = await treasuryPage(1);
      const lastTreasuryPage = await treasuryPage(3);
      assert.equal(firstTreasuryPage.pagination.total, 56);
      assert.equal(firstTreasuryPage.items.length, 25);
      assert.equal(lastTreasuryPage.items.length, 6);
      assert.equal(firstTreasuryPage.filteredTotals[0].amount, "5599999999999999.999944");
      assert.deepEqual(firstTreasuryPage.filteredTotals, lastTreasuryPage.filteredTotals);
      assert.equal(lastTreasuryPage.pageTotals[0].amount, "599999999999999.999994");
      assert.ok(firstTreasuryPage.generalTotals.some((row) => row.status === "REVERSED" && row.amount === "0.000001"));
      assert.ok(firstTreasuryPage.generalTotals.every((row) => row.currencyCode === "CDF"));
      console.log("PASS #1228 PostgreSQL treasury history: exact aggregates, 56 filtered records, stable pagination and tenant/currency boundaries");

      const expense = { organizationId: tenant, title: "QA-1228", status: "APPROVED", expenseDate: new Date(), currency: "CDF", amount: "9999999999999999.99", requestedByUserId: actor, createdByUserId: actor };
      await tx.enterpriseExpense.createMany({ data: [
        ...Array.from({ length: 56 }, (_, index) => ({ ...expense, reference: `QA-1228-EXPENSE-${index}` })),
        { ...expense, reference: "UNAUTHORIZED", requestedByUserId: "other-actor", createdByUserId: "other-actor" },
        { ...expense, reference: "OTHER-TENANT", organizationId: otherTenant },
        { ...expense, reference: "CANCELLED-USD", currency: "USD", status: "CANCELLED", amount: "7.55" },
      ] });
      const readExpensePage = async (page) => {
        const request = new Request(`http://localhost/api/enterprise/${tenant}/expenses?status=APPROVED&currency=CDF&search=QA-1228&pageSize=25&page=${page}`);
        const response = await getExpenses(request, { params: Promise.resolve({ organizationId: tenant }) });
        assert.equal(response.status, 200);
        return response.json();
      };
      const expensePage = await readExpensePage(3);
      assert.equal(expensePage.pagination.total, 56);
      assert.equal(expensePage.items.length, 6);
      assert.deepEqual(expensePage.filteredTotals, [{ currencyCode: "CDF", status: "APPROVED", metric: "total", amount: money(56) }]);
      assert.equal(expensePage.pageTotals[0].amount, money(6));
      assert.equal(expensePage.generalTotals.length, 2);
      assert.ok(expensePage.generalTotals.some((row) => row.status === "CANCELLED" && row.currencyCode === "USD" && row.amount === "7.55"));
      console.log("PASS #1228 PostgreSQL expenses: exact aggregates, filtered/page scopes and requester/tenant boundaries");

      const payrollPeriods = Array.from({ length: 57 }, (_, index) => ({
        id: `${tenant}-payroll-${index}`, organizationId: tenant, code: `QA-${index}`, name: `Test period ${index}`,
        periodStart: new Date(Date.UTC(2026, index, 1)), periodEnd: new Date(Date.UTC(2026, index + 1, 0)), createdByUserId: actor,
      }));
      await tx.enterprisePayrollPeriod.createMany({ data: payrollPeriods });
      const payrollRun = {
        organizationId: tenant, status: "APPROVED", currency: "CDF", grossAmount: "9999999999999999.99",
        bonusAmount: "0.01", deductionAmount: "0.01", netAmount: "9999999999999999.98", preparedByUserId: actor,
      };
      await tx.enterprisePayrollRun.createMany({ data: [
        ...payrollPeriods.slice(0, 56).map((period, index) => ({ ...payrollRun, payrollPeriodId: period.id, reference: `QA-RUN-${index}` })),
        { ...payrollRun, payrollPeriodId: payrollPeriods[56].id, reference: "QA-RUN-RESTRICTED", preparedByUserId: "other-actor" },
        { ...payrollRun, payrollPeriodId: payrollPeriods[0].id, reference: "QA-RUN-CANCELLED", status: "CANCELLED", currency: "USD" },
      ] });
      const readPayrollPage = async (page) => {
        const request = new Request(`http://localhost/api/enterprise/${tenant}/payroll-runs?status=APPROVED&pageSize=25&page=${page}`);
        const response = await getPayrollRuns(request, { params: Promise.resolve({ organizationId: tenant }) });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        return response.json();
      };
      const payrollPage = await readPayrollPage(3);
      assert.equal(payrollPage.pagination.total, 56);
      assert.equal(payrollPage.items.length, 6);
      assert.deepEqual(payrollPage.metrics, { pendingApproval: 0, approved: 56 });
      assert.equal(payrollPage.filteredTotals.find((item) => item.metric === "payrollGross").amount, money(56));
      assert.equal(payrollPage.filteredTotals.find((item) => item.metric === "payrollBonuses").amount, "0.56");
      assert.equal(payrollPage.filteredTotals.find((item) => item.metric === "payrollDeductions").amount, "0.56");
      assert.equal(payrollPage.filteredTotals.find((item) => item.metric === "payrollNet").amount, "559999999999999998.88");
      assert.equal(payrollPage.pageTotals.find((item) => item.metric === "payrollGross").amount, money(6));
      assert.ok(payrollPage.generalTotals.some((item) => item.status === "CANCELLED" && item.currencyCode === "USD"));
      payrollWrite = false;
      const selfOnly = await readPayrollPage(1);
      assert.deepEqual(selfOnly.items, []);
      assert.equal(selfOnly.generalTotals, undefined);
      console.log("PASS #1228 PostgreSQL payroll: four exact types of amount, workflow statuses, filtered counts and role boundaries");
      throw new RollbackFixture();
    }, { timeout: 30000, isolationLevel: "RepeatableRead" });
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }
  assert.equal(await db.enterpriseCatalogItem.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "No fixture data may remain");
  for(const model of ["enterpriseQuote","enterpriseSalesOrder","enterprisePurchase"]) assert.equal(await db[model].count({where:{organizationId:{in:[tenant,otherTenant]}}}),0,"Commercial rollback must leave no rows");
  assert.equal(await db.enterpriseTreasuryTransaction.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "Treasury rollback must leave no rows");
  assert.equal(await db.enterpriseExpense.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "Expense rollback must leave no rows");
  assert.equal(await db.enterprisePayrollRun.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "Payroll rollback must leave no rows");
  console.log("PASS #1228 PostgreSQL: deployed quantity types, preserved integer capacity, exact micro-unit subtraction and transfer conservation constraint");
} finally {
  await db.$disconnect();
}
