import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const baseline = {
  "components/enterprise/health-patients-workspace.tsx": 76,
  "components/enterprise/health-appointments-workspace.tsx": 58,
  "components/enterprise/health-consultations-workspace.tsx": 68,
  "components/enterprise/health-medical-records-workspace.tsx": 47,
  "components/enterprise/health-staff-workspace.tsx": 53,
  "components/enterprise/health-laboratory-workspace.tsx": 75,
};
const semanticConvergenceTargets = {
  "components/enterprise/health-patients-workspace.tsx": 0,
};
const localDebtPatterns = [
  'locale === "en"',
  'locale === "fr"',
  'toLocaleString("fr-FR"',
  'toLocaleString("en-US"',
  'toLocaleDateString("fr-FR"',
  'toLocaleDateString("en-US"',
  'toLocaleTimeString("fr-FR"',
  'toLocaleTimeString("en-US"',
];
const failures = [];
const reports = [];

ensureMainRef();
const inventory = JSON.parse(fs.readFileSync(path.join(root, "config/i18n-hardcoded-baseline.json"), "utf8"));

for (const [file, historicalTarget] of Object.entries(baseline)) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`${file}: workspace clinique absent.`);
    continue;
  }
  const declared = inventory?.files?.[file];
  if (declared !== historicalTarget) failures.push(`${file}: baseline canonique inattendue (${declared ?? "absente"} au lieu de ${historicalTarget}).`);

  const content = fs.readFileSync(target, "utf8");
  const baseContent = readBaseVersion(file);
  if (baseContent == null) {
    failures.push(`${file}: version origin/main indisponible, impossible de prouver la non-régression.`);
    continue;
  }

  const currentCount = countLikelyHardcodedLabels(content);
  const baseCount = countLikelyHardcodedLabels(baseContent);
  const allowed = Math.max(historicalTarget, baseCount);
  if (currentCount > allowed) failures.push(`${file}: dette i18n heuristique au-dessus du plafond (${currentCount} > ${allowed}; historique ${historicalTarget}, main ${baseCount}).`);

  const hasSemanticGate = Number.isInteger(semanticConvergenceTargets[file]);
  for (const token of localDebtPatterns) {
    if (hasSemanticGate && (token === 'locale === "en"' || token === 'locale === "fr"')) continue;
    const current = occurrences(content, token);
    const base = occurrences(baseContent, token);
    if (current > base) failures.push(`${file}: dette locale supplémentaire pour ${JSON.stringify(token)} (${current} > ${base}).`);
  }
  reports.push({
    file,
    historicalTarget,
    semanticTarget: hasSemanticGate ? semanticConvergenceTargets[file] : null,
    baseCount,
    currentCount,
    allowed,
  });
}

for (const report of reports) {
  const targetText = report.semanticTarget === null
    ? `plafond historique ${report.historicalTarget}`
    : `cible sémantique ${report.semanticTarget} via QA dédiée`;
  console.log(`${report.file}: ${report.currentCount} motifs heuristiques (main ${report.baseCount}, ${targetText}, plafond heuristique ${report.allowed}).`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

const patientQa = spawnSync(process.execPath, [path.join(root, "scripts/qa-health-patients-i18n-447.mjs")], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (patientQa.stdout) process.stdout.write(patientQa.stdout);
if (patientQa.stderr) process.stderr.write(patientQa.stderr);
if (patientQa.status !== 0) {
  console.error(`FAIL i18n Health #439 — sous-gate Patients #447 en échec (exit ${patientQa.status ?? "unknown"}).`);
  process.exit(patientQa.status || 1);
}

console.log("PASS i18n Health #439 — dette heuristique non régressive et cible sémantique Patients à zéro copie système locale prouvée par #447.");

function occurrences(content, token) {
  return content.split(token).length - 1;
}

function countLikelyHardcodedLabels(content) {
  const jsxText = [...content.matchAll(/<(?:[A-Z][A-Za-z0-9.]*|[a-z][a-z0-9-]*)\b[^>\n]*>([^<{\n][^<{]*?)<\//g)]
    .map((match) => match[1].trim())
    .filter((value) => /[A-Za-zÀ-ÿ]{3}/.test(value));
  const attributes = [...content.matchAll(/(?:placeholder|title|aria-label)="([^"]*[A-Za-zÀ-ÿ][^"]*)"/g)].map((match) => match[1]);
  return jsxText.length + attributes.length;
}

function ensureMainRef() {
  const ref = process.env.GITHUB_REF_NAME === "main" ? "HEAD^" : "origin/main";
  const probe = spawnSync("git", ["rev-parse", "--verify", ref], { cwd: root, stdio: "ignore" });
  if (probe.status === 0) return;
  spawnSync("git", ["fetch", "origin", "main", "--depth=2"], { cwd: root, stdio: "ignore" });
}

function readBaseVersion(file) {
  const ref = process.env.GITHUB_REF_NAME === "main" ? "HEAD^" : "origin/main";
  const result = spawnSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout : null;
}
