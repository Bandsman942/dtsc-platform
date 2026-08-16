import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const catalogPairs = [
  ["locales/professional-erp.fr.json", "locales/professional-erp.en.json", "Professional ERP base"],
  ["locales/professional-erp-commercial.fr.json", "locales/professional-erp-commercial.en.json", "Professional ERP contracts"],
  ["locales/professional-erp-catalog.fr.json", "locales/professional-erp-catalog.en.json", "Professional ERP catalog"],
  ["locales/professional-erp-sales.fr.json", "locales/professional-erp-sales.en.json", "Professional ERP sales"],
];

for (const [frFile, enFile, label] of catalogPairs) {
  const fr = JSON.parse(read(frFile));
  const en = JSON.parse(read(enFile));
  const frKeys = Object.keys(fr).sort();
  const enKeys = Object.keys(en).sort();
  check(JSON.stringify(frKeys) === JSON.stringify(enKeys), `${label} must keep exact FR/EN key parity`);
  for (const key of frKeys) {
    check(typeof fr[key] === "string" && fr[key].trim().length > 0, `${label}: missing French copy for ${key}`);
    check(typeof en[key] === "string" && en[key].trim().length > 0, `${label}: missing English copy for ${key}`);
  }
}

const i18n = read("lib/i18n.ts");
for (const token of [
  'professionalErpFr from "@/locales/professional-erp.fr.json"',
  'professionalErpCommercialFr from "@/locales/professional-erp-commercial.fr.json"',
  'professionalErpCatalogFr from "@/locales/professional-erp-catalog.fr.json"',
  'professionalErpSalesFr from "@/locales/professional-erp-sales.fr.json"',
  "translateProfessionalErp",
  "ProfessionalErpKey",
]) check(i18n.includes(token), `Canonical Professional ERP i18n registration missing: ${token}`);

const helper = read("components/enterprise/professional/professional-erp-i18n.ts");
for (const token of [
  "MutationObserver",
  "document.documentElement.lang",
  "professionalErpMoney",
  "professionalErpDate",
  "professionalErpEnumLabel",
]) check(helper.includes(token), `Professional ERP locale helper missing contract: ${token}`);
check(helper.includes('locale === "en" ? "en-US" : "fr-FR"'), "Professional ERP formats must derive from the active locale");

const workspaces = [
  ["components/enterprise/professional/enterprise-customers-workspace.tsx", [
    "/business-parties",
    "/business-parties/duplicates",
    "/identity-link-invitations",
    "relationForRoles",
    "revision: edit.revision",
  ]],
  ["components/enterprise/professional/enterprise-crm-workspace.tsx", [
    "/professional-lookups?module=CRM_PIPELINE",
    "/leads",
    "/opportunities",
    "/transition",
    "/convert",
    "revision: item.revision",
  ]],
  ["components/enterprise/professional/enterprise-contracts-workspace.tsx", [
    "/professional-lookups?module=CONTRACTS",
    "/contracts",
    "/transition",
    "revision: contract.revision",
    '"SUBMIT"',
    '"APPROVE"',
    '"REQUEST_CORRECTION"',
    '"ACTIVATE"',
    '"RENEW"',
    '"TERMINATE"',
  ]],
  ["components/enterprise/professional/enterprise-catalog-workspace.tsx", [
    "/catalog",
    "/catalog-categories",
    "/units-of-measure",
    "revision: edit.revision",
    "trackInventory",
    "taxable",
  ]],
  ["components/enterprise/professional/enterprise-sales-operations-workspace.tsx", [
    "/professional-lookups?module=SALES_QUOTES_ORDERS",
    "/catalog-items?page=1&pageSize=200&status=ACTIVE",
    "/quotes",
    "/sales-orders",
    "/transition",
    "/convert",
    "/fulfill",
    'fulfillmentType: "PRODUCT_DELIVERY"',
    "idempotencyKey: crypto.randomUUID()",
    "revision: fulfillTarget.revision",
  ]],
];

for (const [file, contracts] of workspaces) {
  const source = read(file);
  check(source.includes("useProfessionalErpLocale"), `${file} must use the canonical Professional ERP locale hook`);
  check(source.includes("professionalErpT"), `${file} must use canonical Professional ERP copy`);
  check(source.includes('locale === "en" ? definition.descriptionEn : definition.descriptionFr'), `${file} module description must be locale-aware`);
  check(!source.includes('new Intl.NumberFormat("fr-FR"'), `${file} must not hardcode fr-FR number formatting`);
  check(!source.includes('new Intl.DateTimeFormat("fr-FR"'), `${file} must not hardcode fr-FR date formatting`);
  check(!source.includes('toLocaleDateString("fr-FR")'), `${file} must not hardcode fr-FR date rendering`);
  for (const contract of contracts) check(source.includes(contract), `${file} business contract must remain intact: ${contract}`);
}

const customers = read("components/enterprise/professional/enterprise-customers-workspace.tsx");
check(!customers.includes("const ROLE_LABELS"), "Customers must not keep a local role-label dictionary");
check(!customers.includes("const IDENTITY_STATUS_LABELS"), "Customers must not keep a local identity-status dictionary");
check(customers.includes('professionalErpEnumLabel(locale, "role"'), "Customers must project role codes through canonical labels");
check(customers.includes('professionalErpEnumLabel(locale, "identityStatus"'), "Customers must project identity statuses through canonical labels");

const crm = read("components/enterprise/professional/enterprise-crm-workspace.tsx");
check(!crm.includes("const OPPORTUNITY_LABELS"), "CRM must not keep a local opportunity-stage dictionary");
check(!crm.includes("const LEAD_LABELS"), "CRM must not keep a local lead-status dictionary");
check(crm.includes('professionalErpEnumLabel(locale, "opportunityStage"'), "CRM stages must be projected canonically");
check(crm.includes('locale === "en" ? department.labelEn : department.labelFr'), "CRM department selectors must use the active language");

const contracts = read("components/enterprise/professional/enterprise-contracts-workspace.tsx");
check(!contracts.includes("const STATUS_LABELS"), "Contracts must not keep a local status dictionary");
check(!contracts.includes("const APPROVAL_STATUS_LABELS"), "Contracts must not keep a local approval-status dictionary");
check(contracts.includes('professionalErpEnumLabel(locale, "contractType"'), "Contract types must be projected canonically");
check(contracts.includes('professionalErpEnumLabel(locale, "approvalStatus"'), "Contract approvals must be projected canonically");

const catalog = read("components/enterprise/professional/enterprise-catalog-workspace.tsx");
check(catalog.includes('professionalErpEnumLabel(locale, "itemType"'), "Catalog item types must be projected canonically");
check(catalog.includes('professionalErpEnumLabel(locale, "unitCategory"'), "Catalog unit categories must not be rendered as raw enums");
check(catalog.includes("professionalErpDate(price.effectiveFrom, locale)"), "Catalog price history dates must be locale-aware");

const sales = read("components/enterprise/professional/enterprise-sales-operations-workspace.tsx");
check(!sales.includes("QUOTE_STATUS_LABELS"), "Sales must not keep a local quote-status dictionary");
check(!sales.includes("ORDER_STATUS_LABELS"), "Sales must not keep a local order-status dictionary");
check(sales.includes('professionalErpEnumLabel(locale, "status"'), "Sales quote/order statuses must be projected canonically");
check(sales.includes("professionalErpDate(quote.validUntil, locale)"), "Sales quote validity must be locale-aware");

const runner = read("scripts/run-regression-qa-ci.mjs");
check(runner.includes("qa-professional-commercial-i18n-330.mjs"), "#330 QA must be integrated into Regression QA");

if (failures.length) {
  console.error("Issue #330 Professional ERP commercial i18n QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Issue #330 Professional ERP commercial i18n QA passed: FR/EN catalog parity, reactive locale projection and CRM/customers/contracts/catalog/sales business contracts remain intact.");
