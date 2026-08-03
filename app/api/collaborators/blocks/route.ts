import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationUserBlockSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const targetUserId = new URL(req.url).searchParams.get("targetUserId");
  if (!targetUserId || targetUserId === session.userId) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.collaborationUserBlock.findFirst({ where: { blockerId: session.userId, blockedId: targetUserId, revokedAt: null }, select: { id: true, reason: true, createdAt: true } }),
    prisma.collaborationUserBlock.findFirst({ where: { blockerId: targetUserId, blockedId: session.userId, revokedAt: null }, select: { id: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ blockedByMe: Boolean(blockedByMe), blockedMe: Boolean(blockedMe), block: blockedByMe });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-block:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = collaborationUserBlockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.targetUserId === session.userId) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  if (parsed.data.action === "BLOCK") {
    await prisma.collaborationUserBlock.upsert({
      where: { blockerId_blockedId: { blockerId: session.userId, blockedId: parsed.data.targetUserId } },
      create: { blockerId: session.userId, blockedId: parsed.data.targetUserId, reason: parsed.data.reason || null },
      update: { revokedAt: null, reason: parsed.data.reason || null },
    });
  } else {
    await prisma.collaborationUserBlock.updateMany({
      where: { blockerId: session.userId, blockedId: parsed.data.targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAuditLog({ userId: session.userId, action: `collaboration.user.${parsed.data.action.toLowerCase()}`, entity: "User", entityId: parsed.data.targetUserId, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, blocked: parsed.data.action === "BLOCK" });
}
