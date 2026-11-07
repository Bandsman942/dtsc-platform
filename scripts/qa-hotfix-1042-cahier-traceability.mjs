import assert from "node:assert/strict";
import fs from "node:fs";

// Static governance contract only. The actual acceptance of every rule needs
// a business/E2E proof; this script prevents the original PDF's sections
// from silently disappearing from our release checklist.
const source = fs.readFileSync("docs/RETAIL_1042_CAHIER_ACCEPTANCE_MATRIX.md", "utf8");
const chapters = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII"];
for (const chapter of chapters) {
  assert.ok(source.includes(`| ${chapter} —`), `Missing original chapter ${chapter}`);
}
for (let number = 1; number <= 20; number += 1) {
  const rule = `RG${String(number).padStart(2, "0")}`;
  assert.match(source, new RegExp(`^\\| ${rule} \\|`, "m"), `Missing original rule ${rule}`);
}
for (let number = 1; number <= 8; number += 1) {
  const decision = `D${String(number).padStart(2, "0")}`;
  assert.match(source, new RegExp(`^\\| ${decision} —`, "m"), `Missing final-page decision ${decision}`);
}
for (const item of [
  "OWNER_E2E", "E2E technique", "restauration vérifiée", "12 critères",
  "siteStaffIsolationEnabled", "invoiceCheckoutEnabled", "paramétrable", "refus par défaut",
]) {
  assert.ok(source.toLowerCase().includes(item.toLowerCase()), `Missing acceptance invariant: ${item}`);
}

console.log("HOTFIX #1042 cahier traceability: 17 chapters, RG01–RG20, D01–D08 and two E2E layers documented");
