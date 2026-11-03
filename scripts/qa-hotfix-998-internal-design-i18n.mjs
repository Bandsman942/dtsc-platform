import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));
const fr = json("locales/internal-admin.fr.json");
const en = json("locales/internal-admin.en.json");
const statusesFr = json("locales/internal-admin-status.fr.json");
const statusesEn = json("locales/internal-admin-status.en.json");
const datasetsEn = json("locales/internal-admin-datasets.en.json");

assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "Internal control translations must have FR/EN parity");
assert.deepEqual(Object.keys(statusesFr).sort(), Object.keys(statusesEn).sort(), "Status catalog must have FR/EN parity");
for (const catalog of [fr, en, statusesFr, statusesEn]) {
  for (const [key, value] of Object.entries(catalog)) assert.ok(typeof value === "string" && value.trim(), `Missing translation for ${key}`);
}
assert.equal(Object.keys(datasetsEn).length, 35, "All 35 internal registers must have English labels/descriptions");
for (const [key, value] of Object.entries(datasetsEn)) {
  assert.ok(typeof value.label === "string" && value.label.trim() && typeof value.description === "string" && value.description.trim(), `Incomplete dataset translation ${key}`);
}

const registers = read("components/admin/operations-admin-panel.tsx");
assert.match(registers, /translateInternalAdminDataset/);
assert.match(registers, /translateInternalAdminStatus/);
assert.match(registers, /useAppLocale/);
for (const file of [
  "components/admin/internal-finance-controls-client.tsx",
  "components/admin/ceo-executive-summary.tsx",
  "components/admin/internal-department-workspace-client.tsx",
  "components/admin/hrcfo-invoice-list.tsx",
]) assert.match(read(file), /translateInternalAdmin|translateInternalAdminStatus/);

console.log(`Internal Design 2.0 FR/EN first tranche: PASS (${Object.keys(fr).length} control labels, ${Object.keys(statusesFr).length} statuses, 35 register titles)`);
