import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(name, "utf8");
const route = read("app/api/enterprise/[organizationId]/pharmacy/stock/movements/route.ts");
const stock = read("components/enterprise/pharmacy-stock-workspace.tsx");
const dataset = read("lib/pharmacy-stock.ts");
const fr = JSON.parse(read("locales/fr.json")).pharmacyStockHistory;
const en = JSON.parse(read("locales/en.json")).pharmacyStockHistory;

for (const token of [
  'canAccessPharmacyStock(session.userId, organizationId, "view")',
  "Prisma.PharmacyStockMovementWhereInput",
  "organizationId,",
  "prisma.pharmacyStockMovement.count",
  "prisma.pharmacyStockMovement.findMany",
  'orderBy: [{ createdAt: "desc" }, { id: "desc" }]',
  "skip: (page - 1) * pageSize",
  "take: pageSize",
  '"Cache-Control": "private, no-store"',
]) assert.ok(route.includes(token), `Movement API missing: ${token}`);
assert.match(route, /const MAX_PAGE_SIZE = 50/, "Backend must bound page size");
assert.match(route, /query.length > 80/, "Search input must be bounded");
assert.match(route, /product: \{ name: \{ contains: query/, "Product search must run on the server");
assert.match(route, /batch: \{ is: \{ batchNumber:/, "Batch search must run on the server");
assert.match(route, /reason: \{ contains: query/, "Reason search must run on the server");

assert.ok(stock.includes('pharmacy/stock/movements?${params}'), "Movement tab must fetch paginated data");
assert.ok(stock.includes("signal: controller.signal"), "Movement fetch must cancel stale searches");
assert.ok(stock.includes("<ListControls"), "Movement tab must have page controls");
assert.ok(stock.includes("setMovementPage(1)"), "New searches reset page");
assert.ok(stock.includes("movementResult.movements.map"), "History must render returned page");
assert.ok(!stock.includes('(dataset?.movements || []).map((item)'), "History must not render the overview subset");
assert.match(dataset, /pharmacyStockMovement\.findMany\(\{ where: \{ organizationId \}, orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \} \], take: 5/, "Dashboard only fetches five recent movements");
for (const key of ["searchPlaceholder","loading","loadError","retry","withoutBatch","empty"]) {
  assert.equal(typeof fr[key], "string", `Missing FR ${key}`);
  assert.equal(typeof en[key], "string", `Missing EN ${key}`);
}
assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "FR/EN movement history keys differ");
console.log("OK: pharmacy movements are server-paginated, tenant-scoped, searchable and translated.");
