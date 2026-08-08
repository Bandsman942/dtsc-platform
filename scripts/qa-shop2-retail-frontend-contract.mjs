import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const workspace = read("components/enterprise/professional/enterprise-retail-shop-workspace.tsx");
const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");
const searchRoute = read("app/api/enterprise/[organizationId]/retail/products/search/route.ts");

for (const marker of [
  "/retail/products/search",
  "AbortController",
  "pageSize: \"30\"",
  "availableQuantity",
  "allowNegativeStock",
  "inventoryItemId",
  "searchLoading",
]) {
  check(workspace.includes(marker), `Active Shop POS workspace must keep server-search marker: ${marker}`);
}

check(!workspace.includes("catalog.filter((item)"), "POS must not fall back to client-side filtering of the bootstrap catalog");
check(!workspace.includes(".slice(0, 30)"), "POS must not silently cap a local bootstrap search to 30 products");

const phoneStart = workspace.indexOf("function normalizePhonePreview");
const phoneEnd = workspace.indexOf("function statusTone", phoneStart);
const phoneBlock = phoneStart >= 0 && phoneEnd > phoneStart ? workspace.slice(phoneStart, phoneEnd) : "";
check(Boolean(phoneBlock), "normalizePhonePreview must remain discoverable for phone-safety QA");
check(!phoneBlock.includes("+243"), "Frontend phone preview must never force the DRC +243 country code");
check(phoneBlock.includes('startsWith("00")'), "Frontend may normalize an explicit international 00 prefix to +");

check(dashboard.includes("const includeCatalog = includeTelco;"), "RETAIL_POS dashboard must not bootstrap the 400-item catalog after server search cutover");
check(!dashboard.includes("includePos\n      ? prisma.enterpriseInventoryItem.findMany"), "RETAIL_POS dashboard must not load the full inventory balance graph");

for (const marker of ["pageSize", "quantityOnHand", "quantityReserved", "warehouseId", "organizationId"]) {
  check(searchRoute.includes(marker), `Server POS product search contract missing ${marker}`);
}

if (failures.length) {
  console.error("Shop 2 Retail frontend contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Shop 2 Retail frontend contract passed: server search active, POS bootstrap removed, and no hard-coded +243 preview normalization.");
