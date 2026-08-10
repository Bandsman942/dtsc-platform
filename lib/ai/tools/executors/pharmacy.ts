import { runPharmacyReadToolData } from "@/lib/enterprise-ai/pharmacy-tool-data";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

function executorFor(code: string): AiToolExecutor {
  return async ({ context }) => {
    if (!context.organizationId) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
    return runPharmacyReadToolData(context.organizationId, code);
  };
}

export const PHARMACY_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = Object.fromEntries(
  [
    "PHARMACY_DASHBOARD_READ",
    "PHARMACY_LOW_STOCK_READ",
    "PHARMACY_EXPIRY_READ",
    "PHARMACY_OPEN_ALERTS_READ",
    "PHARMACY_TODAY_SALES_READ",
    "PHARMACY_CASH_SESSIONS_READ",
    "PHARMACY_OPEN_PURCHASES_READ",
    "PHARMACY_QUALITY_INCIDENTS_READ",
    "PHARMACY_DOCUMENTS_SUMMARY_READ",
  ].map((code) => [code, executorFor(code)]),
);
