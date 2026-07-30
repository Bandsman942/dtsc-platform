import { z } from "zod";
import { ASSISTANT_RESPONSE_LENGTHS, ASSISTANT_RESPONSE_STYLES } from "@/lib/assistant-conversation-preferences";

export const chatConversationActionSchema = z.object({
  action: z.enum(["update", "configure", "pin", "unpin", "archive", "restore"]).default("update"),
  title: z.string().trim().min(2).max(120).optional(),
  projectName: z.string().trim().max(120).optional().or(z.literal("")),
  projectId: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  modelOverride: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  responseStyle: z.enum(ASSISTANT_RESPONSE_STYLES).optional().nullable(),
  responseLength: z.enum(ASSISTANT_RESPONSE_LENGTHS).optional().nullable(),
  useCompanyContext: z.boolean().optional(),
  useKnowledge: z.boolean().optional(),
  customInstructions: z.string().trim().max(4_000).optional().nullable().or(z.literal("")),
});
