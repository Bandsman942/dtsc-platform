import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const targets = [
  "components/enterprise/core-v2/enterprise-documents-workspace.tsx",
  "components/enterprise/core-v2/enterprise-suppliers-workspace.tsx",
  "components/enterprise/core-v2/enterprise-purchases-workspace.tsx",
  "components/enterprise/core-v2/enterprise-reports-workspace.tsx",
];

const procurementFr = JSON.parse(read("locales/enterprise-procurement.fr.json"));
const procurementEn = JSON.parse(read("locales/enterprise-procurement.en.json"));
const frKeys = Object.keys(procurementFr).sort();
const enKeys = Object.keys(procurementEn).sort();
check(JSON.stringify(frKeys) === JSON.stringify(enKeys), "Enterprise procurement/Core fragment must keep exact FR/EN key parity");
for (const key of frKeys) {
  check(typeof procurementFr[key] === "string" && procurementFr[key].trim().length > 0, `Missing French procurement/Core copy for ${key}`);
  check(typeof procurementEn[key] === "string" && procurementEn[key].trim().length > 0, `Missing English procurement/Core copy for ${key}`);
}

for (const file of targets) {
  const source = read(file);
  check(source.includes("enterpriseCoreT"), `${file} must use the canonical Enterprise Core translator`);
  check(!/const\s+en\s*=/.test(source), `${file} must not keep a local en switch`);
  check(!/locale\s*===\s*["']en["']\s*\?\s*["'`]/.test(source), `${file} still contains a local locale===en customer-copy ternary`);
  check(!/\ben\s*\?\s*["'`]/.test(source), `${file} still contains a local en customer-copy ternary`);
  check(!source.includes('"en-GB"') && !source.includes('"fr-FR"') && !source.includes('"en-US"'), `${file} must not hardcode visible Intl locales`);
}

const i18nHelper = read("lib/enterprise-core-i18n.ts");
check(i18nHelper.includes('import enterpriseProcurementFr from "@/locales/enterprise-procurement.fr.json"'), "Enterprise Core translator must compose the procurement FR fragment");
check(i18nHelper.includes('import enterpriseProcurementEn from "@/locales/enterprise-procurement.en.json"'), "Enterprise Core translator must compose the procurement EN fragment");
check(i18nHelper.includes("type EnterpriseProcurementCoreKey"), "Enterprise Core translator must expose procurement fragment keys through its canonical key union");

const ui = read("components/enterprise/core-v2/erp-v2-ui.tsx");
check(ui.includes("export function formatEnterpriseAmount"), "Enterprise UI primitives must expose the canonical locale-aware amount formatter");
check(ui.includes("new Intl.NumberFormat(enterpriseCoreIntlLocale(locale)"), "Enterprise amount formatter must use the canonical Intl locale helper");

const documents = read("components/enterprise/core-v2/enterprise-documents-workspace.tsx");
check(!documents.includes("visibilityChoicesFr") && !documents.includes("visibilityChoicesEn"), "Documents must not keep parallel FR/EN visibility arrays");
check(!documents.includes('replaceAll("_", " ")'), "Documents must not derive customer labels from raw document enum codes");
check(!documents.includes('replace("Enterprise", "")'), "Documents must not derive link-target labels from technical entity names");
check(documents.includes('localizedChoice(locale, "documents.visibility"'), "Document visibility choices must come from canonical i18n");
check(documents.includes('localizedChoice(locale, "documents.type"'), "Document type choices must come from canonical i18n");
check(documents.includes('localizedChoice(locale, "documents.target"'), "Document link target choices must come from canonical i18n");
check(documents.includes("documentTypeLabel(locale, item.documentType)"), "Document list must project document type through a localized label");
check(documents.includes("visibilityLabel(locale, item.visibility)"), "Document list must project visibility through a localized label");
for (const contract of [
  "/documents/${document.id}/links",
  "/documents/${uploadTarget.id}/versions",
  "/documents/${linkTarget.id}/links",
  "/documents/${item.id}/download",
]) check(documents.includes(contract), `Documents contract must remain intact: ${contract}`);

const suppliers = read("components/enterprise/core-v2/enterprise-suppliers-workspace.tsx");
check(!suppliers.includes("identityLabels"), "Suppliers must not keep a French-only identity status dictionary");
check(!suppliers.includes("supplierStatusLabel"), "Suppliers must use the canonical status label helper");
check(suppliers.includes("identityStatusLabel(locale, item.identityLink.status)"), "Supplier identity state must be localized in list projections");
check(suppliers.includes("statusLabel(locale, item.status)"), "Supplier business status must use canonical localized status labels");
check(suppliers.includes("/identity-link-invitations"), "Supplier identity invitation endpoint must remain intact");
check(suppliers.includes('relationType: "SUPPLIER_REPRESENTATIVE"'), "Supplier representative relation contract must remain intact");
check(suppliers.includes("supplierContactId: contact.id"), "Supplier contact identity-link contract must remain intact");

const purchases = read("components/enterprise/core-v2/enterprise-purchases-workspace.tsx");
check(!purchases.includes("priorityChoicesEn") && !purchases.includes("priorityChoicesFr"), "Purchases must not use parallel FR/EN priority arrays");
check(!purchases.includes("new Intl.NumberFormat"), "Purchases must not keep a local currency formatter");
check(purchases.includes("formatEnterpriseAmount"), "Purchases must use the canonical locale-aware amount formatter");
check(purchases.includes("items={priorityChoices(locale)}"), "Purchase form must use canonical locale-aware priority choices");
check(purchases.includes("/purchases/${receiveTarget.id}/receive"), "Purchase receipt endpoint must remain intact");
check(purchases.includes("/purchases/${item.id}/actions"), "Purchase action endpoint must remain intact");
check(purchases.includes("/enterprise-modules/FINANCE_BUDGETS?purchaseId=${encodeURIComponent(item.id)}"), "Purchase to Finance expense deep-link must remain intact");
for (const action of ["SUBMIT", "ORDER", "CLOSE", "CANCEL"]) check(purchases.includes(`\"${action}\"`), `Purchase action code must remain intact: ${action}`);

const reports = read("components/enterprise/core-v2/enterprise-reports-workspace.tsx");
check(!/const\s+fr\s*:\s*Record/.test(reports), "Reports must not keep a local French label dictionary");
check(!reports.includes("enLabels"), "Reports must not keep a local English label dictionary");
check(!reports.includes("label(en"), "Reports must not use the legacy local report label switch");
check(reports.includes("reportTypeLabel(locale, item.code)"), "Report catalog type must be localized");
check(reports.includes("reportFamilyLabel(locale, item.family)"), "Report catalog family must be localized");
check(reports.includes("reportSourceLabel(locale, item.sourcePolicyCode)"), "Report source policy must be projected through a business label");
check(reports.includes("reportFreshnessLabel(locale, item.freshnessPolicyCode)"), "Report freshness policy must be projected through a business label");
check(reports.includes("reportMetricLabel(locale, metric.code)"), "Report metric codes must be projected through business labels");
check(reports.includes("reportVisibilityLabel(locale, view.visibility)"), "Saved report view visibility must be localized");
check(reports.includes("<SnapshotView value={detail.report.snapshotJson} locale={locale} />"), "Snapshot view must receive locale explicitly");
check(!reports.includes("<StatusBadge tone=\"info\">{item.family}</StatusBadge>"), "Raw report family code must not render");
check(!reports.includes("view.isFavorite ?") || reports.includes("reportVisibilityLabel(locale, view.visibility)"), "Saved report view must not render raw visibility");
for (const contract of [
  "/reports/generate",
  "/reports/views",
  "/reports/${item.id}/actions",
  "/reports/${item.id}/export",
]) check(reports.includes(contract), `Reports contract must remain intact: ${contract}`);

for (const key of [
  "documents.visibility.ORGANIZATION",
  "documents.visibility.DEPARTMENT",
  "documents.visibility.RESTRICTED",
  "documents.type.PURCHASE_ORDER",
  "documents.target.EnterprisePurchase",
  "suppliers.identity.USER_CONSENT_REQUIRED",
  "suppliers.identity.ORGANIZATION_APPROVAL_REQUIRED",
  "purchases.action.expense",
  "reports.type.BUDGET_VS_ACTUAL",
  "reports.type.EXPENSE_SUMMARY",
  "reports.type.PROCUREMENT_SUMMARY",
  "reports.type.FINANCE_OVERVIEW",
  "reports.source.CANONICAL_BUDGET_AND_APPROVED_EXPENSES",
  "reports.source.APPROVED_EXPENSES_ONLY",
  "reports.source.CANONICAL_PURCHASES",
  "reports.source.CANONICAL_FINANCE_AGGREGATION",
  "reports.freshness.REQUEST_TIME",
  "reports.metric.BUDGET_PLANNED",
  "reports.metric.PURCHASE_TOTAL",
  "status.GENERATED",
]) {
  check(typeof procurementFr[key] === "string" && typeof procurementEn[key] === "string", `Canonical #315 key missing in FR/EN: ${key}`);
}

const runner = read("scripts/run-regression-qa-ci.mjs");
check(runner.includes("qa-enterprise-documents-procurement-reports-i18n-315.mjs"), "#315 QA must be integrated into Regression QA");

for (const tempFile of [
  ".github/workflows/tmp-315-enterprise-procurement-i18n.yml",
  "scripts/tmp-315-enterprise-procurement-i18n-codemod.mjs",
]) {
  check(!fs.existsSync(path.join(root, tempFile)), `Temporary #315 artifact must not remain in final branch: ${tempFile}`);
}

if (failures.length) {
  console.error("Issue #315 Enterprise documents/procurement/reports i18n QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Issue #315 Enterprise documents/procurement/reports i18n QA passed: customer copy is canonical FR/EN, Intl formatting is shared, technical codes are projected through business labels, and protected Documents/Procurement/Reporting contracts remain intact.");
