import { z } from "zod";
import type { WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { evaluateWorkflowCondition, workflowConditionError } from "@/lib/enterprise/workflows/conditions";
import { workflowConditionSchema } from "@/lib/enterprise/workflows/validators";

/**
 * WF-06B candidate contracts are pure helpers, NOT wired to V1 runtime.
 * Never bypass the adapter's allow-list or use arbitrary JS/JSONPath to read
 * an entity. API/runtime integration requires a separate certified tranche.
 */
type LeafCondition = z.infer<typeof workflowConditionSchema>;
export type WorkflowBooleanExpression =
  | { kind: "LEAF"; condition: LeafCondition }
  | { kind: "AND" | "OR"; children: WorkflowBooleanExpression[] };

const rawExpressionSchema: z.ZodType<WorkflowBooleanExpression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("LEAF"), condition: workflowConditionSchema }).strict(),
    z.object({ kind: z.literal("AND"), children: z.array(rawExpressionSchema).min(2).max(8) }).strict(),
    z.object({ kind: z.literal("OR"), children: z.array(rawExpressionSchema).min(2).max(8) }).strict(),
  ]),
);

export const workflowBooleanExpressionSchema = rawExpressionSchema.superRefine((expression, ctx) => {
  let nodes = 0;
  let leaves = 0;
  function visit(node: WorkflowBooleanExpression, depth: number): void {
    nodes++;
    if (depth > 4) ctx.addIssue({ code: "custom", message: "Workflow condition depth exceeds 4" });
    if (nodes > 31) ctx.addIssue({ code: "custom", message: "Workflow condition nodes exceed 31" });
    if (node.kind === "LEAF") {
      leaves++;
      if (leaves > 24) ctx.addIssue({ code: "custom", message: "Workflow condition leaves exceed 24" });
    } else if (depth <= 5) node.children.forEach((child) => visit(child, depth + 1));
  }
  visit(expression, 1);
});

/** Validates ALL predicates first, including branches skipped by AND/OR. */
export function evaluateWorkflowBooleanExpression(
  adapter: WorkflowEntityAdapter,
  entity: WorkflowEntitySnapshot,
  raw: unknown,
): boolean {
  const expression = workflowBooleanExpressionSchema.parse(raw);
  function preflight(node: WorkflowBooleanExpression): void {
    if (node.kind === "LEAF") {
      const invalid = workflowConditionError(adapter, node.condition);
      if (invalid) throw new Error(`WORKFLOW_BOOLEAN_${invalid}`);
    } else node.children.forEach(preflight);
  }
  preflight(expression);
  function evaluate(node: WorkflowBooleanExpression): boolean {
    if (node.kind === "LEAF") return evaluateWorkflowCondition(adapter, entity, node.condition);
    return node.kind === "AND" ? node.children.every(evaluate) : node.children.some(evaluate);
  }
  return evaluate(expression);
}

const VARIABLE_LIMIT = 16;
const OUTPUT_BYTE_LIMIT = 4_096;
const mappingField = z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9.]*$/).max(80);
const variableName = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/)
  .refine((name) => !name.startsWith("SYS_") && !name.startsWith("INTERNAL_"), "Reserved variable name");
export const workflowVariableMappingsSchema = z.array(z.object({
  target: variableName,
  sourceField: mappingField,
  type: z.enum(["STRING", "NUMBER", "BOOLEAN", "DATE"]),
}).strict()).min(1).max(VARIABLE_LIMIT).superRefine((mappings, ctx) => {
  const names = new Set<string>();
  for (const [i, mapping] of mappings.entries()) {
    if (names.has(mapping.target)) ctx.addIssue({ code: "custom", path: [i, "target"], message: "Duplicate variable name" });
    names.add(mapping.target);
  }
});

function projectScalar(type: "STRING" | "NUMBER" | "BOOLEAN" | "DATE", value: unknown): string | boolean | null {
  if (value === null || value === undefined) return null;
  if (type === "STRING") {
    if (typeof value !== "string" || value.length > 256) throw new Error("WORKFLOW_MAPPING_VALUE_INVALID");
    return value;
  }
  if (type === "BOOLEAN") {
    if (typeof value !== "boolean") throw new Error("WORKFLOW_MAPPING_VALUE_INVALID");
    return value;
  }
  if (type === "NUMBER") {
    // Preserve decimal precision and do not coerce arbitrary objects.
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.length <= 80 && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
    throw new Error("WORKFLOW_MAPPING_VALUE_INVALID");
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && z.string().datetime({ offset: true }).safeParse(value).success) return new Date(value).toISOString();
  throw new Error("WORKFLOW_MAPPING_VALUE_INVALID");
}

/**
 * Explicit readableFields must be authorized per tenant/actor/module at the
 * call site. conditionFields alone NEVER authorizes projection of an amount,
 * identifier, or another sensitive field into a downstream payload.
 */
export function projectWorkflowVariables(
  adapter: WorkflowEntityAdapter,
  entity: WorkflowEntitySnapshot,
  rawMappings: unknown,
  readableFields: ReadonlySet<string>,
): Record<string, string | boolean | null> {
  const mappings = workflowVariableMappingsSchema.parse(rawMappings);
  const output: Record<string, string | boolean | null> = Object.create(null);
  for (const mapping of mappings) {
    if (!readableFields.has(mapping.sourceField)) throw new Error("WORKFLOW_MAPPING_PERMISSION_DENIED");
    if (adapter.conditionFields.get(mapping.sourceField) !== mapping.type) throw new Error("WORKFLOW_MAPPING_FIELD_INVALID");
    output[mapping.target] = projectScalar(mapping.type, adapter.getConditionField(entity, mapping.sourceField));
  }
  if (Buffer.byteLength(JSON.stringify(output), "utf8") > OUTPUT_BYTE_LIMIT) throw new Error("WORKFLOW_MAPPING_PAYLOAD_TOO_LARGE");
  return output;
}
