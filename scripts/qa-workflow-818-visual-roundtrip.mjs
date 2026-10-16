import assert from "node:assert/strict";
import fs from "node:fs";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const { projectWorkflowVersion, applyWorkflowVisualPositions } = workflowTestLoader({})("@/lib/enterprise/workflows/visual-projection");
const steps = Array.from({ length: 10 }, (_, i) => ({
  code: `STEP_${i + 1}`,
  name: `Step ${i + 1}`,
  stepType: i === 0 ? "START" : i === 9 ? "END" : i === 3 ? "CONDITION" : "NOTIFICATION",
  position: i,
  configuration: { titleTemplate: "Authorized", recipient: { strategy: "ENTITY_CREATOR" } },
}));
const transitions = steps.slice(1).map((step, i) => ({
  fromStepCode: steps[i].code, toStepCode: step.code,
  outcome: i === 3 ? "TRUE" : "DEFAULT", priority: i,
  ...(i === 3 ? { condition: { field: "status", operator: "EQUALS", value: "OPEN" } } : {}),
}));
const version = {
  steps, transitions, configuration: { purpose: "business", "visual.node.STEP_1.x": 500, "visual.node.STEP_1.y": 125 },
};
const original = JSON.stringify(version);
const view = projectWorkflowVersion(version);
assert.equal(view.nodes.length, 10);
assert.equal(view.edges.length, 9);
assert.equal(view.nodes[0].x, 500);
assert.equal(view.nodes[0].y, 125);
assert.equal(view.nodes[5].x, 282);
assert.equal(view.nodes[5].y, 200);
assert.equal(view.edges[3].outcome, "TRUE");
assert.equal(JSON.stringify(version), original, "Projection is immutable");
const moved = applyWorkflowVisualPositions(version, [
  { id: "STEP_1", x: 734.6, y: 240.8 },
  { id: "STEP_4", x: 920, y: 340 },
  { id: "UNKNOWN", x: 100, y: 100 },
]);
assert.deepEqual(moved.steps, version.steps);
assert.deepEqual(moved.transitions, version.transitions);
assert.deepEqual(moved.configuration.purpose, "business");
assert.equal(moved.configuration["visual.node.STEP_1.x"], 735);
assert.equal(moved.configuration["visual.node.STEP_1.y"], 241);
assert.equal(moved.configuration["visual.node.STEP_4.x"], 920);
assert.ok(!Object.hasOwn(moved.configuration, "visual.node.UNKNOWN.x"));
assert.deepEqual(projectWorkflowVersion(moved).nodes.find((node) => node.id === "STEP_4"), { id: "STEP_4", name: "Step 4", stepType: "CONDITION", position: 3, x: 920, y: 340 });
assert.equal(JSON.stringify(version), original, "Layout save must not mutate the original draft");
const invalid = applyWorkflowVisualPositions(version, [{ id: "STEP_4", x: Number.NaN, y: 12 }, { id: "STEP_5", x: -100, y: 1e9 }]);
assert.equal(invalid.configuration["visual.node.STEP_4.x"], undefined, "Invalid coordinates are not persisted");
assert.equal(invalid.configuration["visual.node.STEP_5.x"], 0);
assert.equal(invalid.configuration["visual.node.STEP_5.y"], 20_000);
const code = fs.readFileSync("lib/enterprise/workflows/visual-projection.ts", "utf8");
for (const forbidden of ["prisma.", "fetch(", "eval(", "new Function", "workflowRun.create", "axios", "executeDomainAction"]) assert.ok(!code.includes(forbidden), `Canvas projection must not execute effects: ${forbidden}`);

const visualUi = fs.readFileSync("components/enterprise/core-v2/workflow-visual-studio.tsx", "utf8");
const workspace = fs.readFileSync("components/enterprise/core-v2/enterprise-workflows-workspace.tsx", "utf8");
assert.ok(workspace.startsWith('"use client";'), "Next.js workspace must stay a client component");
assert.ok(workspace.includes("<WorkflowVisualStudio"), "A working visual editor must be wired to the workflow screen");
assert.ok(workspace.includes("configuration: draftConfiguration"), "Visual coordinates must be persisted through the canonical PATCH");
assert.ok(workspace.includes("setDraftConfiguration(draft?.configurationJson || {})"), "Existing saved coordinates must rehydrate");
assert.ok(workspace.includes("undoHistory") && workspace.includes("redoHistory"), "Bounded undo/redo must be available");
for (const token of ["onPointerDown", "onPointerMove", "onPointerUp", "setPointerCapture", "onKeyDown", "ArrowRight", "onConnect", "onRename", "onDeleteStep", "onUndo", "onRedo", "Zoom", "lg:block", "Accessible step list"]) {
  assert.ok(visualUi.includes(token), `Visual editor is missing the required interaction/accessibility: ${token}`);
}
assert.ok(visualUi.includes('disabled={!editable') && visualUi.includes("aria-pressed"), "Published version must be read-only and nodes selectable");
assert.ok(workspace.includes("readinessForDraft") && workspace.includes("<WorkflowPublishReview"), "Visual editing must still use canonical readiness and human publication review");


assert.ok(visualUi.includes("onDuplicateStep") && workspace.includes("duplicateVisualStep"), "Node duplication must be wired");
assert.ok(visualUi.includes("onUpdateConfiguration") && workspace.includes("workflowStepSchema.safeParse"), "Advanced properties must be validated with the canonical step schema");
assert.ok(workspace.includes('["START", "END"].includes(original.stepType)'), "Must not clone unique START or END sentinels");
const { workflowStepSchema } = workflowTestLoader({})("@/lib/enterprise/workflows/validators");
const validCondition = { code: "CHECK", name: "Check status", stepType: "CONDITION", position: 1, configuration: { condition: { field: "status", operator: "EQUALS", value: "OPEN" } } };
assert.equal(workflowStepSchema.safeParse(validCondition).success, true);
assert.equal(workflowStepSchema.safeParse({ ...validCondition, configuration: { condition: { field: "x; DROP TABLE", operator: "EQUALS" } } }).success, false, "Arbitrary fields must be rejected");
assert.equal(workflowStepSchema.safeParse({ code: "START", name: "Start", stepType: "START", position: 0, configuration: {} }).success, true);

console.log("PASS WF-05: ten-node canonical graph projection, branches and all conditions preserved, versioned coordinates and no effects.");
