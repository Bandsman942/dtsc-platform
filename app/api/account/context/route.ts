import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { resolveDefaultOrganizationContext, resolveOrganizationLoginContext } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getUserSessionIdleTimeoutMinutes } from "@/lib/session-preference";

const contextSchema = z.object({
  organizationId: z.string().max(120).nullable().optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "account_context_origin_denied" } });
    return NextResponse.json({ error: "Forbidden", reasonCode: "FORBIDDEN", message: "Cette demande de changement de contexte n'est pas autorisée." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized", reasonCode: "UNAUTHENTICATED", message: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `account-context:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt, metadata: { action: "account_context_rate_limited" } });
    return NextResponse.json({ error: "Too many requests", reasonCode: "RATE_LIMITED", message: "Trop de changements de contexte ont été demandés. Réessayez plus tard." }, { status: 429 });
  }

  const parsed = contextSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", reasonCode: "VALIDATION_ERROR", message: "Le contexte demandé est invalide." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized", reasonCode: "UNAUTHENTICATED", message: "Ce compte n'est plus actif." }, { status: 401 });
  }

  let context = await resolveDefaultOrganizationContext(user);
  if (parsed.data.organizationId) {
    try {
      context = await resolveOrganizationLoginContext(user, parsed.data.organizationId);
    } catch {
      await writeAuditLog({
        userId: session.userId,
        action: "ORGANIZATION_CONTEXT_SWITCH_DENIED",
        entity: "Organization",
        entityId: parsed.data.organizationId,
        request: req,
        metadata: { reasonCode: "MEMBERSHIP_REQUIRED", previousContext: session.activeContext || "GLOBAL_CLIENT" },
      });
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { action: "account_context_denied", organizationId: parsed.data.organizationId } });
      return NextResponse.json({ error: "Forbidden", reasonCode: "FORBIDDEN", message: "Vous n'êtes pas autorisé à accéder à cette entreprise." }, { status: 403 });
    }
  }

  const sessionIdleTimeoutMinutes = await getUserSessionIdleTimeoutMinutes(user.id);
  const renewedSession = await setSessionCookie(
    {
      ...user,
      sessionIdleTimeoutMinutes,
      activeContext: context.activeContext,
      activeOrganizationId: context.activeOrganizationId,
      activeOrganizationName: context.activeOrganizationName,
      activeOrganizationRole: context.activeOrganizationRole,
    },
    { previousSession: session }
  );
  if (!renewedSession) {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Session expired", reasonCode: "UNAUTHENTICATED", message: "Votre session a expiré pendant le changement de contexte." }, { status: 401 });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ORGANIZATION_CONTEXT_SWITCHED",
    entity: "Organization",
    entityId: context.activeOrganizationId,
    request: req,
    metadata: {
      context: context.activeContext,
      role: context.activeOrganizationRole,
      previousContext: session.activeContext || "GLOBAL_CLIENT",
      previousOrganizationId: session.activeOrganizationId || null,
      reasonCode: "OK",
    },
  });
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { action: "account_context_switched", context: context.activeContext, organizationId: context.activeOrganizationId },
  });
  return NextResponse.json({ ok: true, reasonCode: "OK", context, nextAction: "/dashboard" });
}
