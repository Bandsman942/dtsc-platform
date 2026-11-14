import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEDICATED_HEALTH_LEGACY_MODULES,
  isRedactionCandidate,
  sanitizedLegacyFields,
} from "./lib/health-legacy-redaction.mjs";

assert.equal(DEDICATED_HEALTH_LEGACY_MODULES.length, 11);
const clinical = {
  id: "record-demo",
  organizationId: "fictional-test-tenant",
  sectorCode: "HEALTH_CARE",
  moduleCode: "CONSULTATIONS",
  title: "Fictitious patient",
  summary: "Fictitious private consultation",
  payloadJson: { diagnosis: "TEST_ONLY" },
  status: "LEGACY_READ_ONLY",
};
assert.equal(isRedactionCandidate(clinical), true);
const fields = sanitizedLegacyFields(clinical);
assert.deepEqual(fields, {
  title: "CONSULTATIONS · historique",
  summary: null,
  payloadJson: {},
});
assert.equal(isRedactionCandidate({ ...clinical, ...fields }), false, "Idempotence");
assert.equal(isRedactionCandidate({ ...clinical, sectorCode: "RETAIL" }), false, "Other sector untouched");
assert.equal(isRedactionCandidate({ ...clinical, moduleCode: "ANY_OTHER_MODULE" }), false, "Other module untouched");
assert.throws(() => sanitizedLegacyFields({ ...clinical, sectorCode: "RETAIL" }));
assert.throws(() => sanitizedLegacyFields({ ...clinical, moduleCode: "FINANCE" }));
for (const moduleCode of DEDICATED_HEALTH_LEGACY_MODULES) {
  assert.equal(isRedactionCandidate({ ...clinical, moduleCode }), true);
  assert.equal(isRedactionCandidate({ ...clinical, moduleCode, ...sanitizedLegacyFields({ ...clinical, moduleCode }) }), false);
}
const runner = fs.readFileSync("scripts/health-legacy-projection-redact.mjs", "utf8");
assert.match(runner, /organizationId,\s*sectorCode: "HEALTH_CARE"/, "Tenant and sector filter required");
assert.match(runner, /HEALTH_LEGACY_REDACTION_ENABLE/, "Environment gate required");
assert.match(runner, /SNAPSHOT_AND_OPERATOR_APPROVAL_REQUIRED/, "Snapshot and explicit approval required");
assert.match(runner, /maxScanned > MAX_SCAN/, "Bounded scan required");
assert.match(runner, /"offset"/, "Numeric privacy-safe pagination required");
assert.match(runner, /skip: offset/, "Pagination must resume at previous numeric offset");
assert.match(runner, /nextOffset: offset \+ totals\.scanned/, "Progress must be reported without row IDs");
assert.match(runner, /updatedAt: row\.updatedAt/, "Optimistic concurrency required");
assert.match(runner, /if \(!apply\) continue;/, "Dry run must not write");
assert.doesNotMatch(runner, /console\.log\([^\n]*row\./, "Do not log PHI or source row identifiers");
console.log("✅ HEALTH-01 legacy redaction: scope, idempotence, non-destructive default, snapshot gate, privacy.");
