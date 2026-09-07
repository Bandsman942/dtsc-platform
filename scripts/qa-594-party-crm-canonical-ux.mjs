import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const ok = (condition, message) => { if (!condition) failures.push(message); };

const crmWorkspace = read("components/enterprise/professional/enterprise-crm-workspace-v2.tsx");
const customerWorkspace = read("components/enterprise/professional/enterprise-customers-workspace-v2.tsx");
const commercialPanel = read("components/enterprise/professional/business-party-commercial-panel.tsx");
const sharedIdentity = read("components/enterprise/shared/business-party-identity-fields.tsx");
const schemas = read("lib/enterprise/crm-sales/schemas.ts");
const onboardingService = read("lib/enterprise/crm-sales/canonical-lead-onboarding.ts");
const onboardingRoute = read("app/api/enterprise/[organizationId]/leads/onboarding/route.ts");
const legacyLeadRoute = read("app/api/enterprise/[organizationId]/leads/route.ts");
const partyOptionsRoute = read("app/api/enterprise/[organizationId]/leads/party-options/route.ts");
const commercialSummaryRoute = read("app/api/enterprise/[organizationId]/business-parties/[id]/commercial-summary/route.ts");
const professionalLookups = read("app/api/enterprise/[organizationId]/professional-lookups/route.ts");
const leadService = read("lib/enterprise/crm-sales/leads.ts");
const errorHttp = read("lib/enterprise/common/http.ts");
const aiContract = read("lib/ai/tools/erp-contract.ts");
const aiExecutor = read("lib/ai/tools/executors/erp.ts");

ok(crmWorkspace.includes("BusinessPartyIdentityFields"), "CRM: le nouveau prospect doit utiliser les champs d’identité canoniques partagés.");
ok(customerWorkspace.includes("BusinessPartyIdentityFields"), "Tiers: le référentiel doit continuer à utiliser le même éditeur d’identité partagé.");
for (const field of ["legalName", "displayName", "taxIdentifier", "registrationId", "primaryEmail", "primaryPhone", "addressLine1", "countryCode"]) {
  ok(sharedIdentity.includes(`name=\"${field}\"`), `Identité canonique: champ partagé manquant ${field}.`);
}

ok(crmWorkspace.includes('leadMode === "EXISTING"') && crmWorkspace.includes('leadMode === "NEW"'), "UX CRM: les parcours tiers existant / nouveau tiers doivent rester explicites.");
ok(crmWorkspace.includes("/leads/party-options") && crmWorkspace.includes("/leads/onboarding"), "UX CRM: le sélecteur commercial et l’onboarding canonique dédiés doivent être utilisés.");
ok(crmWorkspace.includes('presentation="editor"') && crmWorkspace.includes('form="crm-lead-form"'), "UX CRM: le formulaire Lead doit respecter le shell éditeur DTSC.");
ok(crmWorkspace.includes('useToastMessage(message, "error")') && crmWorkspace.includes("ProfessionalError message={message}"), "UX CRM: une erreur doit avoir toast global + erreur locale et conserver le formulaire.");
ok(!crmWorkspace.includes('professionalMutation(`/api/enterprise/${organizationId}/leads`, {'), "UX CRM: le formulaire visible ne doit plus utiliser le POST Lead historique sans onboarding canonique.");
ok(crmWorkspace.includes("commercialParties.map") && !crmWorkspace.includes("lookups.parties.map"), "UX CRM: Leads et opportunités doivent sélectionner uniquement des tiers commercialement admissibles.");

for (const marker of ["leadCanonicalOnboardingSchema", 'mode: z.literal("EXISTING")', 'mode: z.literal("NEW")', "businessPartyCreateSchema.omit({ roles: true })"]) {
  ok(schemas.includes(marker), `Onboarding CRM: contrat de payload canonique manquant ${marker}.`);
}
ok(onboardingService.includes("prisma.$transaction"), "Onboarding CRM: BusinessParty + Lead doivent être matérialisés dans une transaction unique.");
ok(onboardingService.includes("enterpriseBusinessParty.create") && onboardingService.includes('roleCode: "PROSPECT"'), "Onboarding CRM: un nouveau Lead doit créer le tiers canonique avec rôle PROSPECT.");
ok(onboardingService.includes("enterpriseLead.create") && onboardingService.includes("businessPartyId: party.id"), "Onboarding CRM: tout nouveau Lead doit être lié au tiers canonique.");
ok(onboardingService.includes("assertNoActiveLead") && onboardingService.includes("LEAD_ACTIVE_ALREADY_EXISTS"), "Onboarding CRM: un second Lead actif pour le même tiers doit être bloqué.");
ok(onboardingService.includes("duplicatePartyCandidates") && onboardingService.includes("LEAD_CANONICAL_PARTY_REQUIRES_SELECTION"), "Onboarding CRM: une identité existante doit forcer la sélection du tiers au lieu d’un doublon.");
ok(onboardingService.includes('organizationId') && onboardingService.includes('status: "ACTIVE"') && onboardingService.includes('roleCode: { in: ["PROSPECT", "CUSTOMER"] }'), "Onboarding CRM: le tiers existant doit être revalidé dans le tenant, actif et commercialement admissible.");

ok(onboardingRoute.includes('moduleCode: "CRM_PIPELINE"') && onboardingRoute.includes('action: "write"'), "RBAC CRM: l’onboarding doit exiger CRM_PIPELINE write.");
ok(!onboardingRoute.includes('moduleCode: "CRM_CUSTOMERS"'), "RBAC CRM-only: créer le tiers canonique depuis le pipeline ne doit pas exiger CRM_CUSTOMERS.");
ok(onboardingRoute.includes("isSameOriginRequest") && onboardingRoute.includes("rateLimit"), "Sécurité CRM: same-origin et rate-limit doivent rester présents.");
ok(onboardingRoute.includes("id: result.party.id") && !onboardingRoute.includes("party: result.party"), "Minimisation: l’onboarding ne doit pas renvoyer toute la fiche Tiers au client CRM.");

ok(legacyLeadRoute.includes("createCanonicalLeadFromLegacyInput"), "Compatibilité: le POST /leads historique doit aussi créer/réutiliser le tiers canonique.");
ok(!legacyLeadRoute.includes("createEnterpriseLead("), "Compatibilité: aucune route active ne doit encore créer un Lead orphelin via l’ancien service.");

ok(partyOptionsRoute.includes('moduleCode: "CRM_PIPELINE"') && partyOptionsRoute.includes('action: "read"'), "Sélecteur CRM: l’accès doit rester CRM_PIPELINE read.");
ok(partyOptionsRoute.includes("organizationId") && partyOptionsRoute.includes('status: "ACTIVE"') && partyOptionsRoute.includes("archivedAt: null"), "Sélecteur CRM: les options doivent être tenant-scoped et actives.");
ok(partyOptionsRoute.includes('roleCode: { in: ["PROSPECT", "CUSTOMER"] }'), "Sélecteur CRM: les tiers sans rôle commercial ne doivent pas être proposés.");
ok(!partyOptionsRoute.includes("taxIdentifier: true") && !partyOptionsRoute.includes("registrationId: true") && !partyOptionsRoute.includes("roles: {"), "Sélecteur CRM: ne pas exposer fiscalité ni rôles non nécessaires dans le payload de sélection.");
ok(professionalLookups.includes('moduleCode === "CRM_PIPELINE" ? [] : parties'), "Minimisation: le lookup générique CRM ne doit plus exposer toute la liste des tiers.");

ok(customerWorkspace.includes("BusinessPartyCommercialPanel"), "Tiers 360: la fiche canonique doit intégrer la vue commerciale permission-bound.");
ok(commercialSummaryRoute.includes('moduleCode: "CRM_CUSTOMERS"') && commercialSummaryRoute.includes('moduleCode: "CRM_PIPELINE"'), "Tiers 360: la route doit contrôler séparément l’accès Tiers et l’accès Pipeline.");
ok(commercialSummaryRoute.includes("available: false") && commercialSummaryRoute.includes("canWrite: false"), "Tiers 360: sans CRM_PIPELINE, aucune donnée/action CRM ne doit être exposée.");
ok(commercialSummaryRoute.includes("businessPartyId: id") && commercialSummaryRoute.includes("organizationId"), "Tiers 360: Lead et opportunités doivent être résolus par le même businessPartyId dans le tenant.");
ok(commercialPanel.includes('/leads/onboarding') && commercialPanel.includes('mode: "EXISTING"'), "Tiers 360: démarrer une prospection doit réutiliser le tiers courant, pas recréer son identité.");
ok(commercialPanel.includes('useToastMessage(error, "error")') && commercialPanel.includes("ProfessionalError message={error}"), "Tiers 360: l’échec de création doit être visible localement et globalement.");

ok(leadService.includes('where: { organizationId_businessPartyId_roleCode: { organizationId, businessPartyId: party.id, roleCode: "CUSTOMER" } }'), "Conversion: le Lead qualifié doit toujours promouvoir/réactiver le rôle CUSTOMER du tiers canonique.");
ok(leadService.includes("businessPartyId: party.id") && leadService.includes("convertedPartyId: party.id"), "Conversion: opportunité et Lead converti doivent rester liés au même tiers canonique.");

for (const code of ["BUSINESS_PARTY_NOT_COMMERCIAL", "LEAD_ACTIVE_ALREADY_EXISTS", "LEAD_CANONICAL_PARTY_REQUIRES_SELECTION"]) {
  ok(errorHttp.includes(`${code}: { fr:`), `Erreurs métier: message FR/EN manquant pour ${code}.`);
}

ok(aiContract.includes('code: "ERP_CUSTOMERS_READ"') && aiContract.includes('moduleCode: "CRM_CUSTOMERS"'), "IA: ERP_CUSTOMERS_READ doit rester borné à CRM_CUSTOMERS.");
ok(aiContract.includes('code: "ERP_CRM_PIPELINE_READ"') && aiContract.includes('moduleCode: "CRM_PIPELINE"'), "IA: ERP_CRM_PIPELINE_READ doit rester borné à CRM_PIPELINE.");
ok(aiExecutor.includes("getEnterpriseCommonDomainAccess") && aiExecutor.includes("commonAccess"), "IA: les outils ERP doivent continuer à réautoriser les modules via l’accès commun.");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL #594: ${failure}`);
  process.exit(1);
}
console.log("PASS #594: Tiers/CRM unifiés autour du BusinessParty canonique, Lead comme processus, RBAC croisé, anti-doublon, vue 360 et IA verrouillés.");
