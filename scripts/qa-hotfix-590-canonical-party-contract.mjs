import fs from "node:fs";
await import("./qa-prisma-canonical-party-runtime.mjs");

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };

const masterService = read("lib/enterprise/master-data/service.ts");
const businessPartyRoute = read("app/api/enterprise/[organizationId]/business-parties/route.ts");
const commonHttp = read("lib/enterprise/common/http.ts");
const supplierService = read("lib/enterprise/procurement/supplier-service.ts");
const supplierSync = read("lib/enterprise/procurement/supplier-party-sync.ts");
const supplierRoute = read("app/api/enterprise/[organizationId]/suppliers/route.ts");
const supplierLinkRoute = read("app/api/enterprise/[organizationId]/suppliers/[id]/link-party/route.ts");
const backfill = read("scripts/backfill-enterprise-supplier-parties.mjs");
const partySchema = read("prisma/enterprise-master-data.prisma");
const procurementLinks = read("prisma/enterprise-procurement-links.prisma");
const customerWorkspace = read("components/enterprise/professional/enterprise-customers-workspace-v2.tsx");
const aiContract = read("lib/ai/tools/erp-contract.ts");
const aiExecutor = read("lib/ai/tools/executors/erp.ts");

function between(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

const partyCreate = between(masterService, "export async function createEnterpriseBusinessParty", "export async function createEnterpriseCatalogItem");
ok(partyCreate.includes("enterpriseBusinessParty.create"), "Tiers: création canonique absente.");
ok(partyCreate.includes("organizationId,"), "Tiers: organizationId doit rester sur la création parent.");
for (const child of ["roles: {", "contacts: {", "addresses: {"]) {
  const block = between(partyCreate, child, child === "roles: {" ? "contacts: {" : child === "contacts: {" ? "addresses: {" : "include:");
  ok(block && !block.includes("organizationId,"), `Tiers: ${child} ne doit jamais renvoyer organizationId dans un nested create Prisma.`);
}

ok(commonHttp.includes("reportUnexpectedEnterpriseError"), "Erreurs: diagnostic interne sûr absent.");
ok(commonHttp.includes("{ status: 500 }"), "Erreurs: un défaut interne doit être HTTP 500 et non une validation 400.");
ok(commonHttp.includes("Vos saisies sont conservées"), "Erreurs: la saisie doit être explicitement conservée.");
const fallback = commonHttp.slice(commonHttp.lastIndexOf("reportUnexpectedEnterpriseError"));
ok(!fallback.includes("vérifiez les champs obligatoires"), "Erreurs: un défaut interne ne doit plus accuser les champs obligatoires.");
ok(commonHttp.includes("Do not log the raw Prisma message"), "Erreurs: le garde-fou anti-PII des logs Prisma doit rester explicite.");

for (const marker of ["ensureSupplierCanonicalPartyTx", "syncCanonicalPartyFromSupplierTx", "syncSupplierRoleStatusTx", "enterpriseSupplierPartyLink"]) {
  ok((supplierService + supplierSync).includes(marker), `Procurement: convergence canonique manquante ${marker}.`);
}
ok(supplierSync.includes('roleCode: "SUPPLIER"'), "Procurement: le rôle SUPPLIER canonique doit être matérialisé.");
ok(supplierSync.includes("enterpriseBusinessParty.create"), "Procurement: création du tiers canonique absente.");
ok(supplierSync.includes("enterpriseSupplierPartyLink.create"), "Procurement: lien fournisseur/tiers absent.");
ok(supplierSync.includes('status: "ACTIVE"'), "Procurement: un nouveau tiers canonique doit exister indépendamment de l’état Procurement.");
ok(!supplierSync.includes('supplier.status === "SUSPENDED" ? "INACTIVE"'), "Procurement: la suspension fournisseur ne doit pas désactiver le tiers partagé.");
ok(backfill.includes("supplierRoleStatus"), "Backfill: le statut doit être porté par le rôle SUPPLIER.");
ok(backfill.includes('status: "ACTIVE"'), "Backfill: le tiers partagé ne doit pas être désactivé par Procurement.");

ok(businessPartyRoute.includes('moduleCode: "CRM_CUSTOMERS"') && businessPartyRoute.includes('action: "write"'), "RBAC: Tiers doit conserver son accès CRM_CUSTOMERS write.");
ok(supplierRoute.includes('moduleCode: "SUPPLIERS_PURCHASES"') && supplierRoute.includes('action: "write"'), "RBAC: Fournisseurs doit conserver son accès SUPPLIERS_PURCHASES write.");
ok(supplierLinkRoute.includes("convergeEnterpriseSupplierParty"), "Procurement: la route de liaison doit passer par la convergence canonique.");
ok(businessPartyRoute.includes("refreshLinkedSupplierSnapshotFromParty"), "Inter-modules: les snapshots Procurement liés doivent suivre le tiers canonique.");

for (const marker of ["model EnterpriseBusinessParty", "model EnterpriseBusinessPartyRole", "model EnterpriseBusinessPartyContact", "model EnterpriseBusinessPartyAddress"]) {
  ok(partySchema.includes(marker), `Prisma: modèle canonique manquant ${marker}.`);
}
for (const marker of ["model EnterpriseSupplierPartyLink", "@@unique([organizationId, supplierId])", "@@unique([organizationId, businessPartyId])"]) {
  ok(procurementLinks.includes(marker), `Prisma: contrat 1:1 fournisseur/tiers manquant ${marker}.`);
}

for (const marker of ['presentation="editor"', 'form="customer-create-form"', "ProfessionalFormSection", "ProfessionalError"]) {
  ok(customerWorkspace.includes(marker), `UX Tiers: contrat formulaire DTSC manquant ${marker}.`);
}

ok(aiContract.includes('code: "ERP_CUSTOMERS_READ"') && aiContract.includes('moduleCode: "CRM_CUSTOMERS"'), "IA: ERP_CUSTOMERS_READ doit rester lié statiquement à CRM_CUSTOMERS.");
ok(aiContract.includes('code: "ERP_PROCUREMENT_READ"') && aiContract.includes('moduleCode: "SUPPLIERS_PURCHASES"'), "IA: ERP_PROCUREMENT_READ doit rester lié statiquement à SUPPLIERS_PURCHASES.");
const procurementExecutor = between(aiExecutor, "async function procurement", "async function documents");
ok(procurementExecutor.includes("getEnterpriseProcurementAccess") && procurementExecutor.includes('moduleCode: "SUPPLIERS_PURCHASES"'), "IA: la lecture Procurement doit rester réautorisée par le domaine.");
const customersExecutor = between(aiExecutor, "async function customers", "async function catalog");
ok(customersExecutor.includes('commonAccess(context, organizationId, "CRM_CUSTOMERS")'), "IA: la lecture Tiers doit rester réautorisée par CRM_CUSTOMERS.");
ok(!aiExecutor.includes("prisma["), "IA: aucun accès Prisma dynamique par nom de modèle n’est autorisé.");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL HOTFIX #590: ${failure}`);
  process.exit(1);
}
console.log("PASS HOTFIX #590: Tiers, Procurement, RBAC, IA, Prisma et UX respectent le contrat canonique.");
