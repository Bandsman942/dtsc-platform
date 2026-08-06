import { z } from "zod";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { resolveDirectConversation } from "@/lib/standard-collaboration";

const responseSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE", "CANCEL"]) });
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-contact-response:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = responseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const contactRequest = await prisma.collaborationContactRequest.findUnique({ where: { id } });
  if (!contactRequest) return NextResponse.json({ error: "NOT_FOUND", message: "Invitation introuvable." }, { status: 404 });
  const isTarget = contactRequest.targetUserId === session.userId;
  const isRequester = contactRequest.requesterId === session.userId;
  if ((parsed.data.action === "CANCEL" && !isRequester) || (parsed.data.action !== "CANCEL" && !isTarget)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (parsed.data.action === "ACCEPT") {
    if (contactRequest.status !== "PENDING" && contactRequest.status !== "ACCEPTED") {
      return NextResponse.json({ error: "INVALID_STATE", message: "Cette invitation ne peut plus être acceptée." }, { status: 409 });
    }
    const updated = contactRequest.status === "ACCEPTED"
      ? 0
      : (await prisma.collaborationContactRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "ACCEPTED", respondedAt: new Date() } })).count;
    const latest = updated === 0 ? await prisma.collaborationContactRequest.findUnique({ where: { id }, select: { status: true } }) : { status: "ACCEPTED" };
    if (latest?.status !== "ACCEPTED") return NextResponse.json({ error: "CONCURRENT_UPDATE", message: "L’invitation a changé entre-temps." }, { status: 409 });
    const direct = await resolveDirectConversation(session, contactRequest.requesterId);
    if (updated > 0) {
      await notifyUser({ userId: contactRequest.requesterId, title: "Invitation acceptée", body: `${session.name} a accepté votre invitation.`, type: "COLLABORATION", targetUrl: `/collaborators?group=${encodeURIComponent(direct.group.id)}`, idempotencyKey: `collaboration:contact-accepted:${id}` });
      await writeAuditLog({ userId: session.userId, action: "COLLABORATION_CONTACT_REQUEST_ACCEPTED", entity: "CollaborationContactRequest", entityId: id, request: req });
    }
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { idempotent: updated === 0 } });
    return NextResponse.json({ ok: true, unchanged: updated === 0, groupId: direct.group.id });
  }

  const status = parsed.data.action === "DECLINE" ? "DECLINED" : "CANCELED";
  if (contactRequest.status === status) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { idempotent: true } });
    return NextResponse.json({ ok: true, unchanged: true });
  }
  if (contactRequest.status !== "PENDING") return NextResponse.json({ error: "INVALID_STATE", message: "Cette invitation a déjà été traitée." }, { status: 409 });
  const updated = await prisma.collaborationContactRequest.updateMany({ where: { id, status: "PENDING" }, data: { status, respondedAt: new Date() } });
  if (updated.count === 0) return NextResponse.json({ error: "CONCURRENT_UPDATE", message: "L’invitation a changé entre-temps." }, { status: 409 });
  await writeAuditLog({ userId: session.userId, action: `COLLABORATION_CONTACT_REQUEST_${status}`, entity: "CollaborationContactRequest", entityId: id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}
