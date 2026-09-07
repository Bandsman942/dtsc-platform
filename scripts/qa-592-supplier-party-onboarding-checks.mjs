import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };

const customerWorkspace = read("components/enterprise/professional/enterprise-customers-workspace-v2.tsx");
const supplierWorkspace = read("components/enterprise/core-v2/enterprise-suppliers-workspace.tsx");
const sharedIdentity = read("components/enterprise/shared/business-party-identity-fields.tsx");
const onboardingService = read("lib/enterprise/procurement/supplier-onboarding-service.ts");
const onboardingRoute = read("app/api/enterprise/[organizationId]/suppliers/onboarding/route.ts");
const optionsRoute = read("app/api/enterprise/[organizationId]/suppliers/party-options/route.ts");
const supplierRoute = read("app/api/enterprise/[organizationId]/suppliers/route.ts");
const aiContract = read("lib/ai/tools/erp-contract.ts");
const aiExecutor = read("lib/ai/tools/executors/erp.ts");
const fr = read("locales/enterprise-supplier-onboarding.fr.json");
const en = read("locales/enterprise-supplier-onboarding.en.json");

ok(customerWorkspace.includes("BusinessPartyIdentityFields"), "Tiers: le formulaire canonique doit utiliser les champs d’identité partagés.");
ok(supplierWorkspace.includes("BusinessPartyIdentityFields"), "Procurement: le nouveau fournisseur doit utiliser les mêmes champs d’identité partagés.");
for (const field of ["legalName", "displayName", "taxIdentifier", "registrationId", "primaryEmail", "primaryPhone", "addressLine1", "countryCode"]) {
  ok(sharedIdentity.includes(`name=\"${field}\"`), `Formulaire partagé: champ canonique manquant ${field}.`);
}

ok(supplierWorkspace.includes('mode === "EXISTING"') && supplierWorkspace.includes('mode === "NEW"'), "UX fournisseur: les deux parcours tiers existant / nouveau tiers sont obligatoires.");
ok(supplierWorkspace.includes("/suppliers/party-options") && supplierWorkspace.includes("/suppliers/onboarding"), "UX fournisseur: le sélecteur canonique et l’onboarding dédié doivent être utilisés.");
ok(supplierWorkspace.includes('presentation="editor"') && supplierWorkspace.includes('form="supplier-onboarding-form"'), "UX fournisseur: le formulaire doit suivre le shell éditeur DTSC.");
ok(supplierWorkspace.includes('useToastMessage(createError, "error")') && supplierWorkspace.includes("ProfessionalError message={createError}"), "UX fournisseur: une erreur doit conserver la saisie avec erreur locale et toast global.");
ok(!supplierWorkspace.includes('enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers`, "POST"'), "UX fournisseur: l’ancien POST supplier-first ne doit plus être utilisé par le formulaire visible.");
ok(!supplierWorkspace.includes('name="category"'), "UX fournisseur: la catégorie personnalisable ne doit pas redevenir un champ de référence libre scanné par nom.");

for (const marker of ["enterpriseSupplierOnboardingSchema", 'mode: z.literal("EXISTING")', 'mode: z.literal("NEW")', "businessPartyCreateSchema.omit({ roles: true })"]) {
  ok(onboardingService.includes(marker), `Onboarding: contrat de payload canonique manquant ${marker}.`);
}
ok(onboardingService.includes("enterpriseBusinessParty.create") && onboardingService.includes('roleCode: "SUPPLIER"'), "Onboarding: un nouveau fournisseur doit matérialiser le tiers canonique et son rôle SUPPLIER.");
ok(onboardingService.includes("enterpriseSupplier.create") && onboardingService.includes("enterpriseSupplierPartyLink.create"), "Onboarding: extension Procurement et lien 1:1 doivent être créés atomiquement.");
ok(onboardingService.includes("prisma.$transaction") && onboardingService.includes("requireActiveEnterpriseMember"), "Onboarding: la création doit rester transactionnelle et liée à un membre actif.");
ok(onboardingService.includes("assertNoCanonicalDuplicate") && onboardingService.includes("SUPPLIER_PARTY_ALREADY_EXISTS"), "Onboarding: un nouveau fournisseur ne doit pas dupliquer silencieusement un tiers existant.");
ok(onboardingService.includes("SUPPLIER_PARTY_ALREADY_LINKED") && onboardingService.includes("occupied.archivedAt") && onboardingService.includes("relation fournisseur historique"), "Onboarding: le service doit refuser un tiers déjà lié, y compris historique.");
ok(onboardingService.includes("where: { id: businessPartyId, organizationId, archivedAt: null, status: \"ACTIVE\" }"), "Multi-tenant: le tiers sélectionné doit être revalidé dans le même tenant et actif.");
ok(onboardingService.includes("normalizeEnterpriseSupplierName(party.legalName)"), "Source de vérité: le snapshot fournisseur doit dériver son nom du tiers canonique.");

for (const route of [onboardingRoute, optionsRoute]) {
  ok(route.includes('moduleCode: "SUPPLIERS_PURCHASES"') && route.includes('action: "write"'), "RBAC: les parcours fournisseurs doivent rester autorisés par SUPPLIERS_PURCHASES write.");
  ok(!route.includes("CRM_CUSTOMERS"), "RBAC: Procurement ne doit pas exiger ou accorder CRM_CUSTOMERS pour utiliser le tiers canonique.");
}
ok(optionsRoute.includes("organizationId") && optionsRoute.includes('status: "ACTIVE"') && optionsRoute.includes("archivedAt: null"), "Sélecteur: les options doivent être bornées au tenant et aux tiers actifs.");
ok(optionsRoute.includes("supplierId") && optionsRoute.includes("supplierLinkArchived"), "Sélecteur: un tiers déjà fournisseur doit être identifiable sans contournement du lien 1:1.");
ok(optionsRoute.includes("selector response only exposes what is needed"), "Sélecteur: le principe de minimisation de données Procurement doit rester explicite.");
ok(!optionsRoute.includes("primaryPhone: true") && !optionsRoute.includes("taxIdentifier: true") && !optionsRoute.includes("registrationId: true") && !optionsRoute.includes("roles: {"), "Sélecteur: ne pas exposer téléphone, fiscalité ou rôles CRM dans le payload de sélection Procurement.");
ok(!onboardingRoute.includes("party: result.party") && onboardingRoute.includes("Contacts, addresses, fiscal data and roles remain server-side"), "Onboarding: la réponse Procurement ne doit pas renvoyer la fiche tiers complète après création/rattachement.");
ok(onboardingRoute.includes("id: result.party.id") && onboardingRoute.includes("legalName: result.party.legalName") && onboardingRoute.includes("displayName: result.party.displayName"), "Onboarding: la réponse doit conserver uniquement la référence d’identité nécessaire aux actions UI suivantes.");
ok(supplierRoute.includes('moduleCode: "SUPPLIERS_PURCHASES"'), "Compatibilité: la liste fournisseur historique garde son entitlement Procurement.");

ok(aiContract.includes('code: "ERP_CUSTOMERS_READ"') && aiContract.includes('moduleCode: "CRM_CUSTOMERS"'), "IA: ERP_CUSTOMERS_READ doit rester borné à CRM_CUSTOMERS.");
ok(aiContract.includes('code: "ERP_PROCUREMENT_READ"') && aiContract.includes('moduleCode: "SUPPLIERS_PURCHASES"'), "IA: ERP_PROCUREMENT_READ doit rester borné à SUPPLIERS_PURCHASES.");
ok(aiExecutor.includes('commonAccess(context, organizationId, "CRM_CUSTOMERS")'), "IA: la lecture Tiers doit continuer à être réautorisée.");
ok(aiExecutor.includes('moduleCode: "SUPPLIERS_PURCHASES"'), "IA: la lecture Procurement doit continuer à être réautorisée.");

for (const key of ["suppliers.onboarding.mode.existing", "suppliers.onboarding.mode.new", "suppliers.onboarding.identityTitle", "suppliers.onboarding.procurementTitle", "suppliers.onboarding.created"]) {
  ok(fr.includes(`\"${key}\"`) && en.includes(`\"${key}\"`), `i18n: clé FR/EN manquante ${key}.`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL #592: ${failure}`);
  process.exit(1);
}
console.log("PASS #592: formulaire fournisseur unifié sur le tiers canonique, RBAC Procurement, multi-tenant, minimisation des données, IA et i18n verrouillés.");
