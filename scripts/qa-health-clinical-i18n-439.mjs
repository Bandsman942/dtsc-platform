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
const convergenceTargets = {
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
  const convergenceTarget = convergenceTargets[file];
  const allowed = Number.isInteger(convergenceTarget) ? convergenceTarget : Math.max(historicalTarget, baseCount);
  if (currentCount > allowed) failures.push(`${file}: dette i18n au-dessus du plafond (${currentCount} > ${allowed}; historique ${historicalTarget}, main ${baseCount}).`);

  for (const token of localDebtPatterns) {
    const current = occurrences(content, token);
    const base = occurrences(baseContent, token);
    if (current > base) failures.push(`${file}: dette locale supplémentaire pour ${JSON.stringify(token)} (${current} > ${base}).`);
  }
  reports.push({ file, historicalTarget, convergenceTarget: Number.isInteger(convergenceTarget) ? convergenceTarget : null, baseCount, currentCount, allowed });
}

for (const report of reports) {
  const targetText = report.convergenceTarget === null ? `plafond historique ${report.historicalTarget}` : `cible convergence ${report.convergenceTarget}`;
  console.log(`${report.file}: ${report.currentCount} libellés probables (main ${report.baseCount}, ${targetText}, plafond actif ${report.allowed}).`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("PASS i18n Health #439 — aucune hausse de dette et cible Patients verrouillée à zéro copie système locale.");

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
