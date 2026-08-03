import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const SUPPORTED_MODULES = new Set(["TASKS_OPERATIONS", "INTERNAL_REQUESTS", "VALIDATIONS", "MEETINGS", "WORKFLOWS", "DOCUMENTS"]);
const criteriaSchema = z.record(z.string().max(80), z.union([z.string().max(500), z.boolean(), z.number().finite(), z.array(z.string().max(160)).max(50), z.null()])).refine((value) => Object.keys(value).length <= 30, "Trop de critères.");
const filterSchema = z.object({
  moduleCode: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  criteria: criteriaSchema,
  isDefault: z.boolean().default(false),
});

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { organizationId } = await params;
  const moduleCode = new URL(req.url).searchParams.get("moduleCode")?.trim() || "TASKS_OPERATIONS";
  if (!SUPPORTED_MODULES.has(moduleCode)) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, moduleCode, "read"))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const filters = await prisma.enterpriseSavedWorkFilter.findMany({
    where: { organizationId, userId: session.userId, moduleCode },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    take: 30,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode, domain: "work-filters" } });
  return NextResponse.json({ filters });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `work-filter-create:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId } = await params;
  const parsed = filterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !SUPPORTED_MODULES.has(parsed.data?.moduleCode || "")) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.success ? "Module de filtre non supporté." : parsed.error.issues[0]?.message }, { status: 400 });
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, parsed.data.moduleCode, "read"))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const count = await prisma.enterpriseSavedWorkFilter.count({ where: { organizationId, userId: session.userId, moduleCode: parsed.data.moduleCode } });
  if (count >= 30) return NextResponse.json({ error: "LIMIT_REACHED", message: "La limite de filtres personnels est atteinte." }, { status: 409 });

  try {
    const filter = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.enterpriseSavedWorkFilter.updateMany({ where: { organizationId, userId: session.userId, moduleCode: parsed.data.moduleCode, isDefault: true }, data: { isDefault: false } });
      }
      return tx.enterpriseSavedWorkFilter.create({
        data: {
          organizationId,
          userId: session.userId,
          moduleCode: parsed.data.moduleCode,
          name: parsed.data.name,
          criteriaJson: parsed.data.criteria as Prisma.InputJsonValue,
          isDefault: parsed.data.isDefault,
        },
      });
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORK_FILTER_CREATED", entity: "EnterpriseSavedWorkFilter", entityId: filter.id, request: req, metadata: { organizationId, moduleCode: filter.moduleCode } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: filter.moduleCode, domain: "work-filters" } });
    return NextResponse.json({ filter }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "CONFLICT", message: "Un filtre portant ce nom existe déjà." }, { status: 409 });
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Le filtre n’a pas pu être enregistré." }, { status: 500 });
  }
}
