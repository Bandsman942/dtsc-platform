import fs from "node:fs";
import path from "node:path";
import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };
const result = runStandardPersonalWorkspaceAudit("all");
if (!result.ok) failures.push(...result.errors);

const packageJson = read("package.json");
const workflow = read(".github/workflows/quality-gates.yml");
const agents = read("lib/modules/AGENTS.md");
const audit = read("docs/STANDARD_MODULE_ITERATION_02_AUDIT.md");
const manualE2e = read("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_02.md");

for (const script of [
  "qa:standard-dashboard",
  "qa:standard-account-context",
  "qa:standard-subscription-capabilities",
  "qa:standard-notification-deep-links",
  "qa:standard-notification-preferences",
  "qa:standard-invitations",
  "qa:standard-profile-settings",
  "qa:standard-session-management",
  "qa:standard-personal-workspace-guides",
  "qa:standard-modules-iteration-02",
]) expect(packageJson.includes(`\"${script}\"`), `package.json: script absent ${script}`);

expect(packageJson.includes("qa-standard-modules-iteration-02.mjs"), "qa:regression: itération 2 absente");
expect(workflow.includes("Standard modules iteration 02 QA"), "Quality Gates: étape itération 2 absente");
for (const invariant of [
  "Dashboard n’affiche que des données réelles",
  "changement de contexte exige une vérification serveur",
  "factures SaaS",
  "notification actionnable",
  "acceptation d’une invitation est idempotente",
  "sessions multi-appareils",
  "E2E manuels",
]) expect(agents.includes(invariant), `AGENTS modules: invariant absent ${invariant}`);
expect(audit.includes("Aucune promotion vers `COMMERCIAL_READY`"), "Audit: gouvernance COMMERCIAL_READY absente");
expect(manualE2e.includes("Statut : NON_EXÉCUTÉ"), "E2E: statut NON_EXÉCUTÉ absent");
expect(manualE2e.includes("Tests E2E manuels préparés — validation du propriétaire en attente"), "E2E: formule obligatoire absente");

if (failures.length) {
  console.error(`Standard modules iteration 02 QA failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
console.log("Standard modules iteration 02 QA passed: the personal SaaS workspace is guarded without automatic commercial promotion.");
