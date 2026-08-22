import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess, resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import {
  readEnterpriseModuleAccessRestrictions,
  removeEnterpriseModuleAccessRestriction,
  writeEnterpriseModuleAccessRestriction,
} from "@/lib/enterprise/module-access-restrictions";
import { getEnterpriseModuleDefinition, normalizeEnterpriseModuleCode } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; moduleCode: string }> };

const restrictionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("BLOCK"),
    userId: z.string().min(1),
    blockedUntil: z.string().datetime(),
    reason: z.string().trim().min(8, "Expliquez la raison du blocage temporaire.").max(280),
  }),
  z.object({
    action: z.literal("UNBLOCK"),
    userId: z.string().min(1),
  }),
]);

async function requireAdminAccess(userId: string, organizationId: string) {
  const decision = await resolveEnterpriseModuleAccess({
    userId,
    organizationId,
    moduleCode: "ADMIN_DASHBOARD",
    action: "manage",
  });
  return decision.allowed;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const { organizationId, moduleCode: rawModuleCode } = await params;
  if (!(await requireAdminAccess(session.userId, organizationId))) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à gérer les accès de cette entreprise." }, { status: 403 });
  }

  const moduleCode = normalizeEnterpriseModuleCode(rawModuleCode);
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition || definition.routeKind === "ADMIN_SECTION") {
    return NextResponse.json({ error: "MODULE_NOT_FOUND", message: "Ce module n’est pas disponible dans l’administration entreprise." }, { status: 404 });
  }

  const [organization, enterpriseModule, members] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null, status: "ACTIVE", organizationType: "CLIENT" },
      select: { settingsJson: true },
    }),
    prisma.enterpriseModule.findFirst({
      where: { organizationId, moduleCode: { in: [moduleCode, rawModuleCode] } },
      select: { id: true, moduleCode: true, isEnabled: true, createdAt: true },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      take: 100,
      select: {
        id: true,
        userId: true,
        role: true,
        positionCode: true,
        positionTitle: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!organization || !enterpriseModule) {
    return NextResponse.json({ error: "MODULE_NOT_CONFIGURED", message: "Ce module n’est pas configuré pour cette entreprise." }, { status: 404 });
  }

  const restrictions = readEnterpriseModuleAccessRestrictions(organization.settingsJson);
  const accessRows = await Promise.all(members.map(async (member) => {
    const capabilities = await resolveEnterpriseModuleCapabilities({ userId: member.userId, organizationId, moduleCode });
    const restriction = restrictions.find((item) => item.userId === member.userId && item.moduleCode === moduleCode && new Date(item.blockedUntil) > new Date()) || null;
    return {
      memberId: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      position: member.positionTitle || member.positionCode || null,
      actions: {
        read: capabilities.canRead,
        create: capabilities.canCreate,
        submit: capabilities.canSubmit,
        write: capabilities.canWrite,
        approve: capabilities.canApprove,
        manage: capabilities.canManage,
      },
      temporaryRestriction: restriction ? { blockedUntil: restriction.blockedUntil, reason: restriction.reason } : null,
    };
  }));

  const dependencyLabels = definition.dependencies.map((dependencyCode) => {
    const dependency = getEnterpriseModuleDefinition(dependencyCode);
    return { code: dependencyCode, labelFr: dependency?.labelFr || "Service préalable", labelEn: dependency?.labelEn || "Required service" };
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode, rows: accessRows.length } });
  return NextResponse.json({
    module: {
      code: moduleCode,
      labelFr: definition.labelFr,
      labelEn: definition.labelEn,
      descriptionFr: definition.descriptionFr,
      descriptionEn: definition.descriptionEn,
      domain: definition.domain,
      status: definition.implementationStatus,
      minimumPlan: definition.minimumPlan,
      routePath: definition.routePath || null,
      dependencies: dependencyLabels,
      activatedAt: enterpriseModule.createdAt.toISOString(),
      isEnabled: enterpriseModule.isEnabled,
    },
    members: accessRows,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Cette action doit être lancée depuis DTSC Platform." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Votre session a expiré." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-module-access:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de changements d’accès sur une courte période. Réessayez plus tard." }, { status: 429 });

  const { organizationId, moduleCode: rawModuleCode } = await params;
  if (!(await requireAdminAccess(session.userId, organizationId))) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à gérer les accès de cette entreprise." }, { status: 403 });
  }
  const parsed = restrictionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Les informations fournies sont incomplètes." }, { status: 400 });

  const moduleCode = normalizeEnterpriseModuleCode(rawModuleCode);
  const definition = getEnterpriseModuleDefinition(moduleCode);
  if (!definition || definition.routeKind === "ADMIN_SECTION") {
    return NextResponse.json({ error: "MODULE_NOT_FOUND", message: "Ce module ne peut pas être géré depuis cette action." }, { status: 404 });
  }
  const [organization, targetMember, tenantModule] = await Promise.all([
    prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null, status: "ACTIVE", organizationType: "CLIENT" }, select: { id: true, settingsJson: true } }),
    prisma.organizationMember.findFirst({ where: { organizationId, userId: parsed.data.userId, status: "ACTIVE", removedAt: null }, select: { id: true, userId: true, user: { select: { name: true } } } }),
    prisma.enterpriseModule.findFirst({ where: { organizationId, moduleCode: { in: [moduleCode, rawModuleCode] } }, select: { id: true } }),
  ]);
  if (!organization || !targetMember || !tenantModule) {
    return NextResponse.json({ error: "TARGET_NOT_FOUND", message: "Le collaborateur ou le module sélectionné n’appartient pas à cette entreprise." }, { status: 400 });
  }

  let nextSettings: Prisma.InputJsonValue;
  let auditAction: string;
  if (parsed.data.action === "BLOCK") {
    const blockedUntil = new Date(parsed.data.blockedUntil);
    const now = new Date();
    const latestAllowed = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(blockedUntil.getTime()) || blockedUntil <= now || blockedUntil > latestAllowed) {
      return NextResponse.json({ error: "INVALID_EXPIRY", message: "Choisissez une date future, au maximum dans un an." }, { status: 400 });
    }
    nextSettings = writeEnterpriseModuleAccessRestriction({
      settingsJson: organization.settingsJson,
      restriction: {
        userId: targetMember.userId,
        moduleCode,
        blockedUntil: blockedUntil.toISOString(),
        reason: parsed.data.reason,
        createdAt: now.toISOString(),
        createdByUserId: session.userId,
      },
    });
    auditAction = "ENTERPRISE_MODULE_USER_ACCESS_BLOCKED";
  } else {
    nextSettings = removeEnterpriseModuleAccessRestriction({ settingsJson: organization.settingsJson, userId: targetMember.userId, moduleCode });
    auditAction = "ENTERPRISE_MODULE_USER_ACCESS_RESTORED";
  }

  await prisma.organization.update({ where: { id: organizationId }, data: { settingsJson: nextSettings } });
  await writeAuditLog({
    userId: session.userId,
    organizationId,
    action: auditAction,
    entity: "EnterpriseModule",
    entityId: tenantModule.id,
    request: req,
    reasonCode: parsed.data.action === "BLOCK" ? "TEMPORARY_ACCESS_BLOCK" : "TEMPORARY_ACCESS_RESTORED",
    riskLevel: "HIGH",
    metadata: {
      organizationId,
      moduleCode,
      targetUserId: targetMember.userId,
      targetName: targetMember.user.name,
      ...(parsed.data.action === "BLOCK" ? { blockedUntil: parsed.data.blockedUntil } : {}),
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode, action: parsed.data.action } });
  return NextResponse.json({
    ok: true,
    message: parsed.data.action === "BLOCK"
      ? `L’accès de ${targetMember.user.name} est bloqué temporairement pour ce module.`
      : `L’accès de ${targetMember.user.name} a été rétabli pour ce module.`,
  });
}
