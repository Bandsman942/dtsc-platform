import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const migration = read("prisma/migrations/20260527143000_enterprise_sector_templates/migration.sql");
const catalog = read("lib/enterprise/sector-activity-capabilities.ts");
const contract = read("lib/enterprise/enterprise-activity-form-contract.ts");
const route = read("app/api/enterprise/[organizationId]/activities/route.ts");
const panel = read("components/enterprise/enterprise-activities-panels.tsx");
const moduleUi = read("components/enterprise/enterprise-activities-module.tsx");
const docs = read("docs/HOTFIX_876_SECTOR_ACTIVITY_MATRIX.md");

const arrays = [...migration.matchAll(/'\[(?:.|\n)*?\]'::jsonb/g)]
  .map((match) => { try { return JSON.parse(match[0].slice(1, -8)); } catch { return []; } })
  .filter((items) => items.length && items[0]?.blockCode);
const specialized = arrays.find((items) => items.length === 16);
const listed = arrays.find((items) => items.length === 78);
assert.ok(specialized && listed, "Historic catalog must include 16 + 78 sector action blocks");
assert.equal(specialized.length + listed.length, 94);

const capabilityMap = new Map();
const sectorBlocks = [...catalog.matchAll(/^  ([A-Z_]+): \{\n([\s\S]*?)^  \},/gm)];
for (const [, sectorCode, block] of sectorBlocks) {
  for (const line of block.split("\n")) {
    const match = line.match(/^    ([A-Z_]+): \{ mode: "(REQUEST|UNAVAILABLE)", fields: \[([^\]]*)\]/);
    if (!match) continue;
    const [, blockCode, mode, fieldString] = match;
    const key = sectorCode + "::" + blockCode;
    assert.ok(!capabilityMap.has(key), "Duplicate sector capability " + key);
    const fields = [...fieldString.matchAll(/F\.([A-Za-z]+)\b/g)].map((m) => m[1]);
    assert.ok(mode === "UNAVAILABLE" || fields.length >= 2, "Dedicated request fields missing for " + key);
    if (mode === "UNAVAILABLE") {
      assert.equal(fields.length, 0, "Blocked operation must not expose a fake input form: " + key);
      assert.ok(line.includes("reasonFr:") && line.includes("reasonEn:"), "Blocked action needs FR and EN explanations: " + key);
    }
    capabilityMap.set(key, { mode, fields });
  }
}
assert.equal(capabilityMap.size, 74, "All 72 non-hospitality actions plus two OTHER must be explicit");
const expected = [...listed.filter((item) => item.sectorCode !== "HOSPITALITY_EVENTS"), ...specialized.filter((item) => item.sectorCode === "OTHER")];
assert.equal(expected.length, 74);
for (const action of expected) {
  const key = action.sectorCode + "::" + action.blockCode;
  assert.ok(capabilityMap.has(key), "Missing sector business contract: " + key);
  assert.ok(docs.includes("| " + action.sectorCode + " | " + action.blockCode + " |"), "Missing documentation row: " + key);
}
const actual = new Set(expected.map((item) => item.sectorCode + "::" + item.blockCode));
for (const key of capabilityMap.keys()) assert.ok(actual.has(key), "Unknown action copied into catalog: " + key);
const counts = [...capabilityMap.values()].reduce((a, b) => { a[b.mode]++; return a; }, { REQUEST: 0, UNAVAILABLE: 0 });
assert.deepEqual(counts, { REQUEST: 60, UNAVAILABLE: 14 });

for (const action of [...listed, ...specialized]) {
  assert.ok(docs.includes("| " + action.sectorCode + " | " + action.blockCode + " |"), "Missing 94-action inventory row " + action.sectorCode + ":" + action.blockCode);
}
assert.match(contract, /getSectorActivityCapability\(sectorCode, blockCode\)/);
assert.match(contract, /resolveEnterpriseActivityAction\(/);
for (const forbidden of ['blockCode.startsWith("REPORT_")', 'blockCode.startsWith("REQUEST_")', 'return [observed];']) {
  assert.ok(!contract.includes(forbidden), "Unverified prefix fallback is forbidden: " + forbidden);
}
for (const code of ["SUBMIT_SECTOR_REPORT","REPORT_SECTOR_INCIDENT","REQUEST_OPERATION_VALIDATION","REQUEST_RESOURCE","UPDATE_SECTOR_INDICATOR"]) {
  assert.ok(contract.includes(code + ":"), "The five core collaboration actions must remain available");
}
for (const code of ["CONFIRM_BOOKING","REPORT_CUSTOMER_INCIDENT","REQUEST_KITCHEN_STOCK","SUBMIT_CASH_REPORT","REQUEST_EXTRA_STAFF","REPORT_ROOM_SERVICE_PROBLEM"]) {
  assert.ok(contract.includes(code + ":"), "Hospitality and Gaming compatibility must remain");
}
for (const token of ['resolveEnterpriseActivityAction(organization.sectorCode', '"ENTERPRISE_ACTIVITY_ACTION_NOT_READY"', 'status: 422', 'if (!isDedicatedSector)', 'getBusinessActivityFields(', 'field.required', 'field.options', 'field.source', 'organizationId', 'createEnterpriseRequestInTransaction']) assert.ok(route.includes(token), "Server guard missing: " + token);
assert.ok(route.indexOf("ENTERPRISE_ACTIVITY_ACTION_NOT_READY") < route.indexOf("prisma.$transaction"), "Blocked actions must be refused before writing");
for (const token of ["resolveEnterpriseActivityAction(sectorCode, businessSubtypeCode", "disabled={!isReady}", "aria-disabled={!isReady}", 'mode === "REQUEST"', "Action indisponible", "Créer une demande"]) assert.ok(panel.includes(token), "UI readiness contract missing: " + token);
assert.ok(moduleUi.includes("businessSubtypeCode={organization.businessSubtypeCode}"));
assert.ok(contract.includes("getSectorActivityCapability(sectorCode, blockCode)"));
assert.ok(!/(?:^|[,\\{]\\s*)source\\s*:/m.test(catalog) && !catalog.includes('type: "file"'), "Do not invent reference selector properties or fake file upload fields");
assert.ok(contract.includes('const verifiedRequests = new Set([') && contract.includes('verifiedRequests.has(blockCode)'), "Sensitive healthcare must use an explicit allowlist");
const healthAllowlist = contract.split("const verifiedRequests = new Set([")[1]?.split("]);")[0] || "";
for (const name of ["MY_ASSIGNED_PATIENTS", "MY_APPOINTMENTS", "REPORT_CONFIDENTIALITY_ISSUE"]) assert.ok(!healthAllowlist.includes(name), "Sensitive health action must not be submitted through Activities: " + name);
assert.ok(contract.includes('if (sectorCode === "PHARMACY")'), "Dedicated Pharmacy flows must remain separate");
assert.match(route, /new Date\(\`\$\{value\}T00:00:00Z\`\)\.toISOString\(\)\.slice\(0, 10\) !== value/);
for (const token of ["discountPercent", "ENTERPRISE_ACTIVITY_DISCOUNT_INVALID", "requestedAmount", "ENTERPRISE_ACTIVITY_CURRENCY_INVALID", "/^[A-Z]{3}$/"]) assert.ok(route.includes(token), "Validated amount, discount and currency contract missing: " + token);
console.log("Hotfix #876: 94 legacy actions audited; 60 explicit request forms, 14 blocked operations, 6 hospitality and 14 clinical/dedicated actions classified. No fake business writes: PASS");
