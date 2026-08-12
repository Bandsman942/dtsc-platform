import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const workflowDirectory = path.join(process.cwd(), ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowDirectory)
  .filter((file) => /\.ya?ml$/i.test(file));

let occurrences = 0;
const violations = [];

for (const file of workflowFiles) {
  const workflowPath = path.join(workflowDirectory, file);
  const source = fs.readFileSync(workflowPath, "utf8");

  for (const match of source.matchAll(/actions\/upload-artifact@v(\d+)/g)) {
    occurrences += 1;
    const major = Number(match[1]);
    if (major < 7) {
      violations.push(`${path.relative(process.cwd(), workflowPath)} utilise actions/upload-artifact@v${major}`);
    }
  }
}

assert.ok(
  occurrences > 0,
  "Le contrat CI attend au moins une utilisation explicite de actions/upload-artifact.",
);

assert.deepEqual(
  violations,
  [],
  `Runtime GitHub Actions non supporté détecté : ${violations.join(" ; ")}. Utiliser actions/upload-artifact@v7+ pour éviter le runtime Node.js 20 déprécié.`,
);

console.log(`GitHub Actions upload runtime QA passed: ${occurrences} occurrence(s) utilisent actions/upload-artifact@v7+.`);
