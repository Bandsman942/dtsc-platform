import fs from "node:fs";
import path from "node:path";
import {
  buildDraftTemplate,
  canonicalDatasetJson,
  datasetIntegrityReport,
  normalizeReviewedDataset,
} from "./syscohada-dataset-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const inputPath = arg("--input");
const manifestPath = arg("--manifest") || "lib/enterprise/accounting/templates/syscohada/source-manifest.json";
const outputPath = arg("--out");
const reportPath = arg("--report");
const templatePath = arg("--template-out");
const dryRun = hasFlag("--dry-run");

if (!inputPath) {
  console.error("Usage: node scripts/accounting/build-syscohada-dataset.mjs --input <reviewed-dataset.json> [--manifest <manifest.json>] [--out <normalized.json>] [--template-out <draft-template.json>] [--report <report.json>] [--dry-run]");
  process.exit(2);
}

function loadJson(file) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`JSON file not found: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

let input;
let manifest;
try {
  input = loadJson(inputPath);
  manifest = loadJson(manifestPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const report = datasetIntegrityReport(input, manifest);
const renderedReport = `${JSON.stringify({
  ...report,
  frameworkCode: input.frameworkCode || null,
  templateCode: input.templateCode || null,
  templateVersion: input.templateVersion || null,
  sourceFileName: input.source?.fileName || null,
  dryRun,
}, null, 2)}\n`;

if (reportPath && !dryRun) {
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), reportPath)), { recursive: true });
  fs.writeFileSync(path.resolve(process.cwd(), reportPath), renderedReport);
}

if (!report.valid) {
  console.error(renderedReport);
  process.exit(1);
}

const normalized = normalizeReviewedDataset(input);
const draftTemplate = buildDraftTemplate(normalized, manifest);

if (!dryRun) {
  if (!outputPath || !templatePath) {
    console.error("Validated generation requires both --out and --template-out unless --dry-run is used");
    process.exit(2);
  }
  const absoluteOut = path.resolve(process.cwd(), outputPath);
  const absoluteTemplate = path.resolve(process.cwd(), templatePath);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.mkdirSync(path.dirname(absoluteTemplate), { recursive: true });
  fs.writeFileSync(absoluteOut, canonicalDatasetJson(normalized));
  fs.writeFileSync(absoluteTemplate, `${JSON.stringify(draftTemplate, null, 2)}\n`);
}

console.log(renderedReport.trimEnd());
if (dryRun) console.log("SYSCOHADA dataset pipeline dry-run: no files written");
