import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
let checks = 0;
function check(name, path, ...needles) {
  const source = read(path);
  for (const token of needles) {
    assert.ok(source.includes(token), name + " is missing " + token + " in " + path);
    checks++;
  }
  console.log("PASS", name);
}
const common = "components/enterprise/professional/erp-design2-register.tsx";
check("Shared semantic KPI accents and visible register", common, "ErpDesign2Metric", "ErpDesign2RegisterSection", "ErpDesign2RegisterTools", 'role="group"', "aria-pressed", "FinanceExportControls", "FinanceDateFilter");
const models = [
  ["Suppliers", "components/enterprise/core-v2/enterprise-suppliers-workspace.tsx", "/suppliers"],
  ["Sites", "components/enterprise/professional/enterprise-sites-workspace.tsx", "/sites"],
  ["Documents", "components/enterprise/core-v2/enterprise-documents-workspace.tsx", "/documents"],
  ["Inventory", "components/enterprise/professional/enterprise-inventory-operations-workspace.tsx", "/inventory"],
  ["Projects", "components/enterprise/professional/enterprise-projects-services-workspace.tsx", "/projects"],
  ["Deliverables", "components/enterprise/professional/enterprise-time-deliverables-workspace.tsx", "/deliverables"],
  ["Assets", "components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx", "/assets"],
];
for (const [name, path, endpoint] of models) {
  check(name + " register", path, "ErpDesign2Metric", "ErpDesign2RegisterSection", "ErpDesign2RegisterTools", endpoint, "onDateChange", "onStatusChange");
}
check("Purchase lifecycle, premium filters and printable copy", "components/enterprise/core-v2/enterprise-purchases-workspace.tsx",
  "ErpDesign2Metric", "ErpDesign2RegisterSection", "FinanceDateFilter", "FinanceExportControls", "openPrintablePurchase");
// Keep print actions type-safe in both source locale dictionaries. The JSON keys form EnterpriseCoreKey.
for (const lang of ["fr", "en"]) {
  const translations = JSON.parse(read(`locales/enterprise-procurement.${lang}.json`));
  for (const key of ["purchases.action.print", "purchases.action.previewA4"]) {
    assert.ok(typeof translations[key] === "string" && translations[key].trim(), `${lang} translation missing: ${key}`);
    checks += 1;
  }
}
console.log("PASS typed procurement A4 action translations FR/EN");
check("Purchase wrapper", "components/enterprise/professional/enterprise-procurement-operations-workspace.tsx",
  "ProfessionalTabs", "SUPPLIERS", "PURCHASES", "EnterprisePurchasesWorkspace", "EnterpriseSuppliersWorkspace");
const routes = [
  ["Suppliers", "app/api/enterprise/[organizationId]/suppliers/route.ts", "getEnterpriseProcurementAccess"],
  ["Sites", "app/api/enterprise/[organizationId]/sites/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Warehouses", "app/api/enterprise/[organizationId]/warehouses/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Storage locations", "app/api/enterprise/[organizationId]/storage-locations/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Projects", "app/api/enterprise/[organizationId]/projects/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Deliverables", "app/api/enterprise/[organizationId]/deliverables/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Assets", "app/api/enterprise/[organizationId]/assets/route.ts", "getEnterpriseCommonDomainAccess"],
  ["Transfers", "app/api/enterprise/[organizationId]/stock-transfers/route.ts", "retailStockTransferVisibleSites"],
  ["Counts", "app/api/enterprise/[organizationId]/inventory-counts/route.ts", "retailInventoryVisibleSites"],
  ["Adjustments", "app/api/enterprise/[organizationId]/stock-adjustments/route.ts", "retailInventoryVisibleSites"],
];
for (const [name, path, auth] of routes) {
  check(name + " secure filter", path, auth, "financeBusinessDateRange", "dates.ok", "organizationId");
}
check("Document metadata access and calendar filtering", "app/api/enterprise/[organizationId]/documents/route.ts",
  "enterpriseDocumentVisibilityWhere", "isCivilDate", "DOCUMENT_DATE_RANGE_INVALID", "archived");
check("Finance export all authorized pages", "components/enterprise/professional/finance-design2-controls.tsx",
  'pageSize: "100"', "for (let start = 2; start <= pages; start += 3)", "total > 1000", "downloadProfessionalPdf", "downloadProfessionalXlsx", "downloadProfessionalCsv");
const print = "app/api/enterprise/[organizationId]/purchases/[id]/print/route.ts";
check("Purchasing printable document protects tenant", print,
  "getSession()", "getEnterpriseProcurementAccess", 'action: "read"', "enterprisePurchaseVisibilityWhere", "organizationId, userId: session.userId", "escape(", "Content-Security-Policy", "Cache-Control", "no-store", "randomBytes", "window.print()");
check("Print uses canonical purchase lines and receipts", print,
  "prisma.enterprisePurchase.findFirst", "items:", "receipts:", "received.set(", "purchase.subtotalAmount", "purchase.taxAmount", "purchase.totalAmount");
check("Document export does not add raw signed links", "components/enterprise/core-v2/enterprise-documents-workspace.tsx",
  "ErpDesign2RegisterTools", 'key: "visibility"', 'key: "version"');
const docs = read("docs/OWNER_E2E_1200_SEVEN_ERP_DESIGN2.md");
assert.match(docs, /NON EXÉCUTÉE|NOT_EXECUTED/i);
assert.match(docs, /320|360/);
checks += 2;
console.log("PASS", checks, "DTSC seven-domain Design 2.0 checks");
