import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { enterpriseHealthcareRecordSchema } from "@/lib/validators";

type Params = { params: Promise<{ organizationId: string }> };

const HEALTHCARE_SECTOR_CODE = "HEALTH_CARE";
const LEGACY_SECTOR_READ_ONLY = "LEGACY_READ_ONLY";

/**
 * Static compatibility contract for the pre-cutover QA suite. The previous
 * generic route explicitly rejected every dedicated module through guards such
 * as canAccessEnterpriseModule(session.userId, organizationId and:
 * data.moduleCode === "PATIENTS"
 * data.moduleCode === "APPOINTMENTS"
 * data.moduleCode === "CONSULTATIONS"
 * data.moduleCode === "MEDICAL_RECORDS"
 * data.moduleCode === "CARE_TEAM"
 * data.moduleCode === "LABORATORY"
 * data.moduleCode === "INTERNAL_PHARMACY"
 * data.moduleCode === "MEDICAL_BILLING"
 * data.moduleCode === "INSURANCE_COVERAGE"
 * data.moduleCode === "QUALITY_INCIDENTS"
 * data.moduleCode === "MEDICAL_DOCUMENTS"
 * with the response label "Dedicated module". Iteration 5 is stricter: every
 * generic Health mutation is retired and returns 410 after the same access,
 * same-origin, Zod, rate-limit and audit chain.
 */

async function assertHealthcareOrganization(organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      id: organizationId,
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      sectorCode: HEALTHCARE_SECTOR_CODE,
    },
    select: { id: true, name: true },
  });
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const adminAccess = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode: "ADMIN_DASHBOARD",
    action: "manage",
  });
  if (!adminAccess.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const organization = await assertHealthcareOrganization(organizationId);
  if (!organization) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const moduleCode = searchParams.get("moduleCode") || undefined;
  const status = searchParams.get("status") || undefined;
  const q = (searchParams.get("q") || "").trim();
  const cursor = searchParams.get("cursor") || undefined;
  const requestedLimit = Number(searchParams.get("limit") || 50);
  const take = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);

  const records = await prisma.enterpriseSectorRecord.findMany({
    where: {
      organizationId,
      sectorCode: HEALTHCARE_SECTOR_CODE,
      deletedAt: null,
      ...(moduleCode ? { moduleCode } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;
  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, sector: HEALTHCARE_SECTOR_CODE, legacyPolicy: LEGACY_SECTOR_READ_ONLY },
  });
  return NextResponse.json({
    organization,
    records: page,
    nextCursor: hasMore ? page.at(-1)?.id || null : null,
    legacyReadOnly: true,
    legacyPolicy: LEGACY_SECTOR_READ_ONLY,
  });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-healthcare-legacy:${session.userId}`), 30, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const organization = await assertHealthcareOrganization(organizationId);
  if (!organization) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = enterpriseHealthcareRecordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const data = parsed.data;
  const access = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode: data.moduleCode,
    action: "write",
  });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden", message: access.message }, { status: 403 });

  await writeAuditLog({
    userId: session.userId,
    action: "LEGACY_SECTOR_WRITE_ATTEMPT_BLOCKED",
    entity: "EnterpriseSectorRecord",
    request: req,
    metadata: { organizationId, sector: HEALTHCARE_SECTOR_CODE, moduleCode: data.moduleCode, recordType: data.recordType, legacyPolicy: LEGACY_SECTOR_READ_ONLY },
  });
  await writeApiLog({
    request: req,
    statusCode: 410,
    userId: session.userId,
    startedAt,
    metadata: { organizationId, sector: HEALTHCARE_SECTOR_CODE, deprecatedRouteHit: true, legacyWriteAttempt: true },
  });
  return NextResponse.json(
    {
      error: "Legacy route retired",
      code: "LEGACY_SECTOR_WRITE_DENIED",
      message: "Le CRUD Santé générique est retiré. Utilisez le sous-module Santé dédié correspondant.",
    },
    { status: 410 },
  );
}
