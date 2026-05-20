import { NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { isConfiguredOpenAIModel } from "@/lib/openai-config";
import { prisma } from "@/lib/prisma";
import { accountPreferencesSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = accountPreferencesSchema.safeParse(await req.json());

  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  }

  const preferredModel = body.data.preferredModel?.trim() || null;
  if (preferredModel && !isConfiguredOpenAIModel(preferredModel)) {
    await writeApiLog({
      request: req,
      statusCode: 400,
      userId: user.id,
      startedAt,
      metadata: { reason: "MODEL_NOT_CONFIGURED" },
    });
    return NextResponse.json({ error: "Model not configured" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferredModel,
      notifySupportEnabled: body.data.notifySupportEnabled,
      notifyUsageEnabled: body.data.notifyUsageEnabled,
      notifyBroadcastEnabled: body.data.notifyBroadcastEnabled,
      pushNotificationsEnabled: body.data.pushNotificationsEnabled,
      interfaceDensity: body.data.interfaceDensity,
      startPage: body.data.startPage,
      locale: body.data.locale,
      timezone: body.data.timezone,
      dateFormat: body.data.dateFormat,
      callSoundsEnabled: body.data.callSoundsEnabled,
      callNotificationsEnabled: body.data.callNotificationsEnabled,
      floatingCallAlertsEnabled: body.data.floatingCallAlertsEnabled,
      participantEventAlertsEnabled: body.data.participantEventAlertsEnabled,
      callAlertSoundEnabled: body.data.callAlertSoundEnabled,
      incomingCallBannerEnabled: body.data.incomingCallBannerEnabled,
      connectionIssueSoundsEnabled: body.data.connectionIssueSoundsEnabled,
      startMutedByDefault: body.data.startMutedByDefault,
      startCameraOffByDefault: body.data.startCameraOffByDefault,
      callSoundVolume: body.data.callSoundVolume,
      callAlertDisplayDuration: body.data.callAlertDisplayDuration,
      preferredAudioInputId: body.data.preferredAudioInputId || null,
      preferredVideoInputId: body.data.preferredVideoInputId || null,
      preferredAudioOutputId: body.data.preferredAudioOutputId || null,
      emailDigestFrequency: body.data.emailDigestFrequency,
      chatResponseStyle: body.data.chatResponseStyle,
      chatResponseLength: body.data.chatResponseLength,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "account.preferences.update",
    entity: "User",
    entityId: user.id,
    metadata: {
      preferredModel,
      pushNotificationsEnabled: body.data.pushNotificationsEnabled,
      interfaceDensity: body.data.interfaceDensity,
      startPage: body.data.startPage,
      callNotificationsEnabled: body.data.callNotificationsEnabled,
      floatingCallAlertsEnabled: body.data.floatingCallAlertsEnabled,
      emailDigestFrequency: body.data.emailDigestFrequency,
    },
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });

  return NextResponse.json({ ok: true });
}
