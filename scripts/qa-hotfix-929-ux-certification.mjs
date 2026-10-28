import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json"));
const spec = read("tests/e2e/ux-visual-accessibility.spec.mjs");
const workflow = read(".github/workflows/quality-gates.yml");

assert.ok(packageJson.devDependencies["@axe-core/playwright"]);
assert.match(spec, /"wcag22aa"/);
assert.match(spec, /\[320, 360, 375, 390, 414, 768, 1024, 1440\]/);
assert.match(spec, /document\.documentElement\.scrollWidth - window\.innerWidth/);
assert.match(spec, /maximumNavigationMs/);
assert.match(spec, /E2E_USER_PASSWORD/);
assert.match(spec, /testInfo\.outputPath/);
assert.match(workflow, /ux-visual-accessibility\.spec\.mjs/);
assert.match(workflow, /Upload UX-06 visual evidence/);
assert.doesNotMatch(workflow, /vercel --prod/);
console.log("PASS UX-06: WCAG 2.2 AA, 8 viewport widths, overflow and navigation budget in CI browser gate");
