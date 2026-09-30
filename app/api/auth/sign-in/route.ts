import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/security";
import { setSessionCookie } from "@/lib/auth";
import { ensureDefaultAdmin } from "@/lib/default-admin";
import { getDefaultContextForRole, resolveOrganizationLoginContext } from "@/lib/organizations";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

export async function POST(req: Request) {
  const limiter = await rateLimit(getRateLimitKey(req, "auth:sign-in"), 8, 15 * 60 * 1000);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives de connexion. Patientez quelques minutes puis réessayez.", resetAt: new Date(limiter.resetAt).toISOString() },
      { status: 429 }
    );
  }

  const rawPayload = await req.json().catch(() => null);
  const hasExplicitWorkspaceSelection =
    rawPayload !== null &&
    typeof rawPayload === "object" &&
    Object.prototype.hasOwnProperty.call(rawPayload, "organizationId");
  const body = signInSchema.safeParse(rawPayload);
  if (!body.success || !hasExplicitWorkspaceSelection) {
    return NextResponse.json(
      { error: "Chargez vos espaces puis choisissez celui dans lequel vous souhaitez continuer." },
      { status: 400 }
    );
  }
  const payloadNext =
    rawPayload && typeof rawPayload === "object" && "next" in rawPayload && typeof rawPayload.next === "string"
      ? rawPayload.next
      : null;
  const requestedNext = payloadNext || new URL(req.url).searchParams.get("next");

  await ensureDefaultAdmin(body.data.email, body.data.password);

  const user = await prisma.user.findUnique({
    where: { email: body.data.email },
  });

  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Adresse email ou mot de passe incorrect." }, { status: 401 });
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Votre compte n’est pas disponible pour le moment. Contactez le support DTSC si vous avez besoin d’aide." },
      { status: 403 }
    );
  }

  const requestedOrganizationId = body.data.organizationId?.trim() || "";
  let context = getDefaultContextForRole();
  if (requestedOrganizationId) {
    try {
      context = await resolveOrganizationLoginContext(user, requestedOrganizationId);
    } catch {
      await writeAuditLog({
        userId: user.id,
        action: "ORGANIZATION_LOGIN_DENIED",
        entity: "Organization",
        entityId: requestedOrganizationId,
        request: req,
        metadata: { reason: "membership_missing_or_inactive" },
      });
      return NextResponse.json(
        { error: "Cet espace n’est plus accessible avec votre compte. Rechargez vos espaces et choisissez-en un autre." },
        { status: 403 }
      );
    }
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

  return NextResponse.json({
    ok: true,
    redirectTo: resolvePostLoginRedirect({
      next: requestedNext,
      context: context.activeContext,
      userStartPage: user.startPage,
    }),
  });
}
