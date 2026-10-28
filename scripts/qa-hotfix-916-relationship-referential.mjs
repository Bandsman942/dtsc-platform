import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static contract audit: NEVER assert that a catalog entry is an executed benefit.
const read = (name) => readFileSync(name, "utf8");
const identity = read("lib/enterprise/identity-links/contracts.ts");
const access = read("lib/enterprise/identity-links/access.ts");
const benefit = read("lib/enterprise/relationship-benefits/contracts.ts");
const service = read("lib/enterprise/relationship-benefits/service.ts");
const sql = read("prisma/migrations/20261017150000_identity_relation_types_check_alignment/migration.sql");
const oldQA = read("scripts/qa-hotfix-786-relationship-benefits-enforcement.mjs");

function enumValues(source, name) {
  const blocks = source.split(`export const ${name} = [`);
  assert.equal(blocks.length, 2, `Canonical ${name} declaration missing or duplicated`);
  const section = blocks[1].split("] as const;")[0];
  assert.ok(section, `Canonical ${name} closing bracket missing`);
  return [...section.matchAll(/"([A-Z_]+)"/g)].map((entry) => entry[1]);
}
const types = enumValues(identity, "ENTERPRISE_IDENTITY_RELATION_TYPES");
const benefits = enumValues(benefit, "RELATIONSHIP_BENEFIT_TYPES");
assert.equal(types.length, 23, "Unexpected number of canonical relation types");
assert.equal(new Set(types).size, types.length, "Duplicated relation types");
assert.ok(types.includes("SUPPLIER"), "SUPPLIER must be covered");
assert.equal(benefits.length, 15, "Unexpected number of benefit types");
assert.equal(new Set(benefits).size, benefits.length, "Duplicated benefit types");

const capabilityPairs = access.split("\n")
  .filter((line) => line.startsWith("  ") && line.includes(": [") && line.trimEnd().endsWith("],"))
  .map((line) => [line.trim().split(": [")[0], line.split(": [")[1].split("]")[0]]);
const capabilityMap = new Map(capabilityPairs);
assert.equal(capabilityMap.size, capabilityPairs.length, "Duplicate relation capability mapping");
assert.deepEqual([...capabilityMap.keys()].sort(), [...types].sort(),
  "Every canonical identity relation must have one and only one capability mapping");
for (const relationType of types) {
  assert.ok(capabilityMap.get(relationType).includes('"ENTERPRISE_BENEFITS"'),
    `No explicit benefit capability for ${relationType}`);
}
assert.match(access, /Record<EnterpriseIdentityRelationType, EnterpriseRelationshipCapability\[\]>/,
  "Capabilites must be exhaustively typed against the canonical relations");
assert.match(access, /if \(!isEnterpriseIdentityRelationType\(link.requestedRelationType\)\)/,
  "Unknown or retired relationship code must fail closed");
assert.doesNotMatch(access, /RELATION_CAPABILITIES\[link.requestedRelationType\] \|\| RELATION_CAPABILITIES\.OTHER/,
  "Unknown relation must not inherit OTHER benefits");
assert.match(access, /if \(!enabled.has\("RELATIONSHIP_BENEFITS"\) \|\| !allowedEntitlements.has\("RELATIONSHIP_BENEFITS"\)\)/,
  "Benefit capability must be conditioned on actual module and entitlement");
assert.match(access, /if \(!membership\)/, "Relationship must never grant employee privileges without membership");
assert.match(oldQA, /relationTypeBlock = identityContracts.match/, "Legacy QA must use the canonical relation type list");
assert.doesNotMatch(oldQA, /const relationTypes = \[\s*"/, "No 22-relation mirror list remains");

for (const field of ["requestedRelationType", "relationType"]) {
  const prefix = `CHECK ("${field}" IN (`;
  const blocks = sql.split(prefix);
  assert.equal(blocks.length, 2, `Missing or duplicated SQL CHECK constraint for ${field}`);
  const raw = blocks[1].split(")) NOT VALID")[0];
  const values = [...raw.matchAll(/'([A-Z_]+)'/g)].map((entry) => entry[1]);
  assert.deepEqual(values.sort(), [...types].sort(), `SQL CHECK ${field} diverges from canonical types`);
}


// Only approved business paths may have monetary effects. Every relation must
// be classified, but no relation creates a new adapter by itself.
const paths = new Map([
  ["DISCOUNT", "VERIFIED_RETAIL_OR_GAMING_PRICING"],
  ["FIXED_PRICE", "VERIFIED_RETAIL_PRICING"],
  ["CASHBACK", "VERIFIED_RETAIL_STORE_CREDIT"],
  ["LOYALTY", "VERIFIED_RETAIL_LOYALTY"],
  ["CREDIT", "MANUAL_APPROVAL_STORE_CREDIT"],
  ["DELIVERY", "REQUEST_WITH_SALES_FULFILLMENT_PROOF"],
]);
assert.match(service, /automaticRetailShape/, "Retail pricing adapter not found");
assert.match(service, /automaticGamingShape/, "Gaming pricing adapter not found");
assert.match(service, /retailCashbackShape/, "Cashback adapter not found");
assert.match(service, /retailLoyaltyShape/, "Loyalty adapter not found");
assert.match(service, /manualCreditShape/, "Manual credit adapter not found");
assert.match(service, /deliveryShape/, "Verified delivery adapter not found");
assert.match(service, /RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED/,
  "Unsupported automatic targets must fail closed");

const matrix = types.flatMap((relationType) => benefits.map((benefitType) => ({
  relationType, benefitType, contract: paths.get(benefitType) || "REQUEST_ONLY_NO_AUTO_EXECUTION",
})));
assert.equal(matrix.length, 345, "Every relation/benefit contract pair must be classified");
for (const cell of matrix) {
  assert.ok(capabilityMap.has(cell.relationType), "Unknown relation in test matrix");
  assert.ok(benefits.includes(cell.benefitType), "Unknown benefit in test matrix");
  assert.ok(cell.contract, "Missing explicit contract classification");
}
const classified = Object.fromEntries([...new Set(matrix.map((cell) => cell.contract))].map(
  (mode) => [mode, matrix.filter((cell) => cell.contract === mode).length],
));
console.log(`Hotfix #916 structural relation matrix: ${types.length} relations × ${benefits.length} benefit types = ${matrix.length} contracts.`);
console.log(JSON.stringify(classified));
console.log("Structural contract checks PASSED. Cross-tenant behavioral E2E and OWNER_E2E remain separate.");
