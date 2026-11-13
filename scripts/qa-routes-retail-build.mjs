import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const manifest = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
const budget = JSON.parse(fs.readFileSync("artifacts/routing/route-budget.json", "utf8"));
const families = [...new Set(manifest.routes.map(r => r.family))];
assert.equal(manifest.routes.length - families.length, manifest.expected.freedSourceFiles);
assert.ok(budget.sourceCapacity.remainingSourceFiles >= 0, "The shared source routing budget must remain respected");
// Keep the baseline as evidence without freezing future contributions at 850 files.
if (process.argv.includes("--require-pilot-counts")) {
  assert.equal(budget.currentSourceFiles, manifest.expected.sourceFiles);
  assert.equal(budget.groupCounts["enterprise/retail"], manifest.expected.retailHandlers);
  assert.equal(budget.sourceCapacity.remainingSourceFiles, manifest.expected.sourceHeadroom);
}
const functions = families.map(family => {
  const entry = `.next/server/app/api/enterprise/[organizationId]/retail/${family}/[...operation]/route.js`;
  const tracePath = entry + ".nft.json";
  if (!fs.existsSync(tracePath)) return { family, evidence: "NOT_AVAILABLE", tracedFiles: null, tracedSourceBytes: null };
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  const paths = new Set([path.resolve(entry), ...trace.files.map(p => path.resolve(path.dirname(tracePath), p))]);
  let bytes = 0;
  let missingFiles = 0;
  for (const file of paths) {
    try { const stat = fs.statSync(file); if (stat.isFile()) bytes += stat.size; } catch { missingFiles++; }
  }
  return { family, evidence: missingFiles ? "PARTIAL_NEXT_TRACE_SOURCE_BYTES" : "NEXT_TRACE_SOURCE_BYTES", tracedFiles: paths.size, missingFiles, tracedSourceBytes: bytes };
});
if (process.argv.includes("--require-build")) assert.ok(functions.every(f => f.evidence === "NEXT_TRACE_SOURCE_BYTES" && f.tracedSourceBytes > 0), "Complete Next.js traces are required after build");
const report = { schemaVersion: 1, issue: 1145, sourceSha: process.env.GITHUB_SHA || null, platform: process.platform, node: process.version, pilotBaselineSourceFiles: manifest.baseline.sourceFiles, currentSourceFiles: budget.currentSourceFiles, pilotFreedSourceFiles: manifest.expected.freedSourceFiles, totalFreedSourceFiles: budget.freedSourceFiles, effectiveSourceHeadroomBeforePilot: manifest.baseline.sourceHeadroom, currentEffectiveSourceHeadroom: budget.sourceCapacity.remainingSourceFiles, vercel: budget.vercelBuildCapacity, functions, productionColdStart: "NOT_EXECUTED", productionP95: "NOT_EXECUTED", note: "Next trace source bytes are not the final Vercel function ZIP size. Source file headroom is not Vercel routing capacity." };
fs.writeFileSync("artifacts/routing/retail-functions-1145.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
