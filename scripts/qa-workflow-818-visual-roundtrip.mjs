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
console.log("PASS WF-05: ten-node canonical graph projection, branches and all conditions preserved, versioned coordinates and no effects.");
