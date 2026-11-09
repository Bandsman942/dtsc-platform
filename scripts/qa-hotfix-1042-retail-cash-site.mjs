import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");

class EnterpriseAccountingError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const state = {
  account: { id: "cash-A", siteId: "shop-A", accountType: "CASH", status: "ACTIVE", currencyCode: "CDF" },
  allowed: ["shop-A"], created: [],
};
const tx = {
  enterpriseFinancialAccount: { findFirst: async ({ where }) => {
    assert.equal(where.organizationId, "tenant");
    assert.equal(where.accountType, "CASH");
    return state.account;
  } },
  enterpriseCashSession: {
    findFirst: async () => null,
    create: async ({ data }) => { state.created.push(data); return { id: "session-" + state.created.length, ...data }; },
  },
  enterpriseRetailConfiguration: { findUnique: async () => ({ settingsJson: { siteStaffIsolationEnabled: false } }) },
};
const prisma = { $transaction: async (fn) => fn(tx) };
const source = fs.readFileSync("lib/enterprise/accounting/treasury-service.ts", "utf8");
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Date,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/prisma") return { prisma };
    if (id === "@/lib/enterprise/accounting/errors") return { EnterpriseAccountingError };
    if (id === "@/lib/enterprise/accounting/access") return { assertIndependentActor: () => {} };
    if (id === "@/lib/enterprise/accounting/helpers") return {
      financeReference: () => "CASH-TEST", money: (n) => new Prisma.Decimal(n),
      publishFinanceEvent: async () => {}, sumDecimals: () => new Prisma.Decimal(0),
    };
    if (id === "@/lib/enterprise/retail/site-access") return {
      retailFinanceReadSiteScope: async (org, user, capability) => {
        assert.equal(org, "tenant"); assert.equal(capability, "OPEN_CASH");
        return state.allowed;
      },
      retailStaffIsolationIsEnabled: (settings) => settings?.siteStaffIsolationEnabled === true,
    };
    return require(id);
  },
});
const open = (accountId = "cash-A", siteId) => unit.exports.openCashSession("tenant", "cashier", {
  financialAccountId: accountId, ...(siteId ? { siteId } : {}), openingAmount: "100",
});
assert.equal((await open()).siteId, "shop-A");
assert.equal(state.created.length, 1);
await assert.rejects(open("cash-A", "shop-B"), { code: "CASH_ACCOUNT_SITE_MISMATCH" });
assert.equal(state.created.length, 1, "Spoofed site cannot create a cash session");
state.account = { ...state.account, id: "cash-B", siteId: "shop-B" };
await assert.rejects(open("cash-B"), { code: "RETAIL_SITE_ACCESS_DENIED" });
state.account = { ...state.account, id: "cash-A", siteId: "shop-A" };
state.allowed = [];
await assert.rejects(open(), { code: "RETAIL_SITE_ACCESS_DENIED" });
assert.equal(state.created.length, 1, "Revocation denies new sessions, not only UI access");
state.allowed = null; // Finance-only or owner: existing Finance permission still required in route
const financeSession = await open();
assert.equal(financeSession.siteId, "shop-A");
assert.equal(state.created.length, 2);

const financeCashList = fs.readFileSync("app/api/enterprise/[organizationId]/cash-sessions/route.ts", "utf8");
assert.match(financeCashList, /retailFinanceReadSiteScope\(organizationId, auth\.session\.userId, "CLOSE_CASH"\)/);
assert.match(financeCashList, /siteId: \{ in: siteScope \}/);
assert.match(financeCashList, /canClose: capabilities\.canManage && item\.cashierUserId === auth\.session\.userId/);
const retailCashList = fs.readFileSync("app/api/enterprise/[organizationId]/retail/cash-sessions/route.ts", "utf8");
assert.match(retailCashList, /siteId: \{ in: siteScope \}/);
const closeRoute = fs.readFileSync("app/api/enterprise/[organizationId]/retail/daily-close/route.ts", "utf8");
assert.match(closeRoute, /siteId: \{ in: closeScope \}/);
const closeService = fs.readFileSync("lib/enterprise/retail/service.ts", "utf8");
assert.match(closeService, /existing\.submittedByUserId !== actorUserId/);
assert.match(closeService, /!closeScope\.includes\(existing\.siteId\)/);
assert.match(closeService, /!closeScope\.includes\(account\.siteId\)/);
assert.match(closeService, /input\.siteId && account\.siteId !== input\.siteId/);
assert.match(closeService, /strictSites && accountSites\.size !== 1/);
assert.match(closeService, /closeScope !== null && \(!close\.siteId \|\| !closeScope\.includes\(close\.siteId\)\)/);
console.log("HOTFIX #1042 cash site: actual account site, permission after revocation, lists and close boundaries OK");
