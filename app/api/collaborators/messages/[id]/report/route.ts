import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { assertGroupMemberForSession } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationContentReportSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-report:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const parsed = collaborationContentReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  const { id } = await params;
  const message = await prisma.collaborationGroupMessage.findUnique({ where: { id }, select: { id: true, groupId: true } });
  if (!message || !(await assertGroupMemberForSession(message.groupId, session))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const report = await prisma.collaborationMessageReport.upsert({
    where: { messageId_reporterId: { messageId: id, reporterId: session.userId } },
    create: { groupId: message.groupId, messageId: id, reporterId: session.userId, reason: parsed.data.reason, description: parsed.data.description || null, priority: parsed.data.priority },
    update: { reason: parsed.data.reason, description: parsed.data.description || null, priority: parsed.data.priority, status: "OPEN", decision: null, resolvedAt: null },
  });
  await writeAuditLog({ userId: session.userId, action: "collaboration.message.report", entity: "CollaborationMessageReport", entityId: report.id, request: req });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, report }, { status: 201 });
}
