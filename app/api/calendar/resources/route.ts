import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageCalendarResources, listCalendarResources } from "@/lib/calendar-advanced";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const resourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  resourceType: z.enum(["ROOM", "VEHICLE", "EQUIPMENT", "WORKSPACE", "OTHER"]),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1).max(10000).optional(),
}).strict();

async function getAuthorizedContext(req: Request, startedAt: number) {
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return { session: null, context: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canAccessInternalCalendar({ role: session.role }, session)) {
    return { session: null, context: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) {
    return { session: null, context: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const featureAccess = await canUseInternalCalendarFeature(context);
  if (!featureAccess.allowed) {
    const status = featureAccess.code === "PLAN_REQUIRED" || featureAccess.code === "SUBSCRIPTION_REQUIRED" ? 402 : 403;
    return { session: null, context: null, response: NextResponse.json({ error: featureAccess.code, message: featureAccess.message }, { status }) };
  }
  return { session, context, response: null };
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await getAuthorizedContext(req, startedAt);
  if (!auth.session || !auth.context) return auth.response;
  const [resources, canManage] = await Promise.all([
    listCalendarResources(auth.context.activeOrganizationId || ""),
    canManageCalendarResources(auth.context),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({ resources, capabilities: { canManage } });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await getAuthorizedContext(req, startedAt);
  if (!auth.session || !auth.context) return auth.response;
  if (!(await canManageCalendarResources(auth.context))) {
    return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à gérer les ressources du calendrier." }, { status: 403 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `calendar-resource-create:${auth.session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = resourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "La ressource est invalide." }, { status: 400 });
  const resource = await prisma.calendarResource.create({
    data: {
      organizationId: auth.context.activeOrganizationId || "",
      name: parsed.data.name,
      resourceType: parsed.data.resourceType,
      description: parsed.data.description || null,
      location: parsed.data.location || null,
      capacity: parsed.data.capacity || null,
      createdById: auth.session.userId,
    },
  });
  await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_RESOURCE_CREATED", entity: "CalendarResource", entityId: resource.id, request: req, metadata: { organizationId: resource.organizationId, resourceType: resource.resourceType } });
  await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, resource }, { status: 201 });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await getAuthorizedContext(req, startedAt);
  if (!auth.session || !auth.context) return auth.response;
  if (!(await canManageCalendarResources(auth.context))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ id: z.string().min(5).max(120) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const existing = await prisma.calendarResource.findFirst({ where: { id: parsed.data.id, organizationId: auth.context.activeOrganizationId || "", archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const resource = await prisma.calendarResource.update({ where: { id: existing.id }, data: { isActive: false, archivedAt: new Date() } });
  await prisma.calendarResourceReservation.updateMany({ where: { resourceId: existing.id, status: "CONFIRMED", canceledAt: null }, data: { status: "CANCELED", canceledAt: new Date() } });
  await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_RESOURCE_ARCHIVED", entity: "CalendarResource", entityId: resource.id, request: req });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, resource });
}
