import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessEnterpriseModule } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const criteriaSchema = z.record(z.string().max(80), z.union([z.string().max(500), z.boolean(), z.number().finite(), z.array(z.string().max(160)).max(50), z.null()])).refine((value) => Object.keys(value).length <= 30, "Trop de critères.");
const updateSchema = z.object({ name: z.string().trim().min(2).max(80), criteria: criteriaSchema, isDefault: z.boolean().default(false) });
type Params = { params: Promise<{ organizationId: string; id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `work-filter-update:${session.userId}`), 90, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message }, { status: 400 });
  const current = await prisma.enterpriseSavedWorkFilter.findFirst({ where: { id, organizationId, userId: session.userId } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, current.moduleCode, "read"))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const filter = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.enterpriseSavedWorkFilter.updateMany({ where: { organizationId, userId: session.userId, moduleCode: current.moduleCode, id: { not: id }, isDefault: true }, data: { isDefault: false } });
      }
      return tx.enterpriseSavedWorkFilter.update({ where: { id }, data: { name: parsed.data.name, criteriaJson: parsed.data.criteria as Prisma.InputJsonValue, isDefault: parsed.data.isDefault } });
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORK_FILTER_UPDATED", entity: "EnterpriseSavedWorkFilter", entityId: id, request: req, metadata: { organizationId, moduleCode: current.moduleCode } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: current.moduleCode, domain: "work-filters" } });
    return NextResponse.json({ filter });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "CONFLICT", message: "Un filtre portant ce nom existe déjà." }, { status: 409 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `work-filter-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { organizationId, id } = await params;
  const current = await prisma.enterpriseSavedWorkFilter.findFirst({ where: { id, organizationId, userId: session.userId } });
  if (!current) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await canAccessEnterpriseModule(session.userId, organizationId, current.moduleCode, "read"))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  await prisma.enterpriseSavedWorkFilter.delete({ where: { id } });
  await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_WORK_FILTER_DELETED", entity: "EnterpriseSavedWorkFilter", entityId: id, request: req, metadata: { organizationId, moduleCode: current.moduleCode } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, moduleCode: current.moduleCode, domain: "work-filters" } });
  return NextResponse.json({ ok: true });
}
