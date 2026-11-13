import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { sourceRouteCapacity, vercelBuildCapacity } from "./lib/route-capacity.mjs";

const manifest = JSON.parse(fs.readFileSync("docs/routing/routes-05a-retail-manifest.json", "utf8"));
const hash = p => execFileSync("git", ["hash-object", "--path=" + p, p], { encoding: "utf8" }).trim();
assert.equal(manifest.routes.length, 24);
for (const route of manifest.routes) {
  assert.equal(execFileSync("git", ["rev-parse", manifest.baselineCommit + ":" + route.originalPath], { encoding: "utf8" }).trim(), route.originalBlobSha, "Manifest SHA must match the delivered baseline");
  assert.ok(!fs.existsSync(route.originalPath), "Old routable file retained: " + route.originalPath);
  assert.equal(hash(route.handlerPath), route.originalBlobSha, "Legacy Retail handler changed: " + route.handlerPath);
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
console.log("ROUTES-05A parity OK: 24 unchanged handlers, original invoice root, 21 reclaimed source entries; effective source margin 4 → 25, Vercel margin UNKNOWN without output config.");
