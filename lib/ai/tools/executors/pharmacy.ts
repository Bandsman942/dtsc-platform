import { runPharmacyReadTools } from "@/lib/enterprise-ai/pharmacy-tools";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

const PHARMACY_READ_BRIDGE: Record<string, { trigger: string; legacyToolName: string }> = {
  PHARMACY_DASHBOARD_READ: { trigger: "synthèse générale", legacyToolName: "pharmacy.dashboard.summary" },
  PHARMACY_LOW_STOCK_READ: { trigger: "stock faible", legacyToolName: "pharmacy.stock.low" },
  PHARMACY_EXPIRY_READ: { trigger: "lots péremption fefo", legacyToolName: "pharmacy.batches.expiring" },
  PHARMACY_OPEN_ALERTS_READ: { trigger: "alertes urgentes", legacyToolName: "pharmacy.alerts.open" },
  PHARMACY_TODAY_SALES_READ: { trigger: "ventes du jour recette", legacyToolName: "pharmacy.sales.today" },
  PHARMACY_CASH_SESSIONS_READ: { trigger: "caisse paiement écart", legacyToolName: "pharmacy.cash.sessions" },
  PHARMACY_OPEN_PURCHASES_READ: { trigger: "commandes achats fournisseurs", legacyToolName: "pharmacy.purchases.open" },
  PHARMACY_QUALITY_INCIDENTS_READ: { trigger: "qualité pharmacovigilance incident", legacyToolName: "pharmacy.quality.open" },
  PHARMACY_DOCUMENTS_SUMMARY_READ: { trigger: "documents conformité certificat", legacyToolName: "pharmacy.documents.summary" },
};

function executorFor(code: string): AiToolExecutor {
  return async ({ context }) => {
    if (!context.organizationId) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
    const bridge = PHARMACY_READ_BRIDGE[code];
    if (!bridge) throw new Error("PHARMACY_TOOL_EXECUTOR_MISSING");
    const results = await runPharmacyReadTools(context.organizationId, bridge.trigger);
    const result = results.find((item) => item.toolName === bridge.legacyToolName);
    if (!result) throw new Error("PHARMACY_TOOL_RESULT_MISSING");
    return result;
  };
}

export const PHARMACY_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = Object.fromEntries(
  Object.keys(PHARMACY_READ_BRIDGE).map((code) => [code, executorFor(code)]),
);
