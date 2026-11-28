import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const tenant = "treasury-tenant";
const amount = "99999999999999.999999";
const localRows = Array.from({ length: 56 }, (_, index) => ({
  id: `movement-${index}`,
  reference: "settlement",
  organizationId: tenant,
  financialAccountId: "account",
  transactionDate: new Date("2026-11-25T12:00:00Z"),
  currencyCode: "CDF",
  direction: "INBOUND",
  status: "CONFIRMED",
  transactionType: "FUNDING",
  amount: new Prisma.Decimal(amount),
}));
const rows = [
  ...localRows,
  { ...localRows[0], id: "other-tenant", organizationId: "different-tenant" },
  { ...localRows[0], id: "transfer", currencyCode: "USD", direction: "OUTBOUND", transactionType: "TRANSFER", transferId: "transfer", amount: new Prisma.Decimal("10") },
  { ...localRows[0], id: "reversed", status: "REVERSED", amount: new Prisma.Decimal("0.000001") },
  { ...localRows[0], id: "zero", amount: new Prisma.Decimal(0), currencyCode: "USD" },
];
function matching(where) {
  return rows.filter((row) => Object.entries(where).every(([key, condition]) => {
    if (key === "reference") return row.reference.toLowerCase().includes(condition.contains.toLowerCase());
    if (key === "transactionDate") return (!condition.gte || row.transactionDate >= condition.gte) && (!condition.lte || row.transactionDate <= condition.lte);
    return row[key] === condition;
  }));
}
function exactSum(count) {
  const millionths = BigInt(amount.replace(".", "")) * BigInt(count);
  return `${millionths / 1000000n}.${String(millionths % 1000000n).padStart(6, "0").replace(/0+$/, "")}`;
}
let reads = 0;
let canView = true;
let listFilter;
const tx = {
  enterpriseTreasuryTransaction: {
    findMany: async ({ where, orderBy, skip, take }) => {
      assert.deepEqual(orderBy.at(-1), { id: "desc" });
      listFilter = where;
      return matching(where).slice(skip, skip + take);
    },
    count: async ({ where }) => {
      assert.equal(where, listFilter);
      return matching(where).length;
    },
    groupBy: async ({ by, where }) => {
      assert.deepEqual(by, ["currencyCode", "direction", "status"]);
      assert.ok(Object.keys(where).length === 1 || where === listFilter);
      const groups = new Map();
      const Exact = Prisma.Decimal.clone({ precision: 48 });
      for (const row of matching(where)) {
        const key = JSON.stringify(by.map((field) => row[field]));
        const group = groups.get(key) ?? { currencyCode: row.currencyCode, direction: row.direction, status: row.status, _sum: { amount: new Exact(0) } };
        group._sum.amount = group._sum.amount.add(row.amount);
        groups.set(key, group);
      }
      return [...groups.values()];
    },
  },
  enterpriseAccountTransfer: {
    findMany: async ({ where }) => {
      assert.deepEqual(where, { organizationId: tenant, id: { in: ["transfer"] } });
      return [{ id: "transfer", number: "TRF-27" }];
    },
  },
};
const load = workflowTestLoader({
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/accounting/treasury-balance-at": { readTreasuryBalanceAt: async (reader, organizationId, accountId, date) => {
    assert.equal(reader, tx);
    assert.equal(organizationId, tenant);
    assert.equal(accountId, "account");
    assert.equal(date, "2026-11-25");
    return { accountId, date, timezone: "Africa/Kinshasa", currencyCode: "CDF", amount: "10.000001", status: "AVAILABLE" };
  } },
  "@/lib/enterprise/accounting/http": {
    authorizeFinanceRequest: async (_req, org, feature, action) => {
      assert.equal(feature, "FINANCE_TREASURY");
      assert.equal(action, "view");
      return canView && org === tenant ? { ok: true, session: { userId: "cashier" } } : { ok: false, response: new Response(null, { status: 403 }) };
    },
    financeListParams: (req) => {
      const searchParams = new URL(req.url).searchParams;
      return { page: +(searchParams.get("page") || 1), pageSize: +(searchParams.get("pageSize") || 10), status: searchParams.get("status"), search: searchParams.get("search") };
    },
  },
  "@/lib/prisma": { prisma: { $transaction: async (callback, { isolationLevel }) => {
    reads++;
    assert.equal(isolationLevel, "RepeatableRead");
    return callback(tx);
  } } },
});
const { GET } = load("@/app/api/enterprise/[organizationId]/treasury-history/route");
async function request(query, org = tenant) {
  return GET(new Request(`http://localhost/api/enterprise/${org}/treasury-history?${query}`), { params: Promise.resolve({ organizationId: org }) });
}

const filters = "accountId=account&status=CONFIRMED&currencyCode=cdf&direction=INBOUND&transactionType=FUNDING&search=settlement&from=2026-11-25&to=2026-11-25";
const page1 = await (await request(filters + "&page=1")).json();
const page6 = await (await request(filters + "&page=6")).json();
assert.equal(page1.pagination.total, 56);
assert.equal(page1.items.length, 10);
assert.equal(page6.items.length, 6);
assert.deepEqual(page1.filteredTotals, [{ currencyCode: "CDF", status: "CONFIRMED", metric: "inbound", amount: exactSum(56) }]);
assert.deepEqual(page1.filteredTotals, page6.filteredTotals);
assert.deepEqual(page1.generalTotals, page6.generalTotals);
assert.deepEqual(page1.metrics, page6.metrics);
assert.equal(page1.metrics.treasuryBalanceAt.amount, "10.000001");
assert.equal(page1.pageTotals[0].amount, exactSum(10));
assert.equal(page6.pageTotals[0].amount, exactSum(6));
assert.ok(page1.generalTotals.some((row) => row.status === "REVERSED" && row.amount === "0.000001"));
assert.ok(page1.generalTotals.some((row) => row.currencyCode === "USD" && row.metric === "inbound" && row.amount === "0"));
const transferPage = await (await request("transactionType=TRANSFER")).json();
assert.deepEqual(transferPage.filteredTotals, [{ currencyCode: "USD", status: "CONFIRMED", metric: "outbound", amount: "10" }]);
assert.equal(transferPage.items[0].transfer.number, "TRF-27");
const empty = await (await request(filters + "&page=99")).json();
assert.deepEqual(empty.filteredTotals, page1.filteredTotals);
assert.deepEqual(empty.pageTotals, []);
const previousReads = reads;
assert.equal((await request("", "different-tenant")).status, 403);
canView = false;
assert.equal((await request(filters)).status, 403);
assert.equal(reads, previousReads);

console.log("#1228 treasury history: exact filtered/general/page totals, statuses, directions, currencies, transfer reference and tenant permissions passed");
