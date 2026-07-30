import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { assertGroupMemberForSession, writeGroupAudit } from "@/lib/collaboration";
import { collaborationPreferenceSchema } from "@/lib/collaboration-experience-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const preference = await prisma.collaborationGroupPreference.findUnique({ where: { groupId_userId: { groupId: id, userId: session.userId } } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    preference: preference || { groupId: id, userId: session.userId, pinned: false, favorite: false, archived: false, notifications: "ALL", mutedUntil: null },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-preference:${session.userId}`), 240, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  const member = await assertGroupMemberForSession(id, session);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = collaborationPreferenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid preference" }, { status: 400 });

  const mutedUntil = parsed.data.mutedUntil === undefined
    ? undefined
    : parsed.data.mutedUntil
      ? new Date(parsed.data.mutedUntil)
      : null;
  const data = {
    ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
    ...(parsed.data.favorite !== undefined ? { favorite: parsed.data.favorite } : {}),
    ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}),
    ...(parsed.data.notifications !== undefined ? { notifications: parsed.data.notifications } : {}),
    ...(mutedUntil !== undefined ? { mutedUntil } : {}),
  };
  const preference = await prisma.collaborationGroupPreference.upsert({
    where: { groupId_userId: { groupId: id, userId: session.userId } },
    create: { groupId: id, userId: session.userId, ...data },
    update: data,
  });
  await writeGroupAudit({ groupId: id, actorId: session.userId, action: "group.preference.update", entityType: "CollaborationGroupPreference", entityId: preference.id });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, preference });
}
