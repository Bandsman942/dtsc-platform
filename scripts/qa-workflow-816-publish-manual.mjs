import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

let currentStatus = "ACTIVE";
let currentOrganization = "tenant-a";
const updates = [];
const db = {
  enterpriseWorkflowDefinition: {
    updateMany: async ({ where, data }) => {
      updates.push({ where, data });
      if (where.organizationId !== currentOrganization || (where.status && where.status !== currentStatus)) return { count: 0 };
      return { count: 1 };
    },
    findFirst: async ({ where }) => where.organizationId === currentOrganization
      ? { id: "wf-1", status: currentStatus, versions: [] } : null,
  },
};
const loader = workflowTestLoader({
  "@/lib/prisma": { prisma: db },
  "@/lib/enterprise/workflows/capabilities": { getWorkflowContractReadiness: () => ({ ready: true }), getWorkflowTemplateCompatibility: () => ({ ready: true }) },
  "@/lib/enterprise/workflows/readiness-messages": { workflowReadinessMessage: () => "Ready" },
  "@/lib/enterprise/workflows/graph": {},
  "@/lib/enterprise/workflows/templates": { getEnterpriseWorkflowTemplate: () => null },
  "@/lib/enterprise/workflows/validators": { workflowDefinitionUpdateSchema: { parse: (value) => value } },
});
const { updateWorkflowDefinition } = loader("@/lib/enterprise/workflows/definitions");
await assert.rejects(updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { triggerType: "MANUAL" }), (error) => error.code === "WORKFLOW_PUBLISHED_TRIGGER_IMMUTABLE", "Published contract must remain immutable");
await assert.rejects(updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { allowManualStart: false }), (error) => error.code === "WORKFLOW_PUBLISHED_TRIGGER_IMMUTABLE");
await assert.rejects(updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { singleActiveRun: true }), (error) => error.code === "WORKFLOW_PUBLISHED_TRIGGER_IMMUTABLE");
await updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { name: "Nouveau nom" });
assert.equal(updates.at(-1).where.status, undefined, "Non-behavioral name change is allowed");
currentStatus = "DRAFT";
await updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { triggerType: "MANUAL" });
assert.equal(updates.at(-1).where.status, "DRAFT", "Behavior changes must atomically match DRAFT");
currentStatus = "RETIRED";
await assert.rejects(updateWorkflowDefinition(currentOrganization, "wf-1", "member-a", { triggerEventType: "OTHER" }), (error) => error.code === "WORKFLOW_PUBLISHED_TRIGGER_IMMUTABLE");

const activity = fs.readFileSync("lib/enterprise/enterprise-activity-workflows-loader.ts", "utf8");
assert.match(activity, /status: "ACTIVE",\s*allowManualStart: true/);
assert.match(activity, /versions: \{ some: \{ status: "PUBLISHED" \} \}/);
assert.ok(!activity.includes("prisma.enterpriseWorkflow.findMany"), "Activity must not revive legacy workflow engine");
const route = fs.readFileSync("app/api/enterprise/[organizationId]/workflows/[id]/versions/[versionId]/publish/route.ts", "utf8");
assert.ok(route.includes("allowManualStart: true, singleActiveRun: true"), "Review token covers manual-start contract");
assert.ok(route.includes("fresh.reviewToken !== parsed.data.reviewToken"), "Concurrent mutations invalidate review token");
const publish = fs.readFileSync("lib/enterprise/workflows/definitions.ts", "utf8");
assert.ok(publish.includes("Prisma.TransactionIsolationLevel.Serializable"), "Publication must reject conflicting transactions");
const manual = fs.readFileSync("app/api/enterprise/[organizationId]/workflow-runs/start/route.ts", "utf8");
assert.ok(manual.includes("isWorkflowManualSourceSelectable"), "Manual starter must validate actor-visible source");
const sourceRoute = fs.readFileSync("app/api/enterprise/[organizationId]/workflow-runs/sources/route.ts", "utf8");
assert.ok(sourceRoute.includes("requireWorkflowSourceAccess") && sourceRoute.includes("canStartManual"));
const ui = fs.readFileSync("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", "utf8");
for (const token of ["submitManualStart", "sourceEntityId", "runPage", "runPageCount", "runTotal", "runFilter", "new URLSearchParams(window.location.search).get(\"runId\")"]) assert.ok(ui.includes(token), `Missing real UI behavior: ${token}`);
const acl = fs.readFileSync("lib/enterprise/workflows/manual-source-access.ts", "utf8");
const sourceQueries = fs.readFileSync("lib/enterprise/workflows/manual-source-options.ts", "utf8");
assert.ok(acl.includes("findWorkflowManualSources") && acl.includes("sourceEntityId: entityId"), "POST reuses exact picker predicate");
assert.ok(sourceRoute.includes("findWorkflowManualSources"), "Picker reuses POST predicate");
for (const token of ["organizationId", "archivedAt: null", "allowAll", "createdByUserId", "requestedByUserId", "generatedByUserId", "default:", "return null"]) assert.ok(sourceQueries.includes(token), `Missing security guard: ${token}`);
console.log("PASS WF-03: immutable triggers, ACTIVE Activities, serializable reviewed publication, actor-scoped manual source and paginated/deep-linked UI.");
