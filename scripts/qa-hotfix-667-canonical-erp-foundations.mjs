import fs from "node:fs";
import path from "node:path";

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => fs.readFileSync(file, "utf8");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const enterpriseRoutes = walk("app/api/enterprise").filter((file) => file.endsWith(".ts"));
for (const file of enterpriseRoutes) {
  const content = read(file);
  check(!content.includes('"Invalid payload"'), `${file} still returns the generic "Invalid payload" contract.`);
  check(!/message\s*:\s*error\.message/.test(content), `${file} exposes error.message directly in an API response or payload.`);
  check(!/error instanceof Error \? error\.message/.test(content), `${file} keeps a raw exception-message branch; use a stable code/safe message instead.`);
}

const commonHttp = read("lib/enterprise/common/http.ts");
check(commonHttp.includes("export function enterpriseValidationErrorResponse"), "Common ERP HTTP must expose enterpriseValidationErrorResponse.");
check(commonHttp.includes("fieldErrors: error.issues.map"), "Validation responses must expose structured field metadata.");
check(commonHttp.includes("validation: issue.code"), "Validation responses must expose validation kinds.");
check(!commonHttp.includes("value: issue"), "Validation responses must never echo submitted field values.");

const professional = read("components/enterprise/professional/professional-erp-ui.tsx");
for (const token of [
  "export class ProfessionalApiError",
  "readonly code: string",
  "readonly clientMessage: string | null",
  "readonly details: unknown",
  "readonly status: number",
  "export async function professionalRequest",
  "return professionalRequest<Record<string, unknown>>(endpoint",
]) check(professional.includes(token), `Professional API client is missing: ${token}`);
check(!/export async function professionalMutation[\s\S]{0,900}throw new Error/.test(professional), "professionalMutation must not collapse structured API errors into Error.");

const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
check(financeUi.includes('"ProfessionalApiError"'), "Finance safe-error rendering must accept the shared ProfessionalApiError contract.");

const requestWrappers = [
  "components/enterprise/professional/asset-disposal-panel.tsx",
  "components/enterprise/professional/closing-operations-panel.tsx",
  "components/enterprise/professional/periodic-accounting-panel.tsx",
  "components/enterprise/professional/enterprise-exchange-rates-workspace.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace-hotfix.tsx",
  "components/enterprise/professional/enterprise-finance-treasury-workspace.tsx",
  "components/enterprise/professional/enterprise-accounting-workspace.tsx",
  "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx",
];
for (const file of requestWrappers) {
  const content = read(file);
  check(content.includes("professionalRequest"), `${file} must delegate to the shared Professional API client.`);
  const functionIndex = content.indexOf("async function requestJson");
  if (functionIndex >= 0) {
    const body = content.slice(functionIndex, functionIndex + 1400);
    check(!body.includes("throw new Error"), `${file} requestJson still collapses structured errors.`);
  }
}

const purchaseRoute = read("app/api/enterprise/[organizationId]/purchases/route.ts");
check(!purchaseRoute.includes("error instanceof Error ? error.message"), "Purchase create must not expose raw exception messages.");
check(purchaseRoute.includes("normalizeEnterpriseCoreV2Error"), "Purchase create must normalize unexpected failures.");

const aiChat = read("app/api/enterprise/ai/chat/route.ts");
check(!aiChat.includes("const message = error instanceof Error ? error.message"), "Enterprise AI chat must not persist raw provider exception messages.");
check(aiChat.includes('reasonCode: "UNKNOWN_PROVIDER_ERROR"'), "Enterprise AI chat must log a stable provider failure reason.");

if (failures.length) {
  console.error("Hotfix #667 Canonical ERP Foundations QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Hotfix #667 Canonical ERP Foundations QA passed across ${enterpriseRoutes.length} enterprise API TypeScript files.`);
