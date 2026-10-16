import type { WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

export type WorkflowVisualNode = {
  id: string;
  name: string;
  stepType: string;
  position: number;
  x: number;
  y: number;
};
export type WorkflowVisualEdge = {
  id: string;
  from: string;
  to: string;
  outcome: string;
  priority: number;
};

/** UI metadata lives only inside the version's canonical configurationJson. */
const positionKey = (code: string, axis: "x" | "y") => `visual.node.${code}.${axis}`;
const clamp = (n: number) => Math.max(0, Math.min(20_000, Math.round(n)));
function validCoordinate(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 20_000 ? value : fallback;
}

/** This projection is display-only. Never infer, delete, or reorder domain transitions. */
export function projectWorkflowVersion(version: WorkflowVersionInput): { nodes: WorkflowVisualNode[]; edges: WorkflowVisualEdge[] } {
  const settings = version.configuration || {};
  const sorted = [...version.steps].sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));
  const nodes = sorted.map((step, index) => ({
    id: step.code,
    name: step.name,
    stepType: step.stepType,
    position: step.position,
    x: validCoordinate(settings[positionKey(step.code, "x")], 32 + (index % 4) * 250),
    y: validCoordinate(settings[positionKey(step.code, "y")], 40 + Math.floor(index / 4) * 160),
  }));
  const edges = version.transitions.map((edge, index) => ({
    id: `${edge.fromStepCode}:${edge.toStepCode}:${edge.outcome || "DEFAULT"}:${edge.priority}:${index}`,
    from: edge.fromStepCode,
    to: edge.toStepCode,
    outcome: edge.outcome || "DEFAULT",
    priority: edge.priority,
  }));
  return { nodes, edges };
}

/** Only UI coordinates change; all conditions, adapter configs and branches remain byte-for-byte structurally equal. */
export function applyWorkflowVisualPositions(version: WorkflowVersionInput, nodes: Pick<WorkflowVisualNode, "id" | "x" | "y">[]): WorkflowVersionInput {
  const codes = new Set(version.steps.map((step) => step.code));
  const settings: Record<string, string | number | boolean | null> = { ...(version.configuration || {}) };
  for (const node of nodes) {
    if (!codes.has(node.id)) continue;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    settings[positionKey(node.id, "x")] = clamp(node.x);
    settings[positionKey(node.id, "y")] = clamp(node.y);
  }
  return { ...version, configuration: settings };
}
