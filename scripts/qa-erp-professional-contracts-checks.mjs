import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`Absent: ${file}`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
};
const need = (content, marker, scope) => {
  if (!content.includes(marker)) failures.push(`${scope}: ${marker}`);
};

const ui = read("components/enterprise/professional/enterprise-contracts-workspace-v2.tsx");
const canonicalCustomers = read("components/enterprise/professional/enterprise-customers-workspace.tsx");
const canonicalCrm = read("components/enterprise/professional/enterprise-crm-workspace.tsx");
const canonicalCatalog = read("components/enterprise/professional/enterprise-catalog-workspace.tsx");
const canonicalContracts = read("components/enterprise/professional/enterprise-contracts-workspace.tsx");
const customers = read("components/enterprise/professional/enterprise-customers-workspace-v2.tsx");
const crm = read("components/enterprise/professional/enterprise-crm-workspace-v2.tsx");
const catalog = read("components/enterprise/professional/enterprise-catalog-workspace-v2.tsx");
const sales = read("components/enterprise/professional/enterprise-sales-operations-workspace.tsx");
const lookups = read("app/api/enterprise/[organizationId]/professional-lookups/route.ts");
const catalogRoute = read("app/api/enterprise/[organizationId]/catalog/route.ts");
const fr = JSON.parse(read("locales/professional-erp-commercial.fr.json") || "{}");
const en = JSON.parse(read("locales/professional-erp-commercial.en.json") || "{}");
const service = read("lib/enterprise/crm-sales/contracts.ts");
const route = read("app/api/enterprise/[organizationId]/contracts/[contractId]/transition/route.ts");

for (const [key, frValue, enValue] of [
  ["contracts.tabDrafts", "Brouillons", "Drafts"],
  ["contracts.metricPending", "En attente de validation", "Pending approval"],
  ["contracts.metricExpiring", "À renouveler bientôt", "Expiring soon"],
  ["contracts.submit", "Soumettre", "Submit"],
  ["contracts.terminate", "Résilier", "Terminate"],
]) {
  need(ui, `t(\"${key}\")`, "UI contrats — clé i18n");
  if (fr[key] !== frValue) failures.push(`Catalogue contrats FR: ${key}`);
  if (en[key] !== enValue) failures.push(`Catalogue contrats EN: ${key}`);
}
for (const marker of ["transitionEnterpriseContract", "enterpriseApproval", "revision", "resolveContractBusinessParty", "enterpriseSupplierPartyLink", "organizationMemberId", "COLLABORATOR", "EMPLOYEE", "SUPPLIER"]) need(service, marker, "Service contrats");
for (const marker of ["contractTransitionSchema", "notifyUser", "section=validation"]) need(route, marker, "Route contrats");
for (const marker of ["employee:", "supplier:", "member:", "contractParties", "businessPartyId", '"SALES_QUOTES_ORDERS"', "currencies", "taxCodes"]) need(lookups, marker, "Sélecteurs commerciaux");

need(canonicalCustomers, "enterprise-customers-workspace-v2", "Routage Tiers");
need(canonicalCrm, "enterprise-crm-workspace-v2", "Routage CRM");
need(canonicalCatalog, "enterprise-catalog-workspace-v2", "Routage Catalogue");
need(canonicalContracts, "enterprise-contracts-workspace-v2", "Routage Contrats");
for (const [name, source] of [["Tiers", customers], ["CRM", crm], ["Catalogue", catalog], ["Contrats", ui]]) {
  need(source, 'presentation="editor"', `${name} — formulaire guidé`);
  if (source.includes("window.prompt")) failures.push(`${name}: window.prompt interdit`);
}
for (const marker of ["useToastMessage", "openEdit", "setDetail(null)"]) need(ui, marker, "Contrats — feedback/navigation");
need(ui, "contractTerminationInfo", "Contrats — motif informatif");
need(ui, "confirmArchiveTitle", "Contrats — confirmation archivage");
need(catalog, "taxChoices", "Catalogue — taxes tenant-scoped");
for (const marker of ["tenantUnitCategories", 'id: "__NEW__"', "unitCategoryCustom", "unitCategoryRequired"]) need(catalog, marker, "Catalogue — familles d’unité tenant-defined");
if (catalog.includes("COMMERCIAL_UNIT_CATEGORIES")) failures.push("Catalogue: taxonomie globale artificielle de familles d’unité interdite");
need(catalogRoute, "catalogTaxCodeExists", "Catalogue — revalidation serveur taxe");
need(catalogRoute, "organizationId, code: taxCode, isActive: true", "Catalogue — isolation taxe");
for (const marker of ["/professional-lookups?module=SALES_QUOTES_ORDERS", "/catalog?${params.toString()}", "if (!response.ok", "fulfillmentKey", "idempotencyKey: fulfillmentKey", "quoteActionTarget", 'presentation="editor"']) need(sales, marker, "Devis/commandes #549");
if (sales.includes("/catalog-items?page=1&pageSize=200")) failures.push("Devis/commandes: ancienne route catalogue inexistante encore utilisée");
if (sales.includes("idempotencyKey: crypto.randomUUID()")) failures.push("Devis/commandes: clé d’idempotence régénérée pendant la soumission");

if (failures.length) {
  console.error(failures.map((failure) => `❌ ${failure}`).join("\n"));
  process.exit(1);
}
console.log("✅ Hotfix ERP commercial #549 vérifié : routage guidé, lookups tenant-scoped, familles d’unité tenant-defined, taxes, confirmations, idempotence et transitions serveur.");
