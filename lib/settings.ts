import type { AppSetting } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_APP_SETTINGS: AppSetting = {
  id: "global",
  defaultDailyMessageLimit: 30,
  defaultDailyTokenLimit: 100000,
  chatbotEnabled: true,
  publicAgentEnabled: true,
  allowNonClientPublicationDrafts: false,
  maintenanceMode: false,
  supportAutoCloseDays: 7,
  allowClientAnnouncements: false,
  announcementEditWindowMinutes: 30,
  commentEditWindowMinutes: 15,
  notificationRetentionDays: 60,
  signUpOtpEnabled: true,
  signUpOtpExpirationMinutes: 10,
  adminRoleAccess: {},
  updatedAt: new Date(0),
};

/** Read-only settings resolver. It never bootstraps or mutates during rendering. */
export async function getAppSettings(): Promise<AppSetting> {
  return (await prisma.appSetting.findUnique({ where: { id: "global" } })) || DEFAULT_APP_SETTINGS;
}

export async function bootstrapAppSettings() {
  return prisma.appSetting.upsert({ where: { id: "global" }, update: {}, create: { id: "global" } });
}
