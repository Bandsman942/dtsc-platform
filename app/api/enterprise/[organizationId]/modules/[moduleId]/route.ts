import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import {
  activateEnterpriseModule,
  disableEnterpriseModule,
  EnterpriseModuleConfigurationError,
} from "@/lib/enterprise/module-subscription-reconciliation";
import { normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; moduleId: string }> };

const moduleToggleSchema = z.object({
  isEnabled: z.boolean(),
  activateDependencies: z.boolean().default(true),
});

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_module_origin_denied" } });
    return NextResponse.json({ error: "Forbidden", message: "Cette action doit être réalisée depuis DTSC Platform." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized", message: "Votre session a expiré. Reconnectez-vous pour continuer." }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `enterprise-module:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de modifications ont été demandées. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const { organizationId, moduleId } = await params;
  const adminAccess = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode: "ADMIN_DASHBOARD",
    action: "manage",
  });
  if (!adminAccess.allowed) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n’êtes pas autorisé à gérer les modules de cette entreprise." }, { status: 403 });
  }

  const parsed = moduleToggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La demande de modification du module est invalide." }, { status: 400 });
  }

  const enterpriseModule = await prisma.enterpriseModule.findFirst({ where: { id: moduleId, organizationId } });
  if (!enterpriseModule) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Not found", message: "Le module demandé est introuvable dans cette entreprise." }, { status: 404 });
  }
  if (enterpriseModule.isCore && !parsed.data.isEnabled) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Core module", message: "Ce service fait partie du socle indispensable de l’entreprise et ne peut pas être désactivé." }, { status: 400 });
  }

  try {
    const result = parsed.data.isEnabled
      ? await activateEnterpriseModule({
          organizationId,
          moduleCode: enterpriseModule.moduleCode,
          activateDependencies: parsed.data.activateDependencies,
        })
      : await disableEnterpriseModule({ organizationId, moduleCode: enterpriseModule.moduleCode });

    const affectedCodes = "activatedModules" in result
      ? result.activatedModules
      : [result.disabledModule];
    const affectedRows = await prisma.enterpriseModule.findMany({
      where: { organizationId, moduleCode: { in: affectedCodes } },
      select: { id: true, moduleCode: true, isEnabled: true },
    });
    await prisma.enterpriseAdminSection.updateMany({
      where: { organizationId, moduleId: { in: affectedRows.map((row) => row.id) } },
      data: { isEnabled: parsed.data.isEnabled },
    });

    await writeAuditLog({
      userId: session.userId,
      action: parsed.data.isEnabled ? "ENTERPRISE_MODULE_ACTIVATED" : "ENTERPRISE_MODULE_DISABLED",
      entity: "EnterpriseModule",
      entityId: moduleId,
      request: req,
      metadata: {
        organizationId,
        requestedModuleCode: enterpriseModule.moduleCode,
        canonicalModuleCode: normalizeEnterpriseModuleCode(enterpriseModule.moduleCode),
        affectedModuleCodes: affectedCodes,
        dependenciesActivated: Math.max(0, affectedCodes.length - 1),
      },
    });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
    return NextResponse.json({
      ok: true,
      message: parsed.data.isEnabled
        ? affectedCodes.length > 1
          ? `Le module et ${affectedCodes.length - 1} service(s) préalable(s) ont été activés.`
          : "Le module a été activé."
        : "Le module a été désactivé.",
      affectedModuleCodes: affectedCodes,
    });
  } catch (error) {
    if (error instanceof EnterpriseModuleConfigurationError) {
      await writeApiLog({ request: req, statusCode: error.status, userId: session.userId, startedAt, metadata: { code: error.code } });
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    throw error;
  }
}
