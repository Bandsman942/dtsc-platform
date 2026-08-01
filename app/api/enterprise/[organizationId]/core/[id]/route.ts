import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCoreAccess } from "@/lib/enterprise/enterprise-core-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; id: string }> };

// The former enterpriseCoreUpdateSchema.safeParse contract is superseded by a
// bounded compatibility payload because every legacy Core update is refused.
const legacyMutationSchema = z.object({ action: z.string().trim().min(1).max(80).optional() }).passthrough();
const LEGACY_CORE_READ_ONLY = "LEGACY_READ_ONLY";

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-core-legacy-update:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId, id } = await params;
  const parsed = legacyMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const record = await prisma.enterpriseCoreRecord.findFirst({ where: { id, organizationId, archivedAt: null } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getEnterpriseCoreAccess({ session, organizationId, moduleCode: record.moduleCode, action: "submit" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const related = [record.createdById, record.requestedById, record.assignedToUserId, record.validatorUserId].includes(session.userId);
  if (!access.canSeeAll && !related) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await writeAuditLog({
    userId: session.userId,
    action: "LEGACY_CORE_WRITE_ATTEMPT_BLOCKED",
    entity: "EnterpriseCoreRecord",
    entityId: id,
    request: req,
    metadata: { organizationId, moduleCode: record.moduleCode, action: parsed.data.action || "UNKNOWN", legacyPolicy: LEGACY_CORE_READ_ONLY },
  });
  await writeApiLog({
    request: req,
    statusCode: 410,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, recordId: id, deprecatedRouteHit: true, legacyWriteAttempt: true },
  });
  return NextResponse.json(
    {
      error: "Legacy read only",
      code: "LEGACY_CORE_WRITE_DENIED",
      message: "Cet ancien objet reste consultable en historique mais ne peut plus être modifié.",
    },
    { status: 410 },
  );
}
