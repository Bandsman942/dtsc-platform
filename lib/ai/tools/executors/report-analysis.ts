import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import {
  REPORT_ANALYSIS_AI_TOOL_CODE,
  reportAnalysisInputSchema,
} from "@/lib/ai/tools/report-analysis-contract";
import {
  enterpriseReportVisibilityWhere,
  getEnterpriseFinanceAccess,
} from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";
import { buildEnterpriseProfessionalReport } from "@/lib/reporting/enterprise-professional-report";

function requireOrganization(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  return organizationId;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countArrayEvidence(value: unknown, depth = 0): number {
  if (depth > 5 || value == null) return 0;
  if (Array.isArray(value)) {
    return value.length + value.reduce<number>((sum, item) => sum + countArrayEvidence(item, depth + 1), 0);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + countArrayEvidence(item, depth + 1), 0);
  }
  return 0;
}

function primitiveRows(model: ReturnType<typeof buildEnterpriseProfessionalReport>) {
  return model.rows.slice(0, 25).map((row) => Object.fromEntries(
    model.columns.map((column) => {
      const value = row[column.key];
      if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [column.label, value ?? null];
      }
      return [column.label, String(value)];
    }),
  ));
}

async function analyzeReport({ args, context }: Parameters<AiToolExecutor>[0]) {
  const parsed = reportAnalysisInputSchema.parse(args);
  const organizationId = requireOrganization(context);
  const access = await getEnterpriseFinanceAccess({
    session: context.session,
    organizationId,
    moduleCode: "REPORTS",
    action: "read",
  });
  if (!access) throw new Error("REPORTS_ACCESS_DENIED");

  const visibility = enterpriseReportVisibilityWhere({
    organizationId,
    userId: context.userId,
    canSeeAll: access.canSeeAll,
  });
  const report = await prisma.enterpriseReport.findFirst({
    where: {
      AND: [
        visibility,
        parsed.reportId ? { id: parsed.reportId } : { reference: parsed.reference! },
      ],
    },
    select: {
      reference: true,
      title: true,
      reportType: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      currency: true,
      generatedAt: true,
      freshnessAt: true,
      filtersJson: true,
      snapshotJson: true,
    },
  });
  if (!report) throw new Error("REPORT_NOT_FOUND_OR_FORBIDDEN");

  const locale = parsed.locale || "fr";
  const model = buildEnterpriseProfessionalReport({
    locale,
    organizationName: context.session.activeOrganizationName || "DTSC Platform",
    reference: report.reference,
    title: report.title,
    reportType: report.reportType,
    reportTypeLabel: report.reportType,
    generatedAt: report.generatedAt.toISOString(),
    periodStart: report.periodStart?.toISOString() || null,
    periodEnd: report.periodEnd?.toISOString() || null,
    currency: report.currency,
    snapshot: report.snapshotJson,
    filters: report.filtersJson,
  });

  const sourceEvidenceCount = countArrayEvidence(objectValue(report.snapshotJson));
  const status = sourceEvidenceCount > 0 ? "AVAILABLE" as const : "INSUFFICIENT_DATA" as const;
  const english = locale === "en";
  const instruction = english
    ? "State that this is DTSC AI-generated analysis. Base every conclusion on the supplied report evidence, quote the relevant values, do not infer causes or missing business context, keep currencies separate unless the report itself contains an explicit conversion, and say that evidence is insufficient when the status is INSUFFICIENT_DATA."
    : "Indiquez qu’il s’agit d’une analyse générée par l’IA DTSC. Fondez chaque conclusion sur les éléments du rapport fournis, citez les valeurs utiles, n’inférez aucune cause ni aucun contexte métier absent, gardez les devises séparées sauf conversion explicitement présente dans le rapport et signalez des données insuffisantes lorsque le statut vaut INSUFFICIENT_DATA.";

  return {
    toolName: REPORT_ANALYSIS_AI_TOOL_CODE,
    status,
    summary: status === "AVAILABLE"
      ? (english ? `Authorized snapshot evidence loaded for report ${report.reference}.` : `Les éléments autorisés du snapshot du rapport ${report.reference} sont disponibles pour l’analyse.`)
      : (english ? `Report ${report.reference} does not contain enough persisted evidence for a reliable interpretation.` : `Le rapport ${report.reference} ne contient pas assez d’éléments persistés pour une interprétation fiable.`),
    asOf: new Date().toISOString(),
    report: {
      reference: report.reference,
      title: report.title,
      reportType: report.reportType,
      status: report.status,
      periodStart: report.periodStart?.toISOString() || null,
      periodEnd: report.periodEnd?.toISOString() || null,
      currency: report.currency,
      generatedAt: report.generatedAt.toISOString(),
      freshnessAt: report.freshnessAt?.toISOString() || null,
      classification: "FINANCIAL_SENSITIVE" as const,
    },
    evidence: {
      rowCount: model.rows.length,
      filters: (model.filters || []).slice(0, 30),
      kpis: model.kpis.slice(0, 12).map((item) => ({ label: item.label, value: item.value, comparison: item.comparison || null })),
      chart: model.chart.slice(0, 12).map((item) => ({ label: item.label, value: item.value, displayValue: item.displayValue || null })),
      insights: model.insights.slice(0, 8).map((item) => ({ title: item.title, body: item.body, tone: item.tone || null })),
      rows: primitiveRows(model),
    },
    analysisPolicy: {
      disclosureRequired: true as const,
      causalClaimsAllowed: false as const,
      sourceBound: "PERSISTED_REPORT_SNAPSHOT" as const,
      instruction,
    },
  };
}

export const REPORT_ANALYSIS_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  [REPORT_ANALYSIS_AI_TOOL_CODE]: analyzeReport,
};
