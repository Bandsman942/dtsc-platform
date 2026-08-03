import fs from "node:fs";
import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => fs.readFileSync(file, "utf8");
const result = runStandardCollaborationAudit("all");
if (!result.ok) failures.push(...result.errors);
const pkg = read("package.json");
const workflow = read(".github/workflows/quality-gates.yml");
const agents = read("lib/modules/AGENTS.md");
const audit = read("docs/STANDARD_MODULE_ITERATION_03_AUDIT.md");
const e2e = read("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_03.md");
for (const script of [
  "qa:standard-collaboration-model", "qa:standard-conversation-access", "qa:standard-message-idempotency",
  "qa:standard-collaboration-deep-links", "qa:standard-collaboration-notifications", "qa:standard-collaboration-media",
  "qa:standard-comments", "qa:standard-presence", "qa:standard-calls", "qa:standard-announcements",
  "qa:standard-moderation", "qa:standard-collaboration-guides", "qa:standard-modules-iteration-03",
]) expect(pkg.includes(`"${script}"`), `package.json: script absent ${script}`);
expect(pkg.includes("qa-standard-modules-iteration-03.mjs"), "qa:regression: itération 3 absente");
expect(workflow.includes("Standard modules iteration 03 QA"), "Quality Gates: étape itération 3 absente");
for (const invariant of ["contexte explicite", "clé d’idempotence", "propriétaire explicite", "présence doit refléter un signal réel", "tokens d’appel", "audience explicite", "actions de modération", "320 px", "COMMERCIAL_READY"]) {
  expect(agents.includes(invariant), `AGENTS modules: invariant absent ${invariant}`);
}
expect(audit.includes("Aucune promotion vers `COMMERCIAL_READY`"), "Audit: gouvernance COMMERCIAL_READY absente");
expect(e2e.includes("Statut : NON_EXÉCUTÉ"), "E2E: statut NON_EXÉCUTÉ absent");
expect(e2e.includes("Tests E2E manuels préparés — validation du propriétaire en attente"), "E2E: formule obligatoire absente");
if (failures.length) {
  console.error(`Standard modules iteration 03 QA failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
console.log("Standard modules iteration 03 QA passed without automatic commercial promotion.");
