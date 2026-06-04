import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canManageEnterpriseAdministration } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseModuleToggleSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string; moduleId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_module_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-module:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de changements de modules sur une courte période." }, { status: 429 });
  }

  const { organizationId, moduleId } = await params;
  if (!(await canManageEnterpriseAdministration(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = enterpriseModuleToggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const enterpriseModule = await prisma.enterpriseModule.findFirst({ where: { id: moduleId, organizationId } });
  if (!enterpriseModule) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (enterpriseModule.isCore && !parsed.data.isEnabled) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Core module", message: "Un module socle ne peut pas être désactivé." }, { status: 400 });
  }

  const updated = await prisma.enterpriseModule.update({
    where: { id: moduleId },
    data: { isEnabled: parsed.data.isEnabled },
  });
  await prisma.enterpriseAdminSection.updateMany({
    where: { organizationId, moduleId },
    data: { isEnabled: parsed.data.isEnabled },
  });
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_MODULE_TOGGLED",
    entity: "EnterpriseModule",
    entityId: moduleId,
    request: req,
    metadata: { organizationId, moduleCode: enterpriseModule.moduleCode, isEnabled: parsed.data.isEnabled },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true, module: updated });
}
