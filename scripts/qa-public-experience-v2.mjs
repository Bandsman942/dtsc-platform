import assert from "node:assert/strict";
import fs from "node:fs";
const read = (f) => fs.readFileSync(f, "utf8");
for (const file of ["app/page.tsx", "app/ressources/page.tsx", "app/ressources/[slug]/page.tsx", "components/public/public-nav.tsx", "lib/rich-content.ts", "tests/e2e/public-experience-v2.spec.mjs"]) {
  assert.ok(fs.existsSync(file), "Missing public experience surface: " + file);
}
const suite = read("tests/e2e/public-experience-v2.spec.mjs");
for (const token of ["320", "390", "1024", "1440", "AxeBuilder", "published: true", "deleteMany", "noOverflow", "category=ARTICLE"]) assert.ok(suite.includes(token), "Missing E2E contract: " + token);
const workflow = read(".github/workflows/quality-gates.yml");
assert.ok(workflow.includes("public-experience-v2.spec.mjs"), "Missing browser QA hook");
console.log("Public V2 E2E contract present; real browser evidence remains mandatory.");
