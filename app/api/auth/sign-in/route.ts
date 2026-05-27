import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/security";
import { setSessionCookie } from "@/lib/auth";
import { ensureDefaultAdmin } from "@/lib/default-admin";
import { resolveOrganizationLoginContext } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  const limiter = await rateLimit(getRateLimitKey(req, "auth:sign-in"), 8, 15 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 }
    );
  }

  const body = signInSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  await ensureDefaultAdmin(body.data.email, body.data.password);

  const user = await prisma.user.findUnique({
    where: { email: body.data.email },
  });

  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }

  let context;
  try {
    context = await resolveOrganizationLoginContext(user, body.data.organizationId || null);
  } catch {
    await writeAuditLog({
      userId: user.id,
      action: "ORGANIZATION_LOGIN_DENIED",
      entity: "Organization",
      entityId: body.data.organizationId || null,
      request: req,
      metadata: { reason: "membership_missing_or_inactive" },
    });
    return NextResponse.json(
      { error: "Accès refusé : les espaces internes des entreprises clientes sont strictement réservés à leurs membres autorisés." },
      { status: 403 }
    );
  }

  await setSessionCookie({
    ...user,
    activeContext: context.activeContext,
    activeOrganizationId: context.activeOrganizationId,
    activeOrganizationName: context.activeOrganizationName,
    activeOrganizationRole: context.activeOrganizationRole,
  });

  if (context.activeOrganizationId) {
    await writeAuditLog({
      userId: user.id,
      action: "ORGANIZATION_CONTEXT_LOGIN",
      entity: "Organization",
      entityId: context.activeOrganizationId,
      request: req,
      metadata: { context: context.activeContext, role: context.activeOrganizationRole },
    });
  }

  return NextResponse.json({ ok: true, redirectTo: user.startPage || "/dashboard" });
}
