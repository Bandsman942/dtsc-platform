import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { WorkflowConditionFieldType, WorkflowEntityAdapter, WorkflowEntitySnapshot } from "@/lib/enterprise/workflows/adapters/types";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import type { WorkflowTransitionInput } from "@/lib/enterprise/workflows/validators";

type Condition = NonNullable<WorkflowTransitionInput["condition"]>;
const ordered = new Set(["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"]);
const dateValue = z.union([z.string().date(), z.string().datetime({ offset: true })]);

function isValue(value: unknown, type: WorkflowConditionFieldType) {
  if (type === "STRING") return typeof value === "string";
  if (type === "BOOLEAN") return typeof value === "boolean";
  if (type === "DATE") return dateValue.safeParse(value).success;
  // Decimal strings preserve monetary precision; coercion of booleans/empty strings is forbidden.
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) return false;
  try { return new Prisma.Decimal(value).isFinite(); } catch { return false; }
}

export function workflowConditionError(adapter: Pick<WorkflowEntityAdapter, "conditionFields">, condition: Condition) {
  const type = adapter.conditionFields.get(condition.field);
  if (!type) return "INVALID_CONDITION_FIELD";
  if (condition.operator === "EXISTS" || condition.operator === "NOT_EXISTS") return condition.value === undefined ? null : "INVALID_CONDITION_VALUE";
  if (ordered.has(condition.operator) && type !== "NUMBER" && type !== "DATE") return "INVALID_CONDITION_OPERATOR";
  const values = condition.operator === "IN" || condition.operator === "NOT_IN";
  if (values) return Array.isArray(condition.value) && condition.value.length > 0 && condition.value.every((value) => isValue(value, type)) ? null : "INVALID_CONDITION_VALUE";
  return !Array.isArray(condition.value) && isValue(condition.value, type) ? null : "INVALID_CONDITION_VALUE";
}

export function evaluateWorkflowCondition(adapter: WorkflowEntityAdapter, entity: WorkflowEntitySnapshot, condition: Condition) {
  const invalid = workflowConditionError(adapter, condition);
  if (invalid) throw new EnterpriseWorkflowError("Vérifiez le champ, la comparaison et la valeur de cette condition.", 409, invalid, "CONFIGURATION");
  const type = adapter.conditionFields.get(condition.field)!;
  const left = adapter.getConditionField(entity, condition.field);
  if (condition.operator === "EXISTS") return left !== null && left !== undefined;
  if (condition.operator === "NOT_EXISTS") return left === null || left === undefined;
  // Missing optional values never behave like zero, false or an empty string.
  if (left === null || left === undefined) return false;
  const compare = (right: unknown) => {
    if (type === "NUMBER") {
      const value = new Prisma.Decimal(left as Prisma.Decimal.Value);
      if (!value.isFinite()) throw new EnterpriseWorkflowError("La valeur numérique source est invalide.", 409, "INVALID_CONDITION_VALUE", "BUSINESS");
      return value.comparedTo(right as Prisma.Decimal.Value);
    }
    if (type === "DATE") {
      const value = left instanceof Date ? left.getTime() : new Date(String(left)).getTime();
      if (!Number.isFinite(value)) throw new EnterpriseWorkflowError("La date source est invalide.", 409, "INVALID_CONDITION_VALUE", "BUSINESS");
      return Math.sign(value - new Date(String(right)).getTime());
    }
    return left === right ? 0 : 1;
  };
  if (condition.operator === "IN" || condition.operator === "NOT_IN") {
    const included = (condition.value as unknown[]).some((value) => compare(value) === 0);
    return condition.operator === "IN" ? included : !included;
  }
  const comparison = compare(condition.value);
  switch (condition.operator) {
    case "EQUALS": return comparison === 0;
    case "NOT_EQUALS": return comparison !== 0;
    case "GREATER_THAN": return comparison > 0;
    case "GREATER_THAN_OR_EQUAL": return comparison >= 0;
    case "LESS_THAN": return comparison < 0;
    case "LESS_THAN_OR_EQUAL": return comparison <= 0;
    default: return false;
  }
}
