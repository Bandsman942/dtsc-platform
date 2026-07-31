import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(root, "lib/enterprise/module-registry-data.json"), "utf8"));
const definitions = registry.modules || [];
const definitionByCode = new Map(definitions.map((definition) => [definition.code, definition]));
const canonicalByAlias = new Map();
for (const definition of definitions) {
  for (const alias of [...(definition.aliases || []), ...(definition.legacyCodes || [])]) {
    canonicalByAlias.set(alias, definition.code);
  }
}

const rootsToScan = ["app", "components", "lib", "prisma/migrations", "scripts"];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".json"]);
const ignoredDirectories = new Set(["node_modules", ".next", ".git"]);
const references = new Map();

function visit(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath)) {
      if (!ignoredDirectories.has(entry)) visit(path.join(relativePath, entry));
    }
    return;
  }
  if (!allowedExtensions.has(path.extname(relativePath))) return;
  const source = fs.readFileSync(absolutePath, "utf8");
  const patterns = [
    /moduleCode\s*[:=]\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
    /targetModuleCode\s*[:=]\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
    /\b(?:CORE_MODULES|BUSINESS_MODULES|ENTERPRISE_MODULES|healthcareModuleCodes|pharmacyModuleCodes)\b[\s\S]{0,3000}?["']([A-Z][A-Z0-9_]{2,})["']/g,
    /\/(?:enterprise-modules)\/([A-Z][A-Z0-9_]{2,})/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const code = match[1];
      const locations = references.get(code) || new Set();
      locations.add(relativePath);
      references.set(code, locations);
    }
  }
}

for (const rootToScan of rootsToScan) visit(rootToScan);

const rows = Array.from(references.entries())
  .map(([code, locations]) => {
    const canonicalCode = canonicalByAlias.get(code) || code;
    const definition = definitionByCode.get(canonicalCode);
    const historicalOnly = Array.from(locations).every((location) => location.startsWith("prisma/migrations/"));
    return {
      code,
      canonicalCode,
      classification: definition
        ? code === canonicalCode
          ? definition.implementationStatus
          : "ALIAS"
        : historicalOnly
          ? "HISTORICAL_UNKNOWN"
          : "UNKNOWN",
      domain: definition?.domain || "UNCLASSIFIED",
      routeKind: definition?.routeKind || "NONE",
      files: locations.size,
      sample: Array.from(locations).slice(0, 3).join(", "),
    };
  })
  .sort((left, right) => left.classification.localeCompare(right.classification) || left.code.localeCompare(right.code));

console.log(`Enterprise module audit v${registry.version}: ${definitions.length} canonical definitions, ${references.size} referenced codes.`);
console.table(rows);

const activeUnknown = rows.filter((row) => row.classification === "UNKNOWN");
if (activeUnknown.length) {
  console.error("\nUnknown module codes referenced outside immutable historical migrations:");
  for (const row of activeUnknown) console.error(`- ${row.code}: ${row.sample}`);
  process.exitCode = 1;
}
