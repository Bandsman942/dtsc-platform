import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  buildDtscPermissionGrantKey,
  DTSC_INDIVIDUAL_PERMISSION_CATALOG,
  isKnownDtscIndividualPermission,
} from "@/lib/dtsc-individual-permissions";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const grantSchema = z.object({
  userId: z.string().min(5).max(120),
  permissionCode: z.string().min(3).max(160),
  scopeType: z.enum(["GLOBAL", "MODULE", "SUBMODULE"]).default("GLOBAL"),
  scopeValue: z.string().max(160).optional().or(z.literal("")),
  effect: z.enum(["ALLOW", "DENY"]).default("ALLOW"),
  reason: z.string().min(3).max(800),
  validUntil: z.string().datetime().optional().or(z.literal("")),
});

const revokeSchema = z.object({
  grantId: z.string().min(5).max(120),
  reason: z.string().min(3).max(800),
});

async function requireAdmin(req: Request, startedAt: number) {
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  if (!isDtscInternalSession(session) || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return { response: NextResponse.json({ error: "Forbidden", message: "Seul un administrateur DTSC peut gérer les permissions individuelles." }, { status: 403 }), session: null };
  }
  return { response: null, session };
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req, startedAt);
  if (!auth.session) return auth.response;

  const [employees, grants] = await Promise.all([
    prisma.hrcfoEmployee.findMany({
      where: { status: { not: "EXITED" }, userId: { not: null } },
      select: { id: true, fullName: true, email: true, department: true, jobTitle: true, positionCode: true, userId: true },
      orderBy: { fullName: "asc" },
      take: 500,
    }),
    prisma.dtscIndividualPermissionGrant.findMany({
      orderBy: [{ revokedAt: "asc" }, { updatedAt: "desc" }],
      take: 1000,
    }),
  ]);
  const userIds = employees.map((employee) => employee.userId).filter((userId): userId is string => Boolean(userId));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, status: true } });
  const usersById = new Map(users.map((user) => [user.id, user]));

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({
    catalog: DTSC_INDIVIDUAL_PERMISSION_CATALOG,
    collaborators: employees.map((employee) => ({ ...employee, account: employee.userId ? usersById.get(employee.userId) || null : null })),
    grants,
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await requireAdmin(req, startedAt);
  if (!auth.session) return auth.response;
  const limited = await rateLimit(getRateLimitKey(req, `individual-permission-grant:${auth.session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isKnownDtscIndividualPermission(parsed.data?.permissionCode || "")) {
    await writeApiLog({ request: req, statusCode: 400, userId: auth.session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "La permission demandée n'appartient pas au catalogue DTSC." }, { status: 400 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId: parsed.data.userId, status: { not: "EXITED" } },
    select: { id: true, userId: true },
  });
  if (!employee?.userId) {
    return NextResponse.json({ error: "Invalid collaborator", message: "Le collaborateur doit disposer d'un compte DTSC actif." }, { status: 400 });
  }

  const scopeValue = parsed.data.scopeValue || null;
  const grantKey = buildDtscPermissionGrantKey({
    userId: employee.userId,
    permissionCode: parsed.data.permissionCode,
    scopeType: parsed.data.scopeType,
    scopeValue,
  });
  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
  const grant = await prisma.dtscIndividualPermissionGrant.upsert({
    where: { grantKey },
    update: {
      employeeId: employee.id,
      effect: parsed.data.effect,
      reason: parsed.data.reason,
      validFrom: new Date(),
      validUntil,
      grantedById: auth.session.userId,
      revokedAt: null,
      revokedById: null,
    },
    create: {
      grantKey,
      userId: employee.userId,
      employeeId: employee.id,
      permissionCode: parsed.data.permissionCode,
      scopeType: parsed.data.scopeType,
      scopeValue,
      effect: parsed.data.effect,
      reason: parsed.data.reason,
      validUntil,
      grantedById: auth.session.userId,
    },
  });

  await writeAuditLog({
    userId: auth.session.userId,
    action: "DTSC_INDIVIDUAL_PERMISSION_GRANTED",
    entity: "DtscIndividualPermissionGrant",
    entityId: grant.id,
    request: req,
    metadata: { targetUserId: grant.userId, permissionCode: grant.permissionCode, effect: grant.effect, reason: grant.reason },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, grant }, { status: 201 });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = await requireAdmin(req, startedAt);
  if (!auth.session) return auth.response;
  const limited = await rateLimit(getRateLimitKey(req, `individual-permission-revoke:${auth.session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const existing = await prisma.dtscIndividualPermissionGrant.findUnique({ where: { id: parsed.data.grantId } });
  if (!existing || existing.revokedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const grant = await prisma.dtscIndividualPermissionGrant.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), revokedById: auth.session.userId, reason: `${existing.reason || ""}\nRévocation: ${parsed.data.reason}`.trim() },
  });
  await writeAuditLog({
    userId: auth.session.userId,
    action: "DTSC_INDIVIDUAL_PERMISSION_REVOKED",
    entity: "DtscIndividualPermissionGrant",
    entityId: grant.id,
    request: req,
    metadata: { targetUserId: grant.userId, permissionCode: grant.permissionCode, reason: parsed.data.reason },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt });
  return NextResponse.json({ ok: true, grant });
}
