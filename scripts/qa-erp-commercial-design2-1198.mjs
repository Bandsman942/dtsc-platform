import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const quoteService = read("lib/enterprise/crm-sales/quotes.ts");
const directOrder = read("lib/enterprise/crm-sales/orders.ts");
const quoteSchema = read("prisma/enterprise-crm-sales.prisma");
const controls = read("components/enterprise/professional/commercial-design2-controls.tsx");
const exports = read("components/enterprise/professional/finance-design2-controls.tsx");
const sharedRetail = read("components/enterprise/professional/retail-workspace-shared.tsx");
const telcoUi = read("components/enterprise/professional/telco-topups-workspace.tsx");
const routes = [
  ["CRM_CUSTOMERS", "app/api/enterprise/[organizationId]/business-parties/route.ts", "components/enterprise/professional/enterprise-customers-workspace.tsx"],
  ["CATALOG", "app/api/enterprise/[organizationId]/catalog/route.ts", "components/enterprise/professional/enterprise-catalog-workspace.tsx"],
  ["LEADS", "app/api/enterprise/[organizationId]/leads/route.ts", "components/enterprise/professional/enterprise-crm-workspace.tsx"],
  ["OPPORTUNITIES", "app/api/enterprise/[organizationId]/opportunities/route.ts", "components/enterprise/professional/enterprise-crm-workspace.tsx"],
  ["CONTRACTS", "app/api/enterprise/[organizationId]/contracts/route.ts", "components/enterprise/professional/enterprise-contracts-workspace.tsx"],
];
let count = 0;
const check = (label, actual, patterns) => {
  for (const pattern of patterns) assert.match(actual, pattern, label + " requires " + pattern);
  console.log("PASS", label); count += 1;
};
const absent = (label, actual, pattern) => {
  assert.doesNotMatch(actual, pattern, label + " forbids " + pattern);
  console.log("PASS", label); count += 1;
};

// This is a *runtime* Prisma Client validation incident from Vercel:
// nested EnterpriseQuoteItemCreateWithoutQuoteInput does not accept
// organizationId because the parent compound FK is already established.
const nestedQuote = quoteService.match(/create: calculatedItems\.map\(\(item\) => \(\{[\s\S]*?\}\)\),/)?.[0] || "";
const nestedConvertedOrder = quoteService.match(/create: quote\.items\.map\(\(item\) => \(\{[\s\S]*?\}\)\),/)?.[0] || "";
assert.ok(nestedQuote && nestedConvertedOrder, "Expected both quote -> lines and quote -> order nested creates");
absent("Quote creation must not pass tenant key into Prisma nested items.create", nestedQuote, /^\s*organizationId\s*,/m);
absent("Quote conversion must not pass tenant key into Prisma nested order lines", nestedConvertedOrder, /^\s*organizationId\s*,/m);
check("Tenant isolation stays on both parent create operations and canonical party/catalog checks", quoteService, [
  /enterpriseQuote\.create/, /enterpriseSalesOrder\.create/, /organizationId,/, /businessPartyId: input\.businessPartyId/,
  /catalogIds/, /transaction/,
]);
check("Generated Prisma schema has composite parent-to-child FK and prices/taxes", quoteSchema, [
  /model EnterpriseQuoteItem/, /@relation\(fields: \[organizationId, quoteId\]/,
  /model EnterpriseSalesOrderItem/, /@relation\(fields: \[organizationId, salesOrderId\]/,
  /discountAmount/, /lineTotal/, /taxAmount/,
]);
check("Direct sales order already follows the valid nested Prisma contract", directOrder, [
  /items: \{\s*create: input\.items\.map/, /lineSubtotal:/, /lineTotal:/,
]);
check("Design 2.0 shares real export services and accessible date/status controls", controls, [
  /FinanceDateFilter/, /FinanceExportControls/, /data-horizontal-rail/, /aria-pressed/,
  /CommercialDesign2Connections/, /focus-visible:ring/, /max-w-full/,
]);
check("Full filtered export reads paginated authenticated APIs, never just visible rows", exports, [
  /pageSize: "100"/, /for \(let start = 2; start <= pages/, /total > 1000/,
  /downloadProfessionalCsv/, /downloadProfessionalXlsx/, /downloadProfessionalPdf/,
]);
for (const [module, path, ui] of routes) {
  check(module + " date ranges are validated by server and applied before pagination", read(path), [
    /getEnterpriseCommonDomainAccess/, /financeBusinessDateRange\(req\)/,
    /createdAt: \{/, /dates\.from/, /dates\.to/, /organizationId/,
  ]);
  check(module + " UI has Design 2.0, exports and source links", read(ui), [
    /CommercialDesign2Controls/, /CommercialDesign2Connections/,
    /FinanceExportColumn/, /dateFrom/, /dateTo/, /ModuleWorkspace density="compact"/,
    /border-l-(?:emerald|sky|amber|indigo|slate)-500/,
  ]);
}
check("Telco History uses the complete canonical API rather than dashboard.recent", telcoUi, [
  /useProfessionalCollection<TelcoTopup>/,
  /\/retail\/telco-topups/, /CommercialDesign2Controls/,
  /CommercialDesign2Connections/, /dateFrom/, /dateTo/, /recordStatus/,
  /collection\.pagination\.total/, /collection\.items/,
]);
absent("Telco history must not treat dashboard sample as the source", telcoUi, /const items = dashboard\.recent\.topups \|\| \[\]/);
const telcoRoute = read("app/api/enterprise/[organizationId]/retail/telco-topups/route.ts");
check("Telco API date filters and masked phone remain server-side and tenant-scoped", telcoRoute, [
  /authorizeRetailRequest/, /financeBusinessDateRange\(req\)/,
  /effectiveFrom/, /effectiveTo/, /occurredAt: \{/, /destinationPhoneMasked/,
  /organizationId,/, /REVERSED/,
]);
check("Retail frame can refresh Telco history without affecting other Retail modules", sharedRetail, [
  /refreshKey,\s*mutate/, /moduleCode === "TELCO_TOPUPS" \? "compact"/,
  /border-l-sky-500/, /border-l-emerald-500/,
]);
const guide = read("docs/OWNER_E2E_1198_COMMERCIAL_DESIGN2.md");
check("Owner E2E includes critical business scenarios", guide, [
  /PrismaClientValidationError/, /DIMER/, /CSV/, /XLSX/, /PDF/,
  /multidevise/, /mobile/i, /CLIENT/, /APPROVER/, /E2E final/,
]);
console.log("ERP Commercial Design 2.0 #1198: " + count + " QA source contracts passed. These are NOT owner browser E2E.");
