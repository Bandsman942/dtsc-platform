import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreAccess } from "@/lib/enterprise/enterprise-core-access";
import { enterpriseCoreVisibilityWhere, isEnterpriseCoreModuleCode } from "@/lib/enterprise/enterprise-core";
import { enterpriseCoreCreateSchema } from "@/lib/enterprise/enterprise-core-validators";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

const LEGACY_CORE_READ_ONLY = "LEGACY_READ_ONLY";

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const url = new URL(req.url);
  const moduleCode = url.searchParams.get("moduleCode") || "";
  const cursor = url.searchParams.get("cursor") || undefined;
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const take = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);

  if (!isEnterpriseCoreModuleCode(moduleCode)) {
    return NextResponse.json({ error: "Invalid module", message: "Le module commun demandé est invalide." }, { status: 400 });
  }
  const access = await getEnterpriseCoreAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.enterpriseCoreRecord.findMany({
    where: enterpriseCoreVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll, moduleCode }),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 4 },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 4 },
    },
  });
  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, moduleCode, legacyPolicy: LEGACY_CORE_READ_ONLY },
  });
  return NextResponse.json({
    records: page,
    nextCursor: hasMore ? page.at(-1)?.id || null : null,
    canManage: false,
    legacyReadOnly: true,
    legacyPolicy: LEGACY_CORE_READ_ONLY,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-core-legacy:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const parsed = enterpriseCoreCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Vérifiez les informations saisies." }, { status: 400 });
  const data = parsed.data;
  if (!isEnterpriseCoreModuleCode(data.moduleCode)) return NextResponse.json({ error: "Invalid module" }, { status: 400 });
  const access = await getEnterpriseCoreAccess({ session, organizationId, moduleCode: data.moduleCode, action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await writeAuditLog({
    userId: session.userId,
    action: "LEGACY_CORE_WRITE_ATTEMPT_BLOCKED",
    entity: "EnterpriseCoreRecord",
    request: req,
    metadata: { organizationId, moduleCode: data.moduleCode, recordType: data.recordType, legacyPolicy: LEGACY_CORE_READ_ONLY },
  });
  await writeApiLog({
    request: req,
    statusCode: 410,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, moduleCode: data.moduleCode, deprecatedRouteHit: true, legacyWriteAttempt: true },
  });
  return NextResponse.json(
    {
      error: "Legacy route retired",
      code: "LEGACY_CORE_WRITE_DENIED",
      message: "Cette API historique est désormais en lecture seule. Utilisez le module ERP dédié.",
    },
    { status: 410 },
  );
}
