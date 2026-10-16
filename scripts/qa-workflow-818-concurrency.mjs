import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const calls = [];
let status = "DRAFT";
let stored = {
  configurationJson: { "visual.node.START.x": 24 },
  steps: [
    { code: "START", name: "Start", description: null, stepType: "START", position: 0, configurationJson: {} },
    { code: "END", name: "End", description: null, stepType: "END", position: 1, configurationJson: { outcome: "COMPLETED" } },
  ],
  transitions: [{
    fromStep: { code: "START" }, toStep: { code: "END" }, outcome: "DEFAULT",
    priority: 0, conditionJson: null,
  }],
};
const tx = {
  $queryRaw: async (_query) => { calls.push("row-lock"); return [{ id: "version-1" }]; },
  enterpriseWorkflowVersion: {
    findFirst: async ({ where }) => { calls.push("read"); return where.organizationId === "tenant-a" && where.definitionId === "definition-1" && where.id === "version-1" ? { ...stored, status } : null; },
  },
  enterpriseWorkflowTransition: { deleteMany: async () => { calls.push("delete-transition"); return { count: 1 }; } },
  enterpriseWorkflowStep: { deleteMany: async () => { calls.push("delete-step"); return { count: 2 }; } },
};
const prisma = { $transaction: async callback => callback(tx) };
const loader = workflowTestLoader({
  "@/lib/prisma": { prisma },
  "@/lib/enterprise/workflows/capabilities": { getWorkflowContractReadiness: () => ({ ready: true }), getWorkflowTemplateCompatibility: () => ({ ready: true }) },
  "@/lib/enterprise/workflows/readiness-messages": { workflowReadinessMessage: () => "OK" },
  "@/lib/enterprise/workflows/graph": {},
  "@/lib/enterprise/workflows/templates": { getEnterpriseWorkflowTemplate: () => null },
  "@/lib/enterprise/workflows/validators": { workflowVersionSchema: { parse: value => value } },
});
const { workflowVersionEditToken, saveWorkflowVersion } = loader("@/lib/enterprise/workflows/definitions");
const token = workflowVersionEditToken(stored);
assert.match(token, /^[0-9a-f]{64}$/, "Client sees only a digest, not raw business data");
const shuffled = { ...stored, steps: [...stored.steps].reverse() };
assert.equal(workflowVersionEditToken(shuffled), token, "Unstable DB row ordering must not spuriously reject a draft");
assert.notEqual(workflowVersionEditToken({ ...stored, configurationJson: { "visual.node.START.x": 25 } }), token, "Moving a visual node invalidates older snapshots");
assert.notEqual(workflowVersionEditToken({ ...stored, steps: stored.steps.map(s => s.code === "END" ? { ...s, name: "Changed" } : s) }), token, "Renaming an ERP step invalidates the stale editor");
assert.notEqual(workflowVersionEditToken({ ...stored, transitions: [...stored.transitions, { ...stored.transitions[0], outcome: "REJECTED" }] }), token, "Branch changes invalidate the token");
const raw = { steps: [], transitions: [] };
await assert.rejects(saveWorkflowVersion("tenant-a", "definition-1", "version-1", "actor-a", raw, "0".repeat(64)), error => error.code === "WORKFLOW_DRAFT_CONFLICT" && error.status === 409);
assert.deepEqual(calls, ["row-lock", "read"], "A stale editor may never delete a step or transition");
calls.length = 0;
status = "PUBLISHED";
await assert.rejects(saveWorkflowVersion("tenant-a", "definition-1", "version-1", "actor-a", raw, token), error => error.code === "PUBLISHED_WORKFLOW_IMMUTABLE" && error.status === 409);
assert.deepEqual(calls, ["row-lock", "read"], "Published graph remains immutable");
calls.length = 0;
status = "DRAFT";
await assert.rejects(saveWorkflowVersion("tenant-b", "definition-1", "version-1", "actor-a", raw, token), error => error.code === "WORKFLOW_VERSION_NOT_FOUND" && error.status === 404);
assert.deepEqual(calls, ["row-lock", "read"], "Cross-tenant edit may not mutate any graph");
const ui = fs.readFileSync("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", "utf8");
const api = fs.readFileSync("app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/route.ts", "utf8");
const detail = fs.readFileSync("app/api/enterprise/[organizationId]/workflows/[id]/route.ts", "utf8");
for (const check of ["editToken: draftEditToken", "setDraftEditToken(", "!draftEditToken"]) assert.ok(ui.includes(check), "Client must preserve edit token and fail closed: " + check);
assert.ok(api.includes("z.string().regex(/^[a-f0-9]{64}$/)"), "PATCH requires an explicit 64-character edit token");
assert.ok(api.includes("parsed.data.editToken"), "PATCH must send the client's snapshot token to the service");
assert.ok(detail.includes("access.canEditDraft ? Object.fromEntries"), "Read-only actors must not receive edit tokens");
assert.ok(detail.includes("workflowVersionEditToken(v)"), "GET uses the exact same hashing algorithm as PATCH");
console.log("PASS WF-05 concurrency: row lock, deterministic snapshot hashing, stale/published/cross-tenant refusal and no destructive writes.");
