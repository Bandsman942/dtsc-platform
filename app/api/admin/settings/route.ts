import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminSettingsSchema } from "@/lib/validators";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = adminSettingsSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const settings = await prisma.appSetting.upsert({
    where: { id: "global" },
    update: {
      defaultDailyMessageLimit: body.data.defaultDailyMessageLimit,
      defaultDailyTokenLimit: body.data.defaultDailyTokenLimit,
      chatbotEnabled: body.data.chatbotEnabled,
      publicAgentEnabled: body.data.publicAgentEnabled,
      allowNonClientPublicationDrafts: body.data.allowNonClientPublicationDrafts,
      maintenanceMode: body.data.maintenanceMode,
      supportAutoCloseDays: body.data.supportAutoCloseDays,
      allowClientAnnouncements: body.data.allowClientAnnouncements,
      commentEditWindowMinutes: body.data.commentEditWindowMinutes,
      notificationRetentionDays: body.data.notificationRetentionDays,
      signUpOtpEnabled: body.data.signUpOtpEnabled,
      signUpOtpExpirationMinutes: body.data.signUpOtpExpirationMinutes,
    },
    create: {
      id: "global",
      defaultDailyMessageLimit: body.data.defaultDailyMessageLimit,
      defaultDailyTokenLimit: body.data.defaultDailyTokenLimit,
      chatbotEnabled: body.data.chatbotEnabled,
      publicAgentEnabled: body.data.publicAgentEnabled,
      allowNonClientPublicationDrafts: body.data.allowNonClientPublicationDrafts,
      maintenanceMode: body.data.maintenanceMode,
      supportAutoCloseDays: body.data.supportAutoCloseDays,
      allowClientAnnouncements: body.data.allowClientAnnouncements,
      commentEditWindowMinutes: body.data.commentEditWindowMinutes,
      notificationRetentionDays: body.data.notificationRetentionDays,
      signUpOtpEnabled: body.data.signUpOtpEnabled,
      signUpOtpExpirationMinutes: body.data.signUpOtpExpirationMinutes,
    },
  });

  if (body.data.applyLimitsToExistingUsers) {
    await prisma.user.updateMany({
      data: {
        dailyMessageLimit: body.data.defaultDailyMessageLimit,
        dailyTokenLimit: body.data.defaultDailyTokenLimit,
      },
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ADMIN_SETTINGS_UPDATED",
    entity: "AppSetting",
    entityId: settings.id,
    metadata: {
      applyLimitsToExistingUsers: body.data.applyLimitsToExistingUsers,
      signUpOtpEnabled: body.data.signUpOtpEnabled,
      signUpOtpExpirationMinutes: body.data.signUpOtpExpirationMinutes,
    },
    request: req,
  });

  return NextResponse.json({ ok: true, settings });
}
