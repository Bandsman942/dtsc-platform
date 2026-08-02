import "./qa-erp-professional-iteration-04-finance-checks.mjs";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
};

const registrySources = [
  "lib/enterprise/module-registry-data.json",
  "lib/enterprise/module-registry-common-domains.json",
  "lib/enterprise/module-registry-finance.json",
];
const modules = registrySources.flatMap((source) => readJson(source).modules || []);
const finalCleanup = readJson("lib/enterprise/module-registry-final-cleanup.json");
const readiness = readJson("lib/enterprise/module-commercial-readiness.json");
const cleanupByCode = new Map((finalCleanup.overrides || []).map((entry) => [entry.code, entry]));
const moduleByCode = new Map();

// Match module-registry.ts: later definitions with the same canonical code win.
for (const moduleDefinition of modules) {
  moduleByCode.set(moduleDefinition.code, {
    ...moduleDefinition,
    ...(cleanupByCode.get(moduleDefinition.code) || {}),
  });
}

const allowedMaturities = new Set([
  "BACKEND_READY",
  "READ_ONLY_UI",
  "OPERATIONAL_UI",
  "PROFESSIONAL_READY",
  "COMMERCIAL_READY",
]);
const requiredCommercialCriteria = new Set([
  "CANONICAL_REGISTRY",
  "DEDICATED_WORKSPACE",
  "READ_API",
  "WRITE_API",
  "PROFESSIONAL_FORM",
  "BUSINESS_DETAIL",
  "LIFECYCLE_ACTIONS",
  "SERVER_PERMISSIONS",
  "AUDIT",
  "CONTROLLED_I18N",
  "RESPONSIVE_CONTRACT",
  "BUSINESS_QA_EVIDENCE",
]);

function sourceFor(definition) {
  const direct = readiness.moduleOverrides?.[definition.code];
  if (direct) return { assessment: direct, explicitOverride: true };
  if (["PLANNED", "HIDDEN", "RETIRED"].includes(definition.implementationStatus) || definition.routeKind === "HIDDEN") {
    return { assessment: readiness.profiles?.HIDDEN, explicitOverride: false };
  }
  if (definition.routeKind === "ADMIN_SECTION") {
    return { assessment: readiness.profiles?.ADMIN_SECTION, explicitOverride: false };
  }
  return { assessment: readiness.defaultAssessment, explicitOverride: false };
}

if (!Number.isInteger(readiness.version) || readiness.version < 1) fail("Le manifeste de maturité doit être versionné.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(readiness.evaluatedAt || "")) fail("La date d’évaluation de maturité est invalide.");
if (!readiness.policyVersion) fail("Le manifeste doit référencer une version de standard professionnel.");

let assessedActiveModules = 0;
let commercialReadyModules = 0;
for (const definition of moduleByCode.values()) {
  const { assessment, explicitOverride } = sourceFor(definition);
  if (!assessment) {
    fail(`Aucune maturité résolue pour ${definition.code}.`);
    continue;
  }
  if (!allowedMaturities.has(assessment.maturity)) fail(`Maturité inconnue pour ${definition.code}: ${assessment.maturity}`);
  if (!Array.isArray(assessment.criteriaSatisfied) || !Array.isArray(assessment.criteriaMissing)) {
    fail(`Les critères de ${definition.code} doivent être des listes versionnées.`);
  }
  if (typeof assessment.commercializable !== "boolean") fail(`La commercialisabilité de ${definition.code} doit être explicite.`);
  if (!assessment.commentFr || !assessment.commentEn) fail(`Une justification FR/EN est obligatoire pour ${definition.code}.`);

  if (["ACTIVE", "BETA"].includes(definition.implementationStatus)) assessedActiveModules += 1;

  if (assessment.maturity === "COMMERCIAL_READY") {
    commercialReadyModules += 1;
    if (!explicitOverride) fail(`${definition.code} ne peut pas être COMMERCIAL_READY par profil ou valeur par défaut.`);
    if (!assessment.commercializable) fail(`${definition.code} est COMMERCIAL_READY mais commercializable=false.`);
    if (definition.routeKind === "ADMIN_SECTION" || definition.routeKind === "HIDDEN") {
      fail(`${definition.code} n’est pas un module métier commercial autonome.`);
    }
    if (!definition.routePath || !definition.workspaceKey) fail(`${definition.code} n’a pas de route/workspace vérifiable.`);
    if (assessment.interfaceKind !== "DEDICATED") fail(`${definition.code} utilise une interface générique ou non vérifiée.`);
    if (assessment.criteriaMissing.length > 0) fail(`${definition.code} conserve des critères manquants malgré COMMERCIAL_READY.`);
    for (const criterion of requiredCommercialCriteria) {
      if (!assessment.criteriaSatisfied.includes(criterion)) fail(`${definition.code} manque le critère commercial ${criterion}.`);
    }
    if (!assessment.qaContract && !definition.qaContract) fail(`${definition.code} n’a pas de contrat QA.`);
    if (!Array.isArray(assessment.evidence) || assessment.evidence.length < 3) {
      fail(`${definition.code} doit fournir au moins trois preuves code/API/QA.`);
    } else {
      for (const evidence of assessment.evidence) {
        if (!exists(evidence)) fail(`Preuve introuvable pour ${definition.code}: ${evidence}`);
      }
    }
  }

  if (assessment.maturity === "READ_ONLY_UI" && assessment.commercializable) {
    fail(`${definition.code}: une interface de consultation ne peut pas être commercialisable.`);
  }
  if (assessment.interfaceKind === "GENERIC_OR_UNVERIFIED" && assessment.commercializable) {
    fail(`${definition.code}: un workspace générique/non vérifié ne peut pas être commercialisable.`);
  }
}

for (const code of Object.keys(readiness.moduleOverrides || {})) {
  if (!moduleByCode.has(code)) fail(`Override de maturité orphelin : ${code}`);
}

if (!exists("docs/ERP_PROFESSIONAL_MODULE_STANDARD.md")) fail("Le standard professionnel ERP doit être documenté.");
if (!exists("docs/ERP_COMMERCIAL_READINESS.md")) fail("La matrice de maturité commerciale doit être documentée.");
if (!exists("app/admin/erp-readiness/page.tsx")) fail("La visualisation DTSC de maturité est absente.");

if (!process.exitCode) {
  console.log(`✅ Maturité ERP vérifiée : ${assessedActiveModules} modules actifs évalués, ${commercialReadyModules} commercialisable(s).`);
}
