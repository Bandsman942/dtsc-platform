import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const path = "app/api/enterprise/[organizationId]/pharmacy/sales/references/route.ts";
const source = readFileSync(path, "utf8");
const calls = [];
let authorized = true;
const record = (method, args, result) => { calls.push({ method, args }); return Promise.resolve(result); };
const prisma = {
  pharmacyProduct: {
    findMany: (args) => record("products.findMany", args, [{ id: "p", name: "Test product", stockUnit: "box", referenceSalePrice: "12.00" }]),
    findFirst: (args) => record("products.findFirst", args, null),
    count: (args) => record("products.count", args, 501),
  },
  pharmacyBatch: {
    findMany: (args) => record("batches.findMany", args, [{ id: "b", batchNumber: "BATCH-01", availableQuantity: "25", expiryDate: new Date("2027-10-31") }]),
    findFirst: (args) => record("batches.findFirst", args, null),
    count: (args) => record("batches.count", args, 510),
  },
  pharmacyPrescription: {
    findMany: (args) => record("prescriptions.findMany", args, [{ id: "r", prescriptionNumber: "RX-01" }]),
    findFirst: (args) => record("prescriptions.findFirst", args, null),
    count: (args) => record("prescriptions.count", args, 530),
  },
};
const responses = { json: (body, options) => ({ status: options?.status || 200, body }) };
const exports = {};
const imported = {
  "next/server": { NextResponse: responses },
  "@/lib/auth": { getSession: async () => ({ userId: "user-a" }) },
  "@/lib/audit": { writeApiLog: async () => {} },
  "@/lib/enterprise/business-context": { formatEnterpriseBusinessDate: (date, timezone) => {
    assert.equal(timezone, "UTC", "Date-only expiry values must not be shifted to the organization's timezone");
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  } },
  "@/lib/pharmacy-sale-access": { canAccessPharmacySales: async () => authorized },
  "@/lib/prisma": { prisma },
};
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(compiled, {
  exports, require: (name) => {
    assert.ok(imported[name], `Unexpected import ${name}`);
    return imported[name];
  }, URL, Date, Promise, Number, String, console,
}, { filename: path });

const get = (qs) => exports.GET({ url: `https://app.example.test/sales/references?${qs}` }, { params: Promise.resolve({ organizationId: "tenant-a" }) });
let result = await get("kind=products&q=paracetamol&page=8&pageSize=1000");
assert.equal(result.status, 200);
assert.equal(result.body.items[0].title, "Test product");
assert.equal(result.body.pageCount, 21, "501 products with capped 25 results should yield 21 pages");
assert.equal(calls[0].args.take, 25);
assert.equal(calls[0].args.skip, 175);
assert.equal(calls[0].args.where.organizationId, "tenant-a");
assert.equal(calls[0].args.where.status, "ACTIVE");

calls.length = 0;
result = await get("kind=batches&productId=product-p&q=BATCH&pageSize=9");
assert.equal(result.status, 200);
assert.equal(result.body.items[0].title.includes("BATCH-01"), true);
assert.equal(result.body.items[0].title.includes("2027-10-31"), true, "Expiry date-only labels must remain stable in UTC");
assert.equal(calls[0].args.where.organizationId, "tenant-a");
assert.equal(calls[0].args.where.productId, "product-p");
assert.equal(calls[0].args.where.availableQuantity.gt, 0);
assert.equal(calls[0].args.where.recall, false);
assert.equal(calls[0].args.orderBy[0].expiryDate, "asc", "FEFO must order by earliest expiry");

calls.length = 0;
result = await get("kind=batches");
assert.equal(result.body.total, 0);
assert.equal(calls.length, 0, "No batch scan without productId");

result = await get("kind=prescriptions&q=RX&pageSize=25");
assert.equal(result.status, 200);
assert.equal(result.body.items[0].title, "RX-01");
assert.ok(!JSON.stringify(result.body).includes("patientName"), "No clinical identity leakage");

authorized = false;
calls.length = 0;
result = await get("kind=products");
assert.equal(result.status, 403);
assert.equal(calls.length, 0, "Denied access cannot query pharmacy data");

const sales = readFileSync("lib/pharmacy-sales.ts", "utf8");
const workspace = readFileSync("components/enterprise/pharmacy-sales-workspace.tsx", "utf8");
assert.doesNotMatch(sales, /prisma\.pharmacyProduct\.findMany\(\{ where: \{ organizationId, status: "ACTIVE" \}, orderBy/,
  "Unbounded products must not return from primary sales API");
assert.match(sales, /visibleProductIds/, "Historical cards must retain only page-scoped product labels");
assert.match(workspace, /function ReferenceChoice/);
assert.match(workspace, /selectedId: value/, "Selection must survive a new search page");
for (const locale of ["fr", "en"]) {
  const dictionary = JSON.parse(readFileSync(`locales/${locale}.json`, "utf8"));
  assert.ok(dictionary.pharmacySaleReferences.search);
  assert.ok(dictionary.pharmacySaleReferences.error);
}
console.log("OK: Pharmacy Sale references are tenant-scoped, capped, searchable, FEFO-ordered and permission-protected; selected items and FR/EN states are guarded.");
