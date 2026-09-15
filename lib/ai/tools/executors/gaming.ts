import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import { ERP_AI_TOOL_INPUT_SCHEMAS } from "@/lib/ai/tools/erp-contract";
import { getEnterpriseAccountingAccess } from "@/lib/enterprise/accounting/access";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { getGamingDashboardSnapshot } from "@/lib/enterprise/gaming/analytics";
import { getEnterpriseGamingDashboardAccess } from "@/lib/enterprise/gaming/access";

const TOOL_CODE = "ERP_GAMING_PERFORMANCE_READ" as const;

function organizationFromContext(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  return organizationId;
}

const gamingPerformanceExecutor: AiToolExecutor = async ({ args, context }) => {
  const parsed = ERP_AI_TOOL_INPUT_SCHEMAS[TOOL_CODE].parse(args || {});
  const organizationId = organizationFromContext(context);
  const [gamingAccess, assetsAccess, financeAccess] = await Promise.all([
    getEnterpriseGamingDashboardAccess({ session: context.session, organizationId, action: "read" }),
    getEnterpriseCommonDomainAccess({ session: context.session, organizationId, moduleCode: "ASSETS_MAINTENANCE", action: "read" }),
    getEnterpriseAccountingAccess({ session: context.session, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "view" }),
  ]);
  if (!gamingAccess) throw new Error("GAMING_DASHBOARD_ACCESS_DENIED");
  const snapshot = await getGamingDashboardSnapshot(organizationId, {
    periodDays: parsed.periodDays,
    includeAssets: Boolean(assetsAccess),
    includeFinance: Boolean(financeAccess),
  });
  const { operational } = snapshot;
  return {
    toolName: TOOL_CODE,
    label: "Performance Gaming",
    status: operational.stationCount > 0 || operational.sessionsEnded > 0 ? "AVAILABLE" : "EMPTY",
    summary: `${operational.stationCount} poste(s) Gaming, ${operational.activeSessions} session(s) active(s), ${operational.sessionsEnded} session(s) terminée(s) sur ${snapshot.periodDays} jour(s), avec un taux d’absence observé de ${operational.noShowRate}%.`,
    asOf: snapshot.asOf,
    data: {
      observationPolicy: "FACTUAL_OBSERVATIONS_ONLY_NO_CAUSAL_INFERENCE",
      periodStart: snapshot.periodStart,
      periodDays: snapshot.periodDays,
      operational: snapshot.operational,
      assetSignals: snapshot.assetSignals,
      financialByCurrency: snapshot.financialByCurrency,
      sourceAccess: {
        gamingDashboard: true,
        assetsMaintenance: Boolean(assetsAccess),
        financeReceivables: Boolean(financeAccess),
      },
      limitations: [
        "Les montants de devises différentes ne sont jamais additionnés sans base de change explicite.",
        "L’outil décrit uniquement les faits présents dans les sources autorisées et ne déduit pas de causalité.",
        "Les signaux Actifs et Finance sont omis lorsque l’utilisateur ne possède pas les permissions correspondantes.",
      ],
    },
  };
};

export const GAMING_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  [TOOL_CODE]: gamingPerformanceExecutor,
};
