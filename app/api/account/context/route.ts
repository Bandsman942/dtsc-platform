import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getDefaultContextForRole, resolveOrganizationLoginContext } from "@/lib/organizations";

const contextSchema = z.object({
  organizationId: z.string().max(120).nullable().optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = contextSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    await writeApiLog({ request: req, statusCode: 401, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let context = getDefaultContextForRole(user.role);
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
      });
      await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
      return NextResponse.json({ error: "Forbidden", message: "Vous n'êtes pas autorisé à accéder à cette entreprise." }, { status: 403 });
    }
  }

  await setSessionCookie({
    ...user,
    activeContext: context.activeContext,
    activeOrganizationId: context.activeOrganizationId,
    activeOrganizationName: context.activeOrganizationName,
    activeOrganizationRole: context.activeOrganizationRole,
  });
  await writeAuditLog({
    userId: session.userId,
    action: "ORGANIZATION_CONTEXT_SWITCHED",
    entity: "Organization",
    entityId: context.activeOrganizationId,
    request: req,
    metadata: { context: context.activeContext, role: context.activeOrganizationRole },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, context });
}
