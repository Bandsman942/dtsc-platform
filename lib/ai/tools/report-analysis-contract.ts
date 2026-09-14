import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/tool-registry";
import { assistantCodesForErpModule } from "@/lib/ai/tools/erp-assistant-policy";

export const REPORT_ANALYSIS_AI_TOOL_CODE = "ERP_REPORT_ANALYSIS_READ" as const;

export const reportAnalysisInputSchema = z.object({
  reportId: z.string().trim().min(1).max(120).optional(),
  reference: z.string().trim().min(3).max(120).optional(),
  locale: z.enum(["fr", "en"]).optional(),
}).strict().refine((value) => Boolean(value.reportId) !== Boolean(value.reference), {
  message: "Provide exactly one of reportId or reference.",
});

const reportAnalysisRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const reportAnalysisOutputSchema = z.object({
  toolName: z.literal(REPORT_ANALYSIS_AI_TOOL_CODE),
  status: z.enum(["AVAILABLE", "INSUFFICIENT_DATA"]),
  summary: z.string(),
  asOf: z.string().min(1),
  report: z.object({
    reference: z.string(),
    title: z.string(),
    reportType: z.string(),
    status: z.string(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    currency: z.string().nullable(),
    generatedAt: z.string(),
    freshnessAt: z.string().nullable(),
    classification: z.literal("FINANCIAL_SENSITIVE"),
  }).strict(),
  evidence: z.object({
    rowCount: z.number().int().min(0),
    filters: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(30),
    kpis: z.array(z.object({ label: z.string(), value: z.string(), comparison: z.string().nullable() }).strict()).max(12),
    chart: z.array(z.object({ label: z.string(), value: z.number(), displayValue: z.string().nullable() }).strict()).max(12),
    insights: z.array(z.object({ title: z.string(), body: z.string(), tone: z.enum(["info", "success", "warning", "danger"]).nullable() }).strict()).max(8),
    rows: z.array(reportAnalysisRowSchema).max(25),
  }).strict(),
  analysisPolicy: z.object({
    disclosureRequired: z.literal(true),
    causalClaimsAllowed: z.literal(false),
    sourceBound: z.literal("PERSISTED_REPORT_SNAPSHOT"),
    instruction: z.string(),
  }).strict(),
}).strict();

export const REPORT_ANALYSIS_AI_TOOL_DEFINITIONS: AiToolDefinition[] = [{
  code: REPORT_ANALYSIS_AI_TOOL_CODE,
  labelKey: "ai.tools.reports.analysis.label",
  descriptionKey: "Analyser un rapport d’entreprise déjà généré et autorisé à partir de son snapshot persisté uniquement. Présenter toute interprétation comme générée par l’IA DTSC, citer les valeurs qui la justifient, ne jamais inventer une cause ou un contexte absent du rapport et signaler explicitement les données insuffisantes.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", minLength: 1, maxLength: 120 },
      reference: { type: "string", minLength: 3, maxLength: 120 },
      locale: { enum: ["fr", "en"] },
    },
    oneOf: [
      { required: ["reportId"], not: { required: ["reference"] } },
      { required: ["reference"], not: { required: ["reportId"] } },
    ],
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
  contexts: ["ORGANIZATION"],
  requiredModuleCodes: ["REPORTS"],
  requiredPermissions: ["ENTERPRISE_AI.TOOLS.READ"],
  minimumPlan: "BUSINESS",
  allowedAssistantCodes: assistantCodesForErpModule("REPORTS"),
  mode: "READ",
  requiresConfirmation: false,
  idempotent: false,
  auditLevel: "SENSITIVE",
}];

export const REPORT_ANALYSIS_AI_TOOL_INPUT_SCHEMAS = {
  [REPORT_ANALYSIS_AI_TOOL_CODE]: reportAnalysisInputSchema,
};

export const REPORT_ANALYSIS_AI_TOOL_OUTPUT_SCHEMAS = {
  [REPORT_ANALYSIS_AI_TOOL_CODE]: reportAnalysisOutputSchema,
};
