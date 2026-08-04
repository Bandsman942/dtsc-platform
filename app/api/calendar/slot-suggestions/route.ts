import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, detectCalendarConflicts, getCalendarContext, validateCalendarCollaborators } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const suggestionSchema = z.object({
  participantIds: z.array(z.string().min(5).max(120)).min(1).max(30),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  workingDayStartHour: z.coerce.number().int().min(0).max(23).default(8),
  workingDayEndHour: z.coerce.number().int().min(1).max(24).default(18),
  stepMinutes: z.coerce.number().int().min(15).max(120).default(30),
}).strict().superRefine((data, ctx) => {
  const start = new Date(data.rangeStart);
  const end = new Date(data.rangeEnd);
  if (end <= start) ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "La fin de période doit être après le début." });
  if (end.getTime() - start.getTime() > 14 * 86_400_000) ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "La recherche est limitée à 14 jours." });
  if (data.workingDayEndHour <= data.workingDayStartHour) ctx.addIssue({ code: "custom", path: ["workingDayEndHour"], message: "La journée de fin doit être après l'heure de début." });
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || !canAccessInternalCalendar({ role: session.role }, session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-slot-suggestions:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await canUseInternalCalendarFeature(context);
  if (!access.allowed) {
    const status = access.code === "PLAN_REQUIRED" || access.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return NextResponse.json({ error: access.code, message: access.message }, { status });
  }
  const parsed = suggestionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Recherche de créneaux invalide." }, { status: 400 });

  const participantIds = [...new Set([context.calendarCollaboratorId, ...parsed.data.participantIds])];
  if (!(await validateCalendarCollaborators(context, participantIds))) return NextResponse.json({ error: "Invalid participants" }, { status: 400 });

  const rangeStart = new Date(parsed.data.rangeStart);
  const rangeEnd = new Date(parsed.data.rangeEnd);
  const suggestions: Array<{ startsAt: string; endsAt: string; warnings: Array<{ message: string; severity: string }> }> = [];
  let evaluated = 0;
  for (let day = startOfDay(rangeStart); day <= rangeEnd && suggestions.length < 12; day = addDays(day, 1)) {
    const weekday = day.getDay();
    if (weekday === 0) continue;
    for (let minutes = parsed.data.workingDayStartHour * 60; minutes + parsed.data.durationMinutes <= parsed.data.workingDayEndHour * 60 && suggestions.length < 12; minutes += parsed.data.stepMinutes) {
      const startsAt = new Date(day);
      startsAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);
      if (startsAt < rangeStart || endsAt > rangeEnd) continue;
      evaluated += 1;
      if (evaluated > 180) break;
      const conflicts = await detectCalendarConflicts({ context, participantIds, startDateTime: startsAt, endDateTime: endsAt });
      if (conflicts.some((conflict) => conflict.severity === "Bloquant" || conflict.conflictType === "Chevauchement événement")) continue;
      suggestions.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        warnings: conflicts.filter((conflict) => conflict.severity !== "Bloquant").map((conflict) => ({ message: conflict.message, severity: conflict.severity })),
      });
    }
  }

  const record = await prisma.calendarSlotSuggestion.create({
    data: {
      organizationId: context.activeOrganizationId,
      requestedById: session.userId,
      participantIdsJson: participantIds,
      rangeStart,
      rangeEnd,
      durationMinutes: parsed.data.durationMinutes,
      provider: "LOCAL",
      status: suggestions.length ? "READY" : "NO_MATCH",
      suggestionsJson: suggestions,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "CALENDAR_SLOT_SUGGESTIONS_GENERATED", entity: "CalendarSlotSuggestion", entityId: record.id, request: req, metadata: { participantCount: participantIds.length, evaluated, suggestionCount: suggestions.length } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { evaluated, suggestionCount: suggestions.length } });
  return NextResponse.json({ suggestions, evaluated, status: record.status });
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}
