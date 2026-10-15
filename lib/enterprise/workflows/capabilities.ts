import { getWorkflowEntityAdapter } from "@/lib/enterprise/workflows/adapters";
import { workflowConditionError } from "@/lib/enterprise/workflows/conditions";
import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { validateWorkflowGraph, type WorkflowReadinessBlocker } from "@/lib/enterprise/workflows/graph";
import { workflowReadinessMessage } from "@/lib/enterprise/workflows/readiness-messages";
import { workflowSourceModule } from "@/lib/enterprise/workflows/runtime-utils";
import { validateTemplatePlaceholders } from "@/lib/enterprise/workflows/template";
import type { EnterpriseWorkflowTemplate } from "@/lib/enterprise/workflows/templates";
import { workflowVersionSchema, type WorkflowVersionInput } from "@/lib/enterprise/workflows/validators";

type Source = { triggerEntityType: string | null; triggerEventType: string | null };

// Used both by the catalogue and publication. Capabilities are the actual adapter
// methods/allowlists, never a second list of supposedly supported finance actions.
export function getWorkflowContractReadiness(source: Source, input: WorkflowVersionInput) {
  const graph = validateWorkflowGraph(input);
  const blockers: WorkflowReadinessBlocker[] = [...graph.blockers];
  const add = (code: string, stepCode?: string) => blockers.push({ code, message: workflowReadinessMessage(code), ...(stepCode ? { stepCode } : {}) });
  if (!source.triggerEntityType) add("MISSING_TRIGGER_ENTITY");
  else {
    try {
      const adapter = getWorkflowEntityAdapter(source.triggerEntityType);
      workflowSourceModule(source.triggerEntityType);
      if (source.triggerEventType && !adapter.triggerEvents.has(source.triggerEventType)) add("INVALID_TRIGGER_EVENT");
      const condition = (value: NonNullable<WorkflowVersionInput["transitions"][number]["condition"]>, stepCode: string) => {
        const invalid = workflowConditionError(adapter, value);
        if (invalid) add(invalid, stepCode);
      };
      for (const step of input.steps) {
        const text: Array<string | undefined> = [];
        switch (step.stepType) {
          case "CONDITION": condition(step.configuration.condition, step.code); break;
          case "WAIT_UNTIL":
            if (step.configuration.mode === "ENTITY_DATE" && adapter.conditionFields.get(step.configuration.field) !== "DATE") add("INVALID_WAIT_FIELD", step.code);
            break;
          case "DOMAIN_ACTION":
            if (!adapter.domainActions.has(step.configuration.action)) add("INVALID_DOMAIN_ACTION", step.code);
            text.push(step.configuration.commentTemplate);
            break;
          case "CREATE_APPROVAL":
            if (!adapter.createApproval) add("APPROVAL_TARGET_UNSUPPORTED", step.code);
            text.push(step.configuration.titleTemplate);
            break;
          case "CREATE_TASK": text.push(step.configuration.titleTemplate, step.configuration.descriptionTemplate); break;
          case "NOTIFICATION": text.push(step.configuration.titleTemplate, step.configuration.bodyTemplate); break;
        }
        for (const value of text) if (value) {
          try { validateTemplatePlaceholders(value, adapter.placeholders); }
          catch (error) { add(error instanceof EnterpriseWorkflowError ? error.code : "INVALID_TYPED_CONFIGURATION", step.code); }
        }
      }
      for (const route of input.transitions) if (route.condition) condition(route.condition, route.fromStepCode);
    } catch (error) { add(error instanceof EnterpriseWorkflowError ? error.code : "INVALID_TYPED_CONFIGURATION"); }
  }
  return { ready: blockers.length === 0, blockers, orderedStepCodes: graph.orderedStepCodes };
}

export function getWorkflowTemplateCompatibility(template: EnterpriseWorkflowTemplate) {
  const parsed = workflowVersionSchema.safeParse(template.version);
  if (!parsed.success) return { ready: false, blockers: [{ code: "INVALID_TYPED_CONFIGURATION", message: workflowReadinessMessage("INVALID_TYPED_CONFIGURATION") }], orderedStepCodes: [] };
  return getWorkflowContractReadiness(template, parsed.data);
}
