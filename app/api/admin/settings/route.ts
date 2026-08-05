import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminSettingsSchema } from "@/lib/validators";
import { writeAuditLog } from "@/lib/audit";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";

const editableFields = [
  "defaultDailyMessageLimit", "defaultDailyTokenLimit", "chatbotEnabled", "publicAgentEnabled",
  "allowNonClientPublicationDrafts", "maintenanceMode", "supportAutoCloseDays", "allowClientAnnouncements",
  "commentEditWindowMinutes", "notificationRetentionDays", "signUpOtpEnabled", "signUpOtpExpirationMinutes",
] as const;

function snapshot(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(editableFields.map((key) => [key, value[key] as Prisma.InputJsonValue])) as Prisma.InputJsonObject;
}

export async function PATCH(req: Request) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.SETTINGS_MANAGE);
  if (access.response) return access.response;
  const body = adminSettingsSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid settings", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  const before = await prisma.appSetting.findUnique({ where: { id: "global" } });
  const updateData = Object.fromEntries(editableFields.map((key) => [key, body.data[key]]));
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-vercel-id") || null;
  const [settings] = await prisma.$transaction(async (tx) => {
    const next = await tx.appSetting.upsert({ where: { id: "global" }, update: updateData, create: { id: "global", ...updateData } });
    if (body.data.applyLimitsToExistingUsers) {
      await tx.user.updateMany({ data: { dailyMessageLimit: body.data.defaultDailyMessageLimit, dailyTokenLimit: body.data.defaultDailyTokenLimit } });
    }
    await tx.platformSettingHistory.create({
      data: {
        settingCode: "APP_SETTINGS_GLOBAL",
        category: "APPLICATION",
        valueType: "OBJECT",
        previousValue: before ? snapshot(before as unknown as Record<string, unknown>) : Prisma.JsonNull,
        nextValue: snapshot(next as unknown as Record<string, unknown>),
        sensitive: false,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "PRODUCTION",
        effect: body.data.maintenanceMode !== before?.maintenanceMode ? "MAINTENANCE_MODE_CHANGED" : "SETTINGS_UPDATED",
        restartRequired: false,
        reason: body.data.reason,
        actorUserId: access.session.userId,
        requestId,
      },
    });
    return [next];
  });

  await writeAuditLog({
    userId: access.session.userId,
    requestId,
    action: "CONSOLE_SETTINGS_UPDATED",
    entity: "AppSetting",
    entityId: settings.id,
    before: before ? snapshot(before as unknown as Record<string, unknown>) : undefined,
    after: snapshot(settings as unknown as Record<string, unknown>),
    reasonCode: access.reasonCode,
    riskLevel: body.data.maintenanceMode !== before?.maintenanceMode ? "HIGH" : "MEDIUM",
    metadata: { reason: body.data.reason, applyLimitsToExistingUsers: body.data.applyLimitsToExistingUsers },
    request: req,
  });

  return NextResponse.json({ ok: true, settings, reasonCode: access.reasonCode });
}
