import { EnterpriseWorkflowError } from "@/lib/enterprise/workflows/errors";
import { WORKFLOW_LIMITS } from "@/lib/enterprise/workflows/constants";

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9.]*)\s*}}/g;

export function validateTemplatePlaceholders(template: string, allowed: ReadonlySet<string>) {
  if (template.length > WORKFLOW_LIMITS.maxTemplateLength) {
    throw new EnterpriseWorkflowError("Le modèle de texte dépasse la longueur autorisée.", 400, "WORKFLOW_TEMPLATE_TOO_LONG", "CONFIGURATION");
  }
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!allowed.has(match[1])) {
      throw new EnterpriseWorkflowError(`Le placeholder ${match[1]} n'est pas autorisé.`, 400, "WORKFLOW_PLACEHOLDER_NOT_ALLOWED", "CONFIGURATION");
    }
  }
}

function escapePlainText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 500);
}

export function renderWorkflowTemplate(template: string, values: Record<string, unknown>, allowed: ReadonlySet<string>) {
  validateTemplatePlaceholders(template, allowed);
  return template.replace(PLACEHOLDER_PATTERN, (_token, key: string) => escapePlainText(values[key]));
}
