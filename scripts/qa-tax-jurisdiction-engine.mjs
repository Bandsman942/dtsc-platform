import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failed = [];
const requireMarker = (file, marker, hint) => {
  if (!read(file).includes(marker)) failed.push(hint || `Missing ${marker} in ${file}`);
};

const prisma = read("prisma/enterprise-accounting.prisma");
for (const field of ["sourceTemplateCode", "sourceTemplateVersion", "autoApply", "taxTreatment", "taxRateApplied", "taxJurisdiction", "taxTemplateVersion"]) {
  if (!prisma.includes(field)) failed.push(`Missing persisted fiscal field: ${field}`);
}
for (const migration of [
  "prisma/migrations/20261112163000_tax_jurisdiction_catalog/migration.sql",
  "prisma/migrations/20261112164000_tax_invoice_snapshots/migration.sql",
]) if (!fs.existsSync(path.join(root, migration))) failed.push(`Additive migration missing: ${migration}`);

const ui = "components/enterprise/professional/enterprise-finance-advanced-workspace.tsx";
for (const marker of ["TaxCatalogPanel", "TaxCountryField", "TAX_CATEGORIES", "detail.rates", "detail.payableAccount", "detail.recoverableAccount", "detail.sourceTemplateCode"]) {
  requireMarker(ui, marker, `Tax workspace missing professional field: ${marker}`);
}
requireMarker("components/enterprise/enterprise-administration-module.tsx", "EnterpriseFiscalSettingsPanel");
requireMarker("components/enterprise/professional/enterprise-fiscal-settings-panel.tsx", "automaticSalesTaxEnabled");
requireMarker("lib/enterprise/accounting/tax-engine.ts", "automaticSalesTaxEnabled");
requireMarker("lib/enterprise/accounting/tax-engine.ts", 'taxTreatment: "STANDARD"');
requireMarker("lib/enterprise/accounting/tax-engine.ts", 'autoApply: true');
requireMarker("lib/enterprise/accounting/tax-engine.ts", "siteId");
requireMarker("lib/enterprise/retail/commercial-engine.ts", "resolveDefaultSalesTaxesForRetail");
requireMarker("lib/enterprise/accounting/receivables-service.ts", "resolveDefaultSalesTaxes(tx");
requireMarker("lib/enterprise/accounting/receivables-service.ts", "taxRateApplied: item.taxRateApplied");
requireMarker("lib/enterprise/accounting/receivables-service.ts", "taxJurisdiction: item.taxJurisdiction");
requireMarker("lib/enterprise/accounting/receivables-service.ts", "taxTemplateVersion: item.taxTemplateVersion");

const taxApi = read("app/api/enterprise/[organizationId]/taxes/route.ts");
if (taxApi.includes("...(status ? { status } : {})")) failed.push("Tax API cannot filter by nonexistent status field.");
requireMarker("app/api/enterprise/[organizationId]/taxes/catalog/route.ts", 'authorizeFinanceRequest(req, organizationId, "FINANCE_TAX"');
requireMarker("app/api/enterprise/[organizationId]/taxes/catalog/route.ts", "countryCode !== template.jurisdiction");
requireMarker("app/api/enterprise/[organizationId]/taxes/catalog/route.ts", "writeAuditLog");
requireMarker("lib/enterprise/accounting/tax-catalog.ts", "verifiedAt");
requireMarker("lib/enterprise/accounting/tax-jurisdictions.ts", "Intl.DisplayNames");
requireMarker("lib/enterprise/accounting/finance-domain-schemas.ts", "z.enum(TAX_CATEGORIES)");

const labels = read("components/enterprise/professional/finance-professional-ui.ts");
for (const category of ["VAT", "SALES_TAX", "GST", "EXCISE", "WITHHOLDING", "STAMP_DUTY", "CUSTOMS", "ENVIRONMENTAL", "TOURISM", "LOCAL_LEVY"]) {
  const key = new RegExp(`\\b${category}:\\s*"`, "g");
  if ((labels.match(key) || []).length < 2) failed.push(`Missing bilingual label for ${category}`);
}
if (failed.length) {
  console.error("Tax fiscal integration QA failed:\n" + failed.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}
console.log("Tax fiscal integration static contract QA passed (not a substitute for authenticated E2E).");
