import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreV2Access } from "@/lib/enterprise/core-v2/access";
import { normalizeEnterpriseCoreV2Error } from "@/lib/enterprise/core-v2/errors";
import { createEnterpriseMeetingDecision } from "@/lib/enterprise/core-v2/service";
import { enterpriseMeetingDecisionCreateSchema } from "@/lib/enterprise/core-v2/validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-meeting-decision:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const access = await getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "MEETINGS", action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meeting = await prisma.enterpriseMeeting.findFirst({ where: { id, organizationId, archivedAt: null }, select: { organizerUserId: true } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage && meeting.organizerUserId !== session.userId) return NextResponse.json({ error: "Forbidden", message: "Seul l’organisateur ou un responsable peut consigner une décision." }, { status: 403 });
  const parsed = enterpriseMeetingDecisionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Décision invalide." }, { status: 400 });
  try {
    const decision = await createEnterpriseMeetingDecision({ organizationId, meetingId: id, actorUserId: session.userId, title: parsed.data.title, description: parsed.data.description || undefined });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_MEETING_DECISION_CREATED", entity: "EnterpriseMeetingDecision", entityId: decision.id, request: req, metadata: { organizationId, meetingId: id } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "meetings", meetingId: id, action: "decision" } });
    return NextResponse.json({ ok: true, decision }, { status: 201 });
  } catch (error) {
    const normalized = normalizeEnterpriseCoreV2Error(error);
    return NextResponse.json({ error: normalized.code, message: normalized.message }, { status: normalized.status });
  }
}
