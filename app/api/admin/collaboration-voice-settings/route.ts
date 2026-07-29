import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { collaborationVoiceSettingsSchema } from "@/lib/collaboration-experience-validators";
import { getCollaborationVoiceSettings } from "@/lib/collaboration-voice-settings";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getCollaborationVoiceSettings();
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-voice-settings-admin" } });
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `admin-collaboration-voice-settings:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = collaborationVoiceSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const settings = await prisma.collaborationVoiceSetting.upsert({
    where: { id: "global" },
    create: { id: "global", ...parsed.data, updatedByUserId: session.userId },
    update: { ...parsed.data, updatedByUserId: session.userId },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "COLLABORATION_VOICE_SETTINGS_UPDATED",
    entity: "CollaborationVoiceSetting",
    entityId: settings.id,
    metadata: parsed.data,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-voice-settings-admin" } });
  return NextResponse.json({ ok: true, settings });
}
