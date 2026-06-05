import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { canManageSupportRole } from "@/lib/support-access";
import { supportTicketUpdateSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

function closesTicket(status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
  return status === "RESOLVED" || status === "CLOSED";
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "support_ticket_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session || !isDtscInternalSession(session) || !canManageSupportRole(session.role)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `support-ticket-update:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ message: "Trop de mises à jour de tickets sur une courte période." }, { status: 429 });
  }

  const body = supportTicketUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid ticket update" }, { status: 400 });
  }

  const { id } = await params;
  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: body.data.status,
      priority: body.data.priority,
      resolution: body.data.resolution || null,
      resolvedAt: closesTicket(body.data.status) ? new Date() : null,
    },
  });

  await notifyUser({
    userId: ticket.userId,
    title: "Ticket support mis à jour",
    body: `${ticket.subject} · ${ticket.status}`,
    type: "SUPPORT",
    targetUrl: "/support",
    organizationId: ticket.organizationId,
  }).catch(() => null);

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { ticketId: ticket.id } });
  return NextResponse.json({ ok: true, ticket });
}
