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
  assert.ok([1184, 1219, 1222].includes(change.issue), "Only reviewed Retail hotfix #1184, print #1219 and return workflow #1222 may amend ROUTES-05A handlers");
  assert.match(change.blobSha, /^[0-9a-f]{40}$/, "Approved handler must specify its exact Git blob");
  assert.ok(manifest.routes.some(route => route.handlerPath === change.handlerPath), "Approved handler must exist in ROUTES-05A");
  return [change.handlerPath, change];
}));
assert.equal(approvedChanges.size, (manifest.approvedHandlerChanges || []).length, "Duplicate approved handler path");
assert.equal(approvedChanges.size, 7, "Only four retained #1184, print #1219 and two #1222 return handlers may depart from baseline");
assert.equal((manifest.approvedHandlerChanges || []).filter(change => change.issue === 1184).length, 4);
const printChange = (manifest.approvedHandlerChanges || []).filter(change => change.issue === 1219);
assert.equal(printChange.length, 1, "Only one #1219 print-handler exception is permitted");
assert.equal(printChange[0].handlerPath, "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/print/handler.ts", "Cashierless exception must remain print-only");

const reviewedReturnChanges = (manifest.approvedHandlerChanges || []).filter(change => change.issue === 1222);
assert.equal(reviewedReturnChanges.length, 2, "Exactly the reviewed decision and settlement handlers belong to #1222");
assert.deepEqual(reviewedReturnChanges.map(change => change.handlerPath).sort(), [
  "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/decision/handler.ts",
  "app/api/enterprise/[organizationId]/retail/invoices/[invoiceId]/returns/[requestId]/settle/handler.ts",
].sort(), "No other route is approved by #1222");
const reviewedDecision = reviewedReturnChanges.find(change => change.handlerPath.endsWith("/decision/handler.ts"));
assert.equal(reviewedDecision.previousApproval?.issue, 1184, "Historical high-risk decision approval must be retained");
assert.equal(reviewedDecision.previousApproval?.blobSha, "7fa66959699d470e1dcbb233c79a51ddfee20273", "Prior reviewed #1184 decision blob must remain auditable");

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
// #1224 adds a read-only, site-scoped invoice-status filter and a concise
// active-return projection to the original collection GET. Only this exact
// reviewed Git blob may differ; the ROUTES-05A immutable handlers and
// their baseline remain strictly protected.
const approvedRootChanges = manifest.approvedRootChanges || [];
assert.equal(approvedRootChanges.length, 1, "Only one #1224 invoice-root exception may be registered");
const rootChange = approvedRootChanges[0];
assert.deepEqual(
  { issue: rootChange.issue, path: rootChange.path },
  { issue: 1224, path: root },
  "The reviewed root exception must be limited to #1224 and the collection GET",
);
assert.match(rootChange.blobSha, /^[0-9a-f]{40}$/, "Reviewed root must pin an exact Git blob");
const baselineRootSha = execFileSync("git", ["rev-parse", manifest.baselineCommit + ":" + root], { encoding: "utf8" }).trim();
assert.notEqual(rootChange.blobSha, baselineRootSha, "A reviewed amendment must explicitly differ from the ROUTES baseline");
assert.equal(hash(root), rootChange.blobSha, "Invoice collection root deviated from reviewed #1224 blob");
const rootSource = fs.readFileSync(root, "utf8");
assert.match(rootSource, /export async function GET\(/, "Invoice root must retain GET");
assert.match(rootSource, /export async function POST\(/, "Invoice root must retain POST");
assert.match(rootSource, /supportedStatuses\.includes\(status\)/, "Invoice status server filter must remain guarded");
assert.match(rootSource, /retailInvoiceVisibleSites\(/, "Site-scoped invoice projection must remain guarded");
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
console.log(`ROUTES-05A parity OK: ${manifest.routes.length - approvedChanges.size} original handlers + four #1184, one #1219 and two #1222 reviewed amendments; reviewed #1224 invoice collection GET and immutable dispatchers, 21 reclaimed source entries. No unreviewed handler change permitted.`);
