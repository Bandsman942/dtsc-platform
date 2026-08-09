import fs from "node:fs";
import path from "node:path";
import { canonicalDatasetJson, normalizeReviewedDataset } from "./syscohada-dataset-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadJson(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`JSON file not found: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function stableValue(value) {
  return canonicalDatasetJson(value).trimEnd();
}

function diffCollection(previous, next) {
  const previousByCode = new Map(previous.map((item) => [item.code, item]));
  const nextByCode = new Map(next.map((item) => [item.code, item]));
  const added = [...nextByCode.keys()].filter((code) => !previousByCode.has(code)).sort();
  const removed = [...previousByCode.keys()].filter((code) => !nextByCode.has(code)).sort();
  const changed = [...nextByCode.keys()]
    .filter((code) => previousByCode.has(code) && stableValue(previousByCode.get(code)) !== stableValue(nextByCode.get(code)))
    .sort()
    .map((code) => ({ code, before: previousByCode.get(code), after: nextByCode.get(code) }));
  return { added, removed, changed };
}

const previousPath = arg("--previous");
const nextPath = arg("--next");
const outputPath = arg("--out");
if (!previousPath || !nextPath) {
  console.error("Usage: node scripts/accounting/diff-syscohada-datasets.mjs --previous <dataset.json> --next <dataset.json> [--out <diff.json>]");
  process.exit(2);
}

let previous;
let next;
try {
  previous = normalizeReviewedDataset(loadJson(previousPath));
  next = normalizeReviewedDataset(loadJson(nextPath));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const diff = {
  previousVersion: previous.templateVersion,
  nextVersion: next.templateVersion,
  frameworkChanged: previous.frameworkCode !== next.frameworkCode,
  templateChanged: previous.templateCode !== next.templateCode,
  scopeChanged: stableValue(previous.scope) !== stableValue(next.scope),
  sourceChanged: previous.source.sha256 !== next.source.sha256,
  groups: diffCollection(previous.groups, next.groups),
  accounts: diffCollection(previous.accounts, next.accounts),
};
diff.hasChanges = diff.frameworkChanged || diff.templateChanged || diff.scopeChanged || diff.sourceChanged || diff.groups.added.length > 0 || diff.groups.removed.length > 0 || diff.groups.changed.length > 0 || diff.accounts.added.length > 0 || diff.accounts.removed.length > 0 || diff.accounts.changed.length > 0;

const rendered = `${JSON.stringify(diff, null, 2)}\n`;
if (outputPath) {
  const absolute = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, rendered);
}
console.log(rendered.trimEnd());
