import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { calendarInvitationWhere } from "@/lib/calendar-participation";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, calendarEventInclude, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await canUseInternalCalendarFeature(context);
  if (!access.allowed) {
    const status = access.code === "PLAN_REQUIRED" || access.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return NextResponse.json({ error: access.code, message: access.message }, { status });
  }

  const events = await prisma.internalCalendarEvent.findMany({
    where: calendarInvitationWhere(context),
    include: calendarEventInclude(),
    orderBy: [{ startDateTime: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({
    invitations: events.map((event) => ({
      ...event,
      currentParticipant: event.participants.find((participant) => participant.collaboratorId === context.calendarCollaboratorId) || null,
    })),
  });
}
