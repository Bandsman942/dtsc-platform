import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const page = read("app/enterprise-modules/RETAIL_POS/commercial/page.tsx");
const ui = read("components/enterprise/professional/retail-commercial-workspace.tsx");
const dashboard = read("lib/enterprise/retail/commercial-dashboard.ts");

check(page.includes("resolveEnterpriseModuleAccess({"), "Commercial control page must use the canonical server module access contract");
for (const marker of [
  "userId: session.userId",
  "organizationId,",
  'moduleCode: "RETAIL_POS"',
  'action: "read"',
  "if (!access.allowed)",
]) check(page.includes(marker), `Commercial control page missing module access guard ${marker}`);
check(page.includes("RetailCommercialWorkspace"), "Commercial control page must render the active structured workspace");
check(dashboard.includes('/enterprise-modules/RETAIL_POS/commercial'), "Shop readiness must expose the commercial control deep link");
for (const marker of [
  "commercial-permissions",
  "pricing/catalog",
  "pricing/conditions",
  "retail/promotions",
  "retail/returns",
  "refund-accounts",
  "canManagePricing",
  "canManagePromotions",
  "canCreateReturns",
  "canManageRefunds",
  'type="datetime-local"',
  'type="number"',
  "min-h-11",
  "overflow-x-auto",
]) check(ui.includes(marker), `Commercial UI missing ${marker}`);
check(!ui.includes("window.prompt("), "Active Shop 2 commercial UI must not use window.prompt");
check(!ui.includes("window.confirm("), "Active Shop 2 commercial UI must use structured controls rather than browser confirm dialogs");
check(!ui.includes("TODO"), "Active Shop 2 commercial UI must not contain TODO placeholders");
check(!ui.includes("placeholder action"), "Active Shop 2 commercial UI must not contain placeholder actions");

if (failures.length) {
  console.error("Shop 2 commercial UI QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 commercial UI QA passed.");
