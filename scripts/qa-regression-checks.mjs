import fs from "node:fs";

const legacyPath = new URL("./qa-regression-checks-legacy.mjs", import.meta.url);
const legacySource = fs.readFileSync(legacyPath, "utf8");
const obsoleteAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "Vue planning", "Aucun rendez-vous enregistré pour cette entreprise.", "Convertir en consultation", "Marquer absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const canonicalAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "appointment.viewPlanning", "appointment.emptyTitle", "appointment.action.convert", "appointment.action.absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const matches = legacySource.split(obsoleteAppointmentAssertion).length - 1;

if (matches !== 1) {
  console.error(`FAIL QA regression adapter: assertion Rendez-vous historique attendue exactement une fois, trouvée ${matches}.`);
  process.exit(1);
}

const migratedSource = legacySource.replace(obsoleteAppointmentAssertion, canonicalAppointmentAssertion);
const sourceUrl = `data:text/javascript;base64,${Buffer.from(migratedSource, "utf8").toString("base64")}`;
await import(sourceUrl);
await import("./qa-guided-form-contract-checks.mjs");
await import("./qa-controlled-form-reference-checks.mjs");