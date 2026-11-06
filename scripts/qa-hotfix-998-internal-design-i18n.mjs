import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const fr = json("locales/internal-admin.fr.json");
const en = json("locales/internal-admin.en.json");
const statusesFr = json("locales/internal-admin-status.fr.json");
const statusesEn = json("locales/internal-admin-status.en.json");
const datasetsEn = json("locales/internal-admin-datasets.en.json");
const fieldCopyEn = json("locales/internal-admin-field-copy.en.json");
const systemCopyEn = json("locales/internal-admin-system-copy.en.json");

assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "Internal control translations must have FR/EN parity");
assert.deepEqual(Object.keys(statusesFr).sort(), Object.keys(statusesEn).sort(), "Status catalog must have FR/EN parity");
for (const catalog of [fr, en, statusesFr, statusesEn]) {
  for (const [key, value] of Object.entries(catalog)) assert.ok(typeof value === "string" && value.trim(), `Missing translation for ${key}`);
}
assert.equal(Object.keys(datasetsEn).length, 35, "All 35 internal registers must have English labels/descriptions");
for (const [key, value] of Object.entries(datasetsEn)) {
  assert.ok(typeof value.label === "string" && value.label.trim() && typeof value.description === "string" && value.description.trim(), `Incomplete dataset translation ${key}`);
}

const builderSource = read("lib/admin-operations.ts");
const sourceCopy = new Set([...builderSource.matchAll(/(?:\blabel|\bdescription|\bplaceholder|\bhelperText):\s*"([^"\n]*)"/g)].map((match) => match[1]));
const datasetCopy = new Set([...builderSource.matchAll(/\bid:\s*"[^"]+",\s*label:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g)].flatMap((match) => [match[1], match[2]]));
const missingFieldCopy = [...sourceCopy].filter((value) => !datasetCopy.has(value) && !Object.hasOwn(fieldCopyEn, value));
assert.deepEqual(missingFieldCopy, [], "Every static field label, placeholder and helper must have an explicit English copy");
assert.equal(Object.keys(fieldCopyEn).length, sourceCopy.size - datasetCopy.size, "Field catalog and builder labels must stay in sync");

const internalData = read("lib/console/console-internal-modules.ts");
const systemSource = internalData.slice(internalData.indexOf("  const legalMetrics = ["), internalData.indexOf("  const isInCeoPeriod ="))
  + internalData.slice(internalData.indexOf("  const ceoExecutiveGroups = ["), internalData.indexOf("\n  return {\n    ceoDatasets"));
const consoleSource = read("app/admin/console-page.tsx");
const systemLiteralCopy = new Set([
  ...[...systemSource.matchAll(/(?:\btitle|\blabel|\bdescription|\bdetail):\s*"([^"\n]+)"/g)].map((match) => match[1]),
  ...[...consoleSource.matchAll(/copy\("([^"\n]+)"\)/g)].map((match) => match[1]),
  "Tâches filtrées", "Tâches du jour",
  ...[...read("components/admin/internal-finance-controls.tsx").matchAll(/\blabel:\s*"([^"\n]+)"/g)].map((match) => match[1]),
]);
const missingSystemCopy = [...systemLiteralCopy].filter((value) => !Object.hasOwn(systemCopyEn, value) && !Object.hasOwn(fieldCopyEn, value));
assert.deepEqual(missingSystemCopy, [], "Every static CEO/Legal indicator and internal guided-flow label must have English copy");

const registers = read("components/admin/operations-admin-panel.tsx");
assert.match(registers, /translateInternalAdminDataset/);
assert.match(registers, /localizedOperationField/);
assert.match(registers, /translateInternalAdminFieldCopy/);
assert.match(registers, /option\.label === formatEnumLabel\(option\.value\)/);
assert.match(read("components/admin/ceo-executive-summary.tsx"), /translateInternalAdminSystemCopy/);
assert.match(read("components/admin/legal-dashboard-summary.tsx"), /translateInternalAdminSystemCopy/);
assert.match(read("components/admin/internal-finance-controls-client.tsx"), /translateInternalAdminSystemCopy\(locale, metric\.label\)/);
assert.match(read("components/admin/internal-finance-controls-client.tsx"), /translateInternalAdminAccountType\(locale, selected\.accountType\)/);
assert.match(read("lib/i18n.ts"), /translateInternalAdminAccountType\(locale/);
assert.match(consoleSource, /playbook=\{\[[^\]]+\]\.map\(copy\)\}/);
assert.match(registers, /translateInternalAdminStatus/);
assert.match(registers, /useAppLocale/);
for (const file of [
  "components/admin/internal-finance-controls-client.tsx",
  "components/admin/ceo-executive-summary.tsx",
  "components/admin/internal-department-workspace-client.tsx",
  "components/admin/hrcfo-invoice-list.tsx",
]) assert.match(read(file), /translateInternalAdmin|translateInternalAdminStatus/);

console.log(`Internal Design 2.0 FR/EN: PASS (${Object.keys(fr).length} controls, ${Object.keys(statusesFr).length} statuses, 35 registers, ${Object.keys(fieldCopyEn).length} field strings, ${systemLiteralCopy.size} CEO/Legal/guided-flow strings)`);
