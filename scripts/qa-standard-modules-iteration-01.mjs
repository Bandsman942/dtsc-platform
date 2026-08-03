import fs from "node:fs";
import path from "node:path";
import { runStandardModuleAudit } from "./lib/standard-module-professionalization-audit.mjs";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition, message) => { if (!condition) failures.push(message); };

const result = runStandardModuleAudit("all");
if (!result.ok) failures.push(...result.errors);

const registry = read("lib/modules/standard-module-registry.ts");
const access = read("lib/modules/standard-module-access.ts");
const navigation = read("lib/modules/standard-module-navigation.ts");
const navLinks = read("components/layout/nav-links.tsx");
const deepLinks = read("lib/modules/standard-module-deep-links.ts");
const manualE2e = read("docs/MANUAL_E2E_STANDARD_MODULES_ITERATION_01.md");
const readiness = read("docs/STANDARD_MODULE_COMMERCIAL_READINESS.md");

for (const token of ["implementationStatus", "maturity", "COMMERCIAL_READY", "normalizeStandardModuleCode", "assertStandardModuleRegistryIntegrity"]) {
  expect(registry.includes(token), `Registre standard: contrat absent ${token}`);
}
for (const token of ["StandardModuleAccessDecision", "reasonCode", "capabilities", "STANDARD_MODULE_PLAN_INSUFFICIENT", "STANDARD_MODULE_DEPENDENCY_MISSING"]) {
  expect(access.includes(token), `Accès standard: contrat absent ${token}`);
}
for (const token of ["buildUrlForHostType", "resolveStandardModuleHref", "listStandardNavigationItems"]) {
  expect(navigation.includes(token), `Navigation standard: contrat absent ${token}`);
}
for (const token of ["standardNavItem", "getStandardModuleDefinition", "resolveStandardModuleHref", "ENTERPRISE_MODULES_SUBSCRIPTION"]) {
  expect(navLinks.includes(token), `NavLinks: branchement canonique absent ${token}`);
}
for (const token of ["objectId", "section", "action", "context", "organizationId"]) {
  expect(deepLinks.includes(token), `Deep link standard: dimension absente ${token}`);
}
expect(manualE2e.includes("Statut : NON_EXÉCUTÉ"), "E2E manuel: statut NON_EXÉCUTÉ absent");
expect(manualE2e.includes("Tests E2E manuels préparés — validation du propriétaire en attente"), "E2E manuel: formule obligatoire absente");
expect(readiness.includes("Aucun module standard n’est promu vers `COMMERCIAL_READY`"), "Readiness: interdiction de promotion automatique absente");

if (failures.length) {
  console.error(`Standard modules iteration 01 QA failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}
console.log("Standard modules iteration 01 QA passed: registry, access, navigation, deep links, documentation and commercial governance are guarded.");
