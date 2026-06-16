import { z } from "zod";

export const enterpriseAiChatSchema = z.object({
  organizationId: z.string().min(1).max(160),
  conversationId: z.string().max(160).optional().or(z.literal("")),
  content: z.string().trim().min(1).max(8_000),
  model: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  useKnowledge: z.coerce.boolean().default(true),
  useTools: z.coerce.boolean().default(true),
});

export const enterpriseAiKnowledgeUploadSchema = z.object({
  organizationId: z.string().min(1).max(160),
  title: z.string().trim().min(2).max(180).optional().or(z.literal("")),
  sectorCode: z.string().trim().max(80).optional().or(z.literal("")),
  moduleCode: z.string().trim().max(80).optional().or(z.literal("")),
  confidentiality: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "MANAGERS_ONLY"]).default("INTERNAL"),
});

export const enterpriseAiKnowledgeListSchema = z.object({
  organizationId: z.string().min(1).max(160),
  cursor: z.string().max(160).optional().or(z.literal("")),
  status: z.enum(["PROCESSING", "READY", "FAILED", "ARCHIVED"]).optional(),
});

export const enterpriseAiKnowledgeActionSchema = z.object({
  organizationId: z.string().min(1).max(160),
  action: z.enum(["archive", "restore"]),
});

export const enterpriseAiConversationListSchema = z.object({
  organizationId: z.string().min(1).max(160),
});

export const enterpriseAiUsageQuerySchema = z.object({
  organizationId: z.string().min(1).max(160),
});

export const enterpriseAiSettingsUpdateSchema = z.object({
  organizationId: z.string().min(1).max(160),
  enabled: z.coerce.boolean(),
  defaultLanguage: z.enum(["fr", "en"]).default("fr"),
  allowKnowledgeUpload: z.coerce.boolean(),
  allowReadTools: z.coerce.boolean(),
  allowActionDrafts: z.coerce.boolean(),
  retentionDays: z.coerce.number().int().min(30).max(3650),
});
