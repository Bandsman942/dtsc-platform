import fs from "node:fs";

const legacyPath = new URL("./qa-regression-checks-legacy.mjs", import.meta.url);
const legacySource = fs.readFileSync(legacyPath, "utf8");

function replaceExactlyOnce(source, obsoleteAssertion, canonicalAssertion, label) {
  const matches = source.split(obsoleteAssertion).length - 1;
  if (matches !== 1) {
    console.error(`FAIL QA regression adapter: assertion ${label} attendue exactement une fois, trouvée ${matches}.`);
    process.exit(1);
  }
  return source.replace(obsoleteAssertion, canonicalAssertion);
}

const obsoleteAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "Vue planning", "Aucun rendez-vous enregistré pour cette entreprise.", "Convertir en consultation", "Marquer absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const canonicalAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "appointment.viewPlanning", "appointment.emptyTitle", "appointment.action.convert", "appointment.action.absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteEnterpriseAdminAssertion = 'containsAll(enterpriseAdminPage, [\'activeContext === "ORGANIZATION"\', "canManageEnterpriseAdministration(session.userId, organizationId)", \'canUseFeature(organizationId, "enterprise-admin")\', "getEnterpriseAdministrationDataset(organizationId)"])';
const canonicalEnterpriseAdminAssertion = 'containsAll(enterpriseAdminPage, [\'activeContext === "ORGANIZATION"\', "requireEnterpriseMembership", "resolveEnterpriseModuleAccess", \'moduleCode: "ADMIN_DASHBOARD"\', \'action: "manage"\', "!membership || !adminAccess?.allowed", \'canUseFeature(organizationId, "enterprise-admin")\', "getEnterpriseAdministrationDataset(organizationId, user.id, administrationLocale)"])';

let migratedSource = replaceExactlyOnce(
  legacySource,
  obsoleteAppointmentAssertion,
  canonicalAppointmentAssertion,
  "Rendez-vous historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteEnterpriseAdminAssertion,
  canonicalEnterpriseAdminAssertion,
  "Enterprise Admin historique",
);

const sourceUrl = `data:text/javascript;base64,${Buffer.from(migratedSource, "utf8").toString("base64")}`;
await import(sourceUrl);
await import("./qa-guided-form-contract-checks.mjs");
await import("./qa-controlled-form-reference-checks.mjs");
await import("./qa-operational-sla-filter-checks.mjs");
await import("./qa-media-proxy-hotfix.mjs");
