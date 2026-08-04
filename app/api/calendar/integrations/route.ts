import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessInternalCalendar, canUseInternalCalendarFeature, getCalendarContext } from "@/lib/internal-calendar";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getExternalCalendarFeatureStatus } from "@/lib/technical-debt/feature-gates";

const providerSchema = z.object({ provider: z.enum(["GOOGLE", "MICROSOFT"]), action: z.enum(["REQUEST_CONNECTION", "DISCONNECT"]) }).strict();

async function authorize() {
  const session = await getSession();
  if (!session || !canAccessInternalCalendar({ role: session.role }, session)) return null;
  const context = await getCalendarContext({ id: session.userId, role: session.role }, session);
  if (!context.activeOrganizationId || !context.calendarCollaboratorId) return null;
  const feature = await canUseInternalCalendarFeature(context);
  return feature.allowed ? { session, context } : null;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const feature = getExternalCalendarFeatureStatus();
  const states = await prisma.calendarExternalSyncState.findMany({
    where: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId },
    orderBy: { provider: "asc" },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({ feature, states: states.map((state) => ({ provider: state.provider, status: state.status, externalCalendarId: state.externalCalendarId, lastSyncedAt: state.lastSyncedAt, lastErrorCode: state.lastErrorCode })) });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `calendar-integration:${auth.session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = providerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const feature = getExternalCalendarFeatureStatus();

  if (parsed.data.action === "DISCONNECT") {
    const state = await prisma.calendarExternalSyncState.upsert({
      where: { organizationId_userId_provider: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider } },
      update: { status: "DISCONNECTED", credentialReference: null, externalCalendarId: null, lastErrorCode: null, lastErrorMessage: null },
      create: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider, status: "DISCONNECTED" },
    });
    await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_EXTERNAL_SYNC_DISCONNECTED", entity: "CalendarExternalSyncState", entityId: state.id, request: req, metadata: { provider: parsed.data.provider } });
    return NextResponse.json({ ok: true, state: { provider: state.provider, status: state.status } });
  }

  if (!feature.available) {
    const state = await prisma.calendarExternalSyncState.upsert({
      where: { organizationId_userId_provider: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider } },
      update: { status: "NOT_CONFIGURED", lastErrorCode: "PROVIDER_NOT_CONFIGURED", lastErrorMessage: feature.message },
      create: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider, status: "NOT_CONFIGURED", lastErrorCode: "PROVIDER_NOT_CONFIGURED", lastErrorMessage: feature.message },
    });
    await writeApiLog({ request: req, statusCode: 503, userId: auth.session.userId, startedAt, metadata: { provider: parsed.data.provider, configured: false } });
    return NextResponse.json({ error: "PROVIDER_NOT_CONFIGURED", message: feature.message, state: { provider: state.provider, status: state.status } }, { status: 503 });
  }

  const state = await prisma.calendarExternalSyncState.upsert({
    where: { organizationId_userId_provider: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider } },
    update: { status: "CONSENT_REQUIRED", lastErrorCode: null, lastErrorMessage: null },
    create: { organizationId: auth.context.activeOrganizationId || "", userId: auth.session.userId, provider: parsed.data.provider, status: "CONSENT_REQUIRED" },
  });
  await writeAuditLog({ userId: auth.session.userId, action: "CALENDAR_EXTERNAL_SYNC_CONNECTION_REQUESTED", entity: "CalendarExternalSyncState", entityId: state.id, request: req, metadata: { provider: parsed.data.provider } });
  await writeApiLog({ request: req, statusCode: 202, userId: auth.session.userId, startedAt });
  return NextResponse.json({
    ok: false,
    state: { provider: state.provider, status: state.status },
    message: "Le fournisseur est configuré. Le flux de consentement OAuth doit être finalisé depuis l'URL serveur dédiée avant toute synchronisation.",
  }, { status: 202 });
}
