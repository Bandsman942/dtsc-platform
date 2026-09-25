import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const retiredBridges = [
  "components/enterprise/professional/enterprise-customers-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-catalog-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-crm-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-contracts-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-assets-maintenance-workspace-v2.tsx",
  "components/enterprise/enterprise-ai-workspace-v2.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace-v3.tsx",
  "components/enterprise/professional/enterprise-finance-advanced-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-payments-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix-legacy.tsx",
  "components/enterprise/professional/finance-professional-workspace-shared-legacy.tsx",
  "components/enterprise/enterprise-admin-hotfix-panels.tsx",
  "components/enterprise/enterprise-admin-hotfix-panels-legacy.tsx",
];

const canonicalFiles = [
  "components/enterprise/professional/enterprise-customers-workspace.tsx",
  "components/enterprise/professional/enterprise-catalog-workspace.tsx",
  "components/enterprise/professional/enterprise-crm-workspace.tsx",
  "components/enterprise/professional/enterprise-contracts-workspace.tsx",
  "components/enterprise/professional/enterprise-assets-maintenance-workspace.tsx",
  "components/enterprise/enterprise-ai-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-accounting-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-advanced-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-invoices-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-payments-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-base.tsx",
  "components/enterprise/professional/finance-professional-workspace-core.tsx",
  "components/enterprise/enterprise-administration-panels.tsx",
  "components/enterprise/enterprise-administration-panels-base.tsx",
];

for (const file of retiredBridges) check(!exists(file), `Retired ERP bridge still exists: ${file}`);
for (const file of canonicalFiles) check(exists(file), `Canonical ERP implementation missing: ${file}`);

const allowedHistoricalReferenceFiles = new Set([
  "scripts/qa-hotfix-669-ui-i18n-code-convergence.mjs",
  "scripts/qa-hotfix-670-erp-deletion-certification.mjs",
]);

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml"]);
const scanRoots = ["app", "components", "lib", "scripts", "config", ".github"];

function walk(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(relative));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(relative.replaceAll("\\", "/"));
  }
  return files;
}

const retiredNames = retiredBridges.map((file) => path.basename(file, path.extname(file)));
for (const file of scanRoots.flatMap(walk)) {
  if (allowedHistoricalReferenceFiles.has(file)) continue;
  const source = read(file);
  for (const retiredName of retiredNames) {
    check(!source.includes(retiredName), `Active source still references retired bridge ${retiredName}: ${file}`);
  }
}

const moduleRoute = read("app/enterprise-modules/[moduleCode]/page.tsx");
const financeRoute = read("components/enterprise/enterprise-finance-module-page.tsx");
const operationalFinance = read("components/enterprise/professional/enterprise-operational-finance-workspace.tsx");
const administration = read("components/enterprise/enterprise-administration-module.tsx");
const sharedFinance = read("components/enterprise/professional/finance-professional-workspace-shared.tsx");

for (const [scope, source] of [
  ["ERP module router", moduleRoute],
  ["Finance module router", financeRoute],
  ["Operational Finance router", operationalFinance],
  ["Enterprise administration", administration],
  ["Finance shared API", sharedFinance],
]) {
  check(!/(?:-v2|-v3|-hotfix|-legacy)(?:["']|\/)/.test(source), `${scope} must not route through a suffixed compatibility path.`);
}

const pkg = JSON.parse(read("package.json"));
const regression = String(pkg.scripts?.["qa:regression"] || "");
for (const gate of [
  "qa-hotfix-666-erp-data-safety.mjs",
  "qa-hotfix-667-canonical-erp-foundations.mjs",
  "qa-hotfix-668-registry-business-coherence.mjs",
  "qa-hotfix-669-ui-i18n-code-convergence.mjs",
  "qa-hotfix-670-erp-deletion-certification.mjs",
]) {
  check(regression.includes(gate), `Regression QA must keep ${gate} wired.`);
}

const registryGate = read("scripts/qa-hotfix-668-registry-business-coherence.mjs");
check(registryGate.includes("Canonical code") && registryGate.includes("is duplicated"), "Registry duplicate-code protection must remain active.");
check(registryGate.includes("Duplicate canonical enterprise module code"), "Runtime duplicate canonical module protection must remain active.");

const readiness = read("lib/enterprise/module-commercial-readiness.json");
for (const retiredName of retiredNames) check(!readiness.includes(retiredName), `Commercial readiness still cites retired bridge: ${retiredName}`);
check(readiness.includes("components/enterprise/enterprise-ai-workspace.tsx"), "AI commercial-readiness evidence must cite the canonical workspace.");

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

function resolveComparison() {
  const candidates = [];
  if (process.env.GITHUB_BASE_REF) candidates.push(`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF);
  candidates.push("HEAD^");
  for (const candidate of candidates) {
    if (!gitOutput(["rev-parse", "--verify", candidate]).trim()) continue;
    return candidate === "HEAD^" ? "HEAD^..HEAD" : `${candidate}...HEAD`;
  }
  return null;
}

const comparison = resolveComparison();
if (comparison) {
  const diff = gitOutput(["diff", "--unified=0", "--no-ext-diff", comparison, "--", "app", "components", "lib"]);
  let currentFile = "";
  const additions = [];
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) additions.push({ file: currentFile, line: line.slice(1) });
  }

  const usdFallback = /(?:\?\?|\|\||default(?:Value)?\s*[:=,(]|useState\s*\(|set[A-Za-z0-9_]*Currency[A-Za-z0-9_]*\s*\()[^;\n]{0,100}["']USD["']/i;
  const naiveUtcBusinessDate = /toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)/;
  for (const addition of additions) {
    if (/^(?:app\/api\/enterprise\/|components\/enterprise\/|lib\/enterprise\/|lib\/ai\/)/.test(addition.file)) {
      check(!usdFallback.test(addition.line), `New arbitrary USD fallback detected in ${addition.file}: ${addition.line.trim()}`);
      check(!naiveUtcBusinessDate.test(addition.line), `New naive UTC business date detected in ${addition.file}: ${addition.line.trim()}`);
    }
    if (/^(?:app\/api\/enterprise\/|lib\/enterprise\/)/.test(addition.file)) {
      check(!/["']Invalid payload["']/.test(addition.line), `New generic Invalid payload response detected in ${addition.file}`);
    }
  }

  const changed = gitOutput(["diff", "--name-status", comparison, "--", "components/enterprise"]);
  for (const line of changed.split(/\r?\n/)) {
    const [status, file] = line.split("\t");
    if (status !== "A" || !file || !/(?:-v2|-v3|-hotfix|-legacy)\.(?:tsx?|jsx?)$/.test(file) || !exists(file)) continue;
    const source = read(file).trim();
    const nonEmptyLines = source.split(/\r?\n/).filter(Boolean);
    const looksLikeBridge = nonEmptyLines.length <= 4 && /export\s+.*\s+from\s+["']/.test(source);
    check(!looksLikeBridge, `New undocumented suffixed compatibility bridge detected: ${file}`);
  }
} else {
  console.log("Hotfix #670 diff-level anti-debt scan skipped: no Git comparison ref is available in this execution context.");
}

if (failures.length) {
  console.error(`Hotfix #670 ERP Deletion & Certification QA failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Hotfix #670 ERP Deletion & Certification QA passed: ${retiredBridges.length} retired bridges absent, canonical routes preserved, anti-debt gates active.`);
