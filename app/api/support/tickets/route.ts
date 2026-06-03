import { NextResponse } from "next/server";
import { UserRole, UserStatus, type SupportTicket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { notifyUsers } from "@/lib/notifications";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import type { SessionPayload } from "@/lib/session";
import { supportTicketSchema } from "@/lib/validators";

function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

async function resolveSupportTicketOrganizationId(session: SessionPayload) {
  const activeOrganizationId = getActiveOrganizationId(session);
  if (!activeOrganizationId) {
    return null;
  }

  const organization = await prisma.organization.findFirst({
    where: { id: activeOrganizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  return organization?.id || null;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "support_ticket_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `support-ticket-create:${session.userId}`), 12, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many support tickets" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { action: "support_ticket_invalid_json" } });
    return NextResponse.json({ error: "Invalid ticket data" }, { status: 400 });
  }

  const body = supportTicketSchema.safeParse(payload);
  if (!body.success) {
    await writeApiLog({
      request: req,
      statusCode: 400,
      userId: session.userId,
      startedAt,
      metadata: { issues: body.error.issues.map((issue) => issue.path.join(".")) },
    });
    return NextResponse.json({ error: "Invalid ticket data" }, { status: 400 });
  }

  const organizationId = await resolveSupportTicketOrganizationId(session);
  let ticket: SupportTicket;
  try {
    ticket = await prisma.supportTicket.create({
      data: {
        userId: session.userId,
        organizationId,
        subject: body.data.subject,
        description: body.data.description,
        priority: body.data.priority,
      },
    });
  } catch (error) {
    console.error("Support ticket creation failed", error);
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { action: "support_ticket_create_failed" } });
    return NextResponse.json({ error: "Unable to create support ticket" }, { status: 500 });
  }

  try {
    const supportUsers = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [{ role: UserRole.ADMIN }, { role: UserRole.SUPPORT }],
        organizationMemberships: {
          some: { organizationId: DTSC_INTERNAL_ORGANIZATION_ID, status: "ACTIVE", removedAt: null },
        },
      },
      select: { id: true },
    });
    await notifyUsers({
      userIds: supportUsers.map((user) => user.id),
      title: "Nouveau ticket support",
      body: body.data.subject,
      type: "SUPPORT",
      targetUrl: "/support",
      organizationId: DTSC_INTERNAL_ORGANIZATION_ID,
    });
  } catch (error) {
    console.error("Support ticket notification failed", error);
  }

  const metadata = organizationId ? { priority: ticket.priority, organizationId } : { priority: ticket.priority };
  await writeAuditLog({
    userId: session.userId,
    action: "SUPPORT_TICKET_CREATED",
    entity: "SupportTicket",
    entityId: ticket.id,
    metadata,
    request: req,
  });
  await writeApiLog({
    request: req,
    statusCode: 201,
    userId: session.userId,
    startedAt,
    metadata: organizationId ? { ticketId: ticket.id, organizationId } : { ticketId: ticket.id },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
