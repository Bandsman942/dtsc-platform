import { z } from "zod";

export const collaborationPreferenceSchema = z.object({
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  notifications: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
  mutedUntil: z.union([z.string().datetime(), z.literal(""), z.null()]).optional(),
});

export const collaborationStoryMetadataSchema = z.object({
  caption: z.string().trim().max(280).optional().or(z.literal("")),
});

export const collaborationVoiceMetadataSchema = z.object({
  durationMs: z.coerce.number().int().min(250).max(60 * 60 * 1000),
  replyToId: z.string().max(120).optional().or(z.literal("")),
  waveform: z.array(z.coerce.number().min(0).max(1)).max(96).optional().default([]),
});

export const collaborationVoiceSettingsSchema = z.object({
  enabled: z.boolean(),
  maxDurationSeconds: z.coerce.number().int().min(1).max(60 * 60),
  maxFileSizeBytes: z.coerce.number().int().min(256 * 1024).max(100 * 1024 * 1024),
  rateLimitPerHour: z.coerce.number().int().min(1).max(2000),
});
