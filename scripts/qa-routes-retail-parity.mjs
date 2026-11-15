import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { sourceRouteCapacity, vercelBuildCapacity } from "./lib/route-capacity.mjs";

const manifest = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
const hash = p => execFileSync("git", ["hash-object", "--path=" + p, p], { encoding: "utf8" }).trim();
assert.equal(manifest.routes.length, 24);
// The delivered ROUTES-05A baseline is immutable. Later security-reviewed
// changes to a moved business handler must be explicit, per-issue and
// pinned to the new Git blob, rather than disabling routing parity wholesale.
const approvedChanges = new Map((manifest.approvedHandlerChanges || []).map(change => {
  assert.equal(change.issue, 1184, "An approved handler change must reference the reviewed hotfix issue");
  assert.match(change.blobSha, /^[0-9a-f]{40}$/, "Approved handler must specify its exact Git blob");
  assert.ok(manifest.routes.some(route => route.handlerPath === change.handlerPath), "Approved handler must exist in ROUTES-05A");
  return [change.handlerPath, change];
}));
assert.equal(approvedChanges.size, (manifest.approvedHandlerChanges || []).length, "Duplicate approved handler path");
assert.equal(approvedChanges.size, 5, "Only the five reviewed #1184 Retail handlers may depart from the baseline");
for (const route of manifest.routes) {
  assert.equal(execFileSync("git", ["rev-parse", manifest.baselineCommit + ":" + route.originalPath], { encoding: "utf8" }).trim(), route.originalBlobSha, "Manifest SHA must match the delivered baseline");
  assert.ok(!fs.existsSync(route.originalPath), "Old routable file retained: " + route.originalPath);
  const expectedSha = approvedChanges.get(route.handlerPath)?.blobSha || route.originalBlobSha;
  assert.equal(hash(route.handlerPath), expectedSha, "Unreviewed Retail handler change: " + route.handlerPath);
  const dispatcher = fs.readFileSync(`app/api/enterprise/[organizationId]/retail/${route.family}/[...operation]/route.ts`, "utf8");
  assert.ok(dispatcher.includes(JSON.stringify("@/" + route.handlerPath.slice(0, -3))), "Missing literal handler import");
  const methods = [...fs.readFileSync(route.handlerPath, "utf8").matchAll(/export (?:async )?function (GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b/g)].map(m => m[1]);
  assert.deepEqual(methods, route.methods, "Original HTTP exports changed");
}
const root = "app/api/enterprise/[organizationId]/retail/invoices/route.ts";
assert.equal(hash(root), execFileSync("git", ["rev-parse", manifest.baselineCommit + ":" + root], { encoding: "utf8" }).trim(), "Invoice collection root must remain unchanged");
const before = sourceRouteCapacity({ baseline: 915, current: 871, maxSourceFiles: 900, minimumFreed: 40 });
const after = sourceRouteCapacity({ baseline: 915, current: 850, maxSourceFiles: 900, minimumFreed: 40 });
assert.equal(before.effectiveCeiling, 875);
assert.equal(before.remainingSourceFiles, 4);
assert.equal(after.remainingSourceFiles, 25);
assert.equal(sourceRouteCapacity({ baseline: 915, current: 850, maxSourceFiles: 860, minimumFreed: 40 }).remainingSourceFiles, 10);
assert.equal(sourceRouteCapacity({ baseline: 915, current: 876, maxSourceFiles: 900, minimumFreed: 40 }).remainingSourceFiles, -1);
assert.equal(vercelBuildCapacity(null, 2048).remainingRules, null, "A source count never proves Vercel capacity");
assert.equal(vercelBuildCapacity(2000, 2048).remainingRules, 48);
assert.equal(vercelBuildCapacity(2049, 2048).remainingRules, -1);
assert.throws(() => vercelBuildCapacity(-1, 2048));
assert.throws(() => sourceRouteCapacity({ baseline: 915, current: NaN, maxSourceFiles: 900, minimumFreed: 40 }));
console.log(`ROUTES-05A parity OK: ${manifest.routes.length - approvedChanges.size} original handlers + ${approvedChanges.size} reviewed hotfix #1184 amendments; original invoice root and dispatcher, 21 reclaimed source entries. No unreviewed handler change permitted.`);
