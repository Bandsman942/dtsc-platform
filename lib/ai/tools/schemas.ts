import { z } from "zod";

const emptyInput = z.object({}).strict();
const pharmacyResult = z.object({
  toolName: z.string().min(1),
  label: z.string().min(1),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export const AI_TOOL_INPUT_SCHEMAS = {
  PHARMACY_DASHBOARD_READ: emptyInput,
  PHARMACY_LOW_STOCK_READ: emptyInput,
  PHARMACY_EXPIRY_READ: emptyInput,
  PHARMACY_OPEN_ALERTS_READ: emptyInput,
  PHARMACY_TODAY_SALES_READ: emptyInput,
  PHARMACY_CASH_SESSIONS_READ: emptyInput,
  PHARMACY_OPEN_PURCHASES_READ: emptyInput,
  PHARMACY_QUALITY_INCIDENTS_READ: emptyInput,
  PHARMACY_DOCUMENTS_SUMMARY_READ: emptyInput,
  TASK_DRAFT_PREPARE: z.object({ title: z.string().trim().min(1).max(180), description: z.string().trim().max(4000).optional() }).strict(),
  SUPPORT_TICKET_CREATE: z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(10).max(8000), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) }).strict(),
  DTSC_CONTACT_EMAIL_SEND: z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(10).max(8000) }).strict(),
} as const;

export const AI_TOOL_OUTPUT_SCHEMAS = {
  PHARMACY_DASHBOARD_READ: pharmacyResult,
  PHARMACY_LOW_STOCK_READ: pharmacyResult,
  PHARMACY_EXPIRY_READ: pharmacyResult,
  PHARMACY_OPEN_ALERTS_READ: pharmacyResult,
  PHARMACY_TODAY_SALES_READ: pharmacyResult,
  PHARMACY_CASH_SESSIONS_READ: pharmacyResult,
  PHARMACY_OPEN_PURCHASES_READ: pharmacyResult,
  PHARMACY_QUALITY_INCIDENTS_READ: pharmacyResult,
  PHARMACY_DOCUMENTS_SUMMARY_READ: pharmacyResult,
  TASK_DRAFT_PREPARE: z.object({ title: z.string(), description: z.string().nullable(), status: z.literal("DRAFT") }),
  SUPPORT_TICKET_CREATE: z.object({ ticketId: z.string(), status: z.string() }),
  DTSC_CONTACT_EMAIL_SEND: z.object({ contactMessageId: z.string(), sent: z.boolean() }),
} as const;

export type AiToolSchemaCode = keyof typeof AI_TOOL_INPUT_SCHEMAS;

export function getAiToolInputSchema(code: string) {
  return AI_TOOL_INPUT_SCHEMAS[code as AiToolSchemaCode] || null;
}

export function getAiToolOutputSchema(code: string) {
  return AI_TOOL_OUTPUT_SCHEMAS[code as AiToolSchemaCode] || null;
}
