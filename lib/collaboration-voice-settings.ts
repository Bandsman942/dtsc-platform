import { prisma } from "@/lib/prisma";

export const DEFAULT_COLLABORATION_VOICE_SETTINGS = {
  enabled: true,
  maxDurationSeconds: 300,
  maxFileSizeBytes: 16 * 1024 * 1024,
  rateLimitPerHour: 120,
} as const;

export type CollaborationVoiceSettings = {
  enabled: boolean;
  maxDurationSeconds: number;
  maxFileSizeBytes: number;
  rateLimitPerHour: number;
};

export async function getCollaborationVoiceSettings(): Promise<CollaborationVoiceSettings> {
  const settings = await prisma.collaborationVoiceSetting.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      enabled: DEFAULT_COLLABORATION_VOICE_SETTINGS.enabled,
      maxDurationSeconds: DEFAULT_COLLABORATION_VOICE_SETTINGS.maxDurationSeconds,
      maxFileSizeBytes: DEFAULT_COLLABORATION_VOICE_SETTINGS.maxFileSizeBytes,
      rateLimitPerHour: DEFAULT_COLLABORATION_VOICE_SETTINGS.rateLimitPerHour,
    },
  });

  return {
    enabled: settings.enabled,
    maxDurationSeconds: settings.maxDurationSeconds,
    maxFileSizeBytes: settings.maxFileSizeBytes,
    rateLimitPerHour: settings.rateLimitPerHour,
  };
}
