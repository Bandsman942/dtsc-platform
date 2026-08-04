import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import {
  canAccessInternalCalendar,
  canUseInternalCalendarFeature,
  getCalendarContext,
  internalCalendarAccessWhere,
} from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { loadUnifiedWorkCalendar } from "@/lib/standard-work-coordination/calendar";

const DEFAULT_PAST_DAYS = 14;
const DEFAULT_FUTURE_DAYS = 60;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "INVALID_CONTEXT", message: "Aucun espace calendrier actif." }, { status: 403 });
  }
  const feature = await canUseInternalCalendarFeature(context);
  if (!feature.allowed) {
    const status = feature.code === "PLAN_REQUIRED" || feature.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { code: feature.code } });
    return NextResponse.json({ error: feature.code, message: feature.message }, { status });
  }

  const url = new URL(req.url);
  const now = new Date();
  const from = parseDate(url.searchParams.get("from"), new Date(now.getTime() - DEFAULT_PAST_DAYS * 86_400_000));
  const to = parseDate(url.searchParams.get("to"), new Date(now.getTime() + DEFAULT_FUTURE_DAYS * 86_400_000));
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { timezone: true } });

  try {
    const events = await loadUnifiedWorkCalendar({
      organizationId: context.activeOrganizationId,
      userId: session.userId,
      canSeeAll: context.canViewGlobal,
      dtscInternal: context.dtscInternal,
      timezone: user?.timezone || "Africa/Kinshasa",
      from,
      to,
      internalCalendarWhere: internalCalendarAccessWhere(context),
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId: session.userId,
      startedAt,
      metadata: { domain: "unified-calendar", organizationId: context.activeOrganizationId, eventCount: events.length },
    });
    return NextResponse.json({
      events: events.map((event) => ({ ...event, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() })),
      range: { from: from.toISOString(), to: to.toISOString() },
      capabilities: { canCreate: true, canOverrideConflicts: context.canOverrideConflicts, canViewOrganization: context.canViewGlobal },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "INVALID_CALENDAR_RANGE" || code === "CALENDAR_RANGE_TOO_LARGE" ? 400 : 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { domain: "unified-calendar", code } });
    return NextResponse.json({ error: code, message: status === 400 ? "La période demandée est invalide ou trop large." : "Le calendrier unifié est momentanément indisponible." }, { status });
  }
}

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
