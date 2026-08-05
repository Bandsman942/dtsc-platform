import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { supportNotificationTarget } from "@/lib/notification-targets";
import { notifyUser } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID, isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canManageSupportRole } from "@/lib/support-access";
import { supportSlaBreached } from "@/lib/support-sla";
import { supportTicketUpdateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };
function closesTicket(status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") { return status === "RESOLVED" || status === "CLOSED"; }

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "support_ticket_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  }
  const session = await getSession();
  if (!session || !isDtscInternalSession(session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", reasonCode: session ? "NOT_DTSC_INTERNAL" : "UNAUTHENTICATED" }, { status: 403 });
  }
  const capability = await requireConsoleCapability(CONSOLE_CAPABILITIES.SUPPORT_MANAGE);
  if (!canManageSupportRole(session.role) && capability.response) return capability.response;
  if (capability.response) return capability.response;

  const limited = await rateLimit(getRateLimitKey(req, `support-ticket-update:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de mises à jour de tickets sur une courte période.", reasonCode: "RATE_LIMITED" }, { status: 429 });
  }
  const body = supportTicketUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid ticket update", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  }
  const { id } = await params;
  const before = await prisma.supportTicket.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  if (before.status === "CLOSED" && body.data.status === "CLOSED") return NextResponse.json({ error: "Ticket already closed", reasonCode: "TICKET_ALREADY_CLOSED" }, { status: 409 });

  const assigneeId = body.data.assignedToDtscUserId || before.assignedToDtscUserId;
  if (assigneeId) {
    const validAssignee = await prisma.user.findFirst({ where: { id: assigneeId, status: UserStatus.ACTIVE, role: { in: [UserRole.ADMIN, UserRole.SUPPORT, UserRole.MANAGER] }, organizationMemberships: { some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null } } }, select: { id: true } });
    if (!validAssignee) return NextResponse.json({ error: "Invalid support assignee", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  }

  const now = new Date();
  const closes = closesTicket(body.data.status);
  const breached = supportSlaBreached({ now, dueAt: before.slaResolutionDueAt, completedAt: closes ? now : null, pausedAt: body.data.pauseSla ? now : before.slaPausedAt });
  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: body.data.status,
      priority: body.data.priority,
      resolution: body.data.resolution || null,
      assignedToDtscUserId: assigneeId || null,
      assignedAt: assigneeId && assigneeId !== before.assignedToDtscUserId ? now : before.assignedAt,
      escalatedAt: body.data.escalationReason ? now : before.escalatedAt,
      escalationReason: body.data.escalationReason || before.escalationReason,
      slaPausedAt: body.data.pauseSla === true ? now : body.data.pauseSla === false ? null : before.slaPausedAt,
      slaBreachedAt: breached ? before.slaBreachedAt || now : before.slaBreachedAt,
      resolvedAt: closes ? before.resolvedAt || now : null,
      closedAt: body.data.status === "CLOSED" ? before.closedAt || now : null,
    },
  });

  await notifyUser({ userId: ticket.userId, title: "Ticket support mis à jour", body: `${ticket.subject} · ${ticket.status}`, type: "SUPPORT", targetUrl: supportNotificationTarget(ticket.id), organizationId: ticket.organizationId }).catch(() => null);
  await writeAuditLog({ userId: session.userId, organizationId: ticket.organizationId, action: "CONSOLE_SUPPORT_TICKET_UPDATED", entity: "SupportTicket", entityId: ticket.id, before: { status: before.status, priority: before.priority, assignedToDtscUserId: before.assignedToDtscUserId, slaPausedAt: before.slaPausedAt }, after: { status: ticket.status, priority: ticket.priority, assignedToDtscUserId: ticket.assignedToDtscUserId, slaPausedAt: ticket.slaPausedAt, slaBreachedAt: ticket.slaBreachedAt }, reasonCode: capability.reasonCode, riskLevel: body.data.escalationReason ? "HIGH" : "MEDIUM", metadata: { reason: body.data.reason, escalationReason: body.data.escalationReason || null }, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { ticketId: ticket.id } });
  return NextResponse.json({ ok: true, ticket, reasonCode: capability.reasonCode });
}
