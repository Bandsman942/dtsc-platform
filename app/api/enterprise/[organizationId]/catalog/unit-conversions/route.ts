import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { EnterpriseDomainError } from "@/lib/enterprise/common/errors";
import { enterpriseDomainErrorResponse, enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { appendCatalogUnitConversion, catalogConversionMatchesUnits, resolveCatalogUnitConversion } from "@/lib/enterprise/master-data/unit-conversions";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };
const reference = z.string().trim().min(1).max(191);
const createSchema = z.object({
  catalogItemId: reference,
  sourceUnitId: reference,
  factor: z.string().regex(/^\d{1,18}(?:\.\d{1,12})?$/),
  expectedVersion: z.number().int().min(0).max(2147483646),
}).strict();
const previewSchema = z.object({
  sourceUnitId: reference,
  quantity: z.string().regex(/^\d{1,15}(?:\.\d{1,6})?$/),
});
const historySelect = {
  id: true, catalogItemId: true, sourceUnitId: true, targetUnitId: true,
  version: true, factor: true, sourceScale: true, targetScale: true,
  sourceCode: true, targetCode: true, createdAt: true,
} satisfies Prisma.EnterpriseCatalogUnitConversionSelect;
const privateHeaders = { "Cache-Control": "private, no-store" };

function publicConversion(row: Prisma.EnterpriseCatalogUnitConversionGetPayload<{ select: typeof historySelect }>) {
  return { ...row, factor: row.factor.toFixed() };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const query = new URL(req.url).searchParams;
  const item = reference.safeParse(query.get("catalogItemId"));
  if (!item.success) return enterpriseValidationErrorResponse(item.error, "CATALOG_CONVERSION_INPUT_INVALID", req);
  try {
    if (query.has("quantity")) {
      const preview = previewSchema.safeParse({ sourceUnitId: query.get("sourceUnitId"), quantity: query.get("quantity") });
      if (!preview.success) return enterpriseValidationErrorResponse(preview.error, "CATALOG_CONVERSION_INPUT_INVALID", req);
      const result = await prisma.$transaction(tx => resolveCatalogUnitConversion(tx, {
        organizationId, catalogItemId: item.data, ...preview.data,
      }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-unit-conversion-preview" } });
      return NextResponse.json({ preview: result }, { headers: privateHeaders });
    }
    if (query.has("unitSearch")) {
      const search = z.string().trim().max(120).safeParse(query.get("unitSearch"));
      if (!search.success) return enterpriseValidationErrorResponse(search.error, "CATALOG_CONVERSION_INPUT_INVALID", req);
      const page = Math.max(1, Math.min(10000, Math.trunc(Number(query.get("page")) || 1)));
      const pageSize = Math.max(5, Math.min(50, Math.trunc(Number(query.get("pageSize")) || 20)));
      const result = await prisma.$transaction(async tx => {
        const catalog = await tx.enterpriseCatalogItem.findFirst({
          where: { organizationId, id: item.data },
          select: { unitOfMeasureId: true },
        });
        if (!catalog) throw new EnterpriseDomainError("CATALOG_CONVERSION_REFERENCE_UNAVAILABLE", 404);
        const where: Prisma.EnterpriseUnitOfMeasureWhereInput = {
          organizationId, archivedAt: null, status: "ACTIVE", id: { not: catalog.unitOfMeasureId },
          ...(search.data ? { OR: [{ code: { contains: search.data, mode: "insensitive" } }, { name: { contains: search.data, mode: "insensitive" } }, { symbol: { contains: search.data, mode: "insensitive" } }] } : {}),
        };
        const [items, total] = await Promise.all([
          tx.enterpriseUnitOfMeasure.findMany({ where, orderBy: [{ code: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, code: true, name: true, symbol: true, decimalScale: true } }),
          tx.enterpriseUnitOfMeasure.count({ where }),
        ]);
        return { items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-unit-conversion-units", page } });
      return NextResponse.json({ ...result, canManage: access.canAdminister }, { headers: privateHeaders });
    }
    const source = query.has("sourceUnitId") ? reference.safeParse(query.get("sourceUnitId")) : null;
    if (source && !source.success) return enterpriseValidationErrorResponse(source.error, "CATALOG_CONVERSION_INPUT_INVALID", req);
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(query.get("page")) || 1)));
    const pageSize = Math.max(5, Math.min(100, Math.trunc(Number(query.get("pageSize")) || 25)));
    const where = { organizationId, catalogItemId: item.data, ...(source?.success ? { sourceUnitId: source.data } : {}) };
    const result = await prisma.$transaction(async tx => {
      // Preserve historical access for archived articles in the same tenant.
      const catalogItem = await tx.enterpriseCatalogItem.findFirst({
        where: { organizationId, id: item.data },
        select: { id: true, name: true, code: true, status: true, archivedAt: true, trackInventory: true, unitOfMeasure: { select: { id: true, code: true, name: true, decimalScale: true, status: true, archivedAt: true } } },
      });
      if (!catalogItem) throw new EnterpriseDomainError("CATALOG_CONVERSION_REFERENCE_UNAVAILABLE", 404);
      const [items, total, sourceUnit] = await Promise.all([
        tx.enterpriseCatalogUnitConversion.findMany({ where, orderBy: [{ sourceUnitId: "asc" }, { version: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: historySelect }),
        tx.enterpriseCatalogUnitConversion.count({ where }),
        source?.success && source.data !== catalogItem.unitOfMeasure.id
          ? tx.enterpriseUnitOfMeasure.findFirst({
            where: { organizationId, id: source.data, status: "ACTIVE", archivedAt: null },
            select: { id: true, code: true, decimalScale: true },
          })
          : null,
      ]);
      const current = source?.success && page === 1 ? items[0] : undefined;
      return {
        catalogItem, sourceUnit, items: items.map(publicConversion),
        currentConversionMatchesUnits: current && sourceUnit
          ? catalogConversionMatchesUnits(current, sourceUnit, catalogItem.unitOfMeasure)
          : null,
        pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-unit-conversions", page } });
    return NextResponse.json({ ...result, canManage: access.canAdminister }, { headers: privateHeaders });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "CATALOG_CONVERSION_READ_FAILED", req);
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-unit-conversion:${session.userId}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CATALOG", action: "manage" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "CATALOG_CONVERSION_INPUT_INVALID", req);
  try {
    const row = await prisma.$transaction(tx => appendCatalogUnitConversion(tx, {
      ...parsed.data, organizationId, actorUserId: session.userId,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    // The operational event is persisted atomically with the new version by the service.
    await Promise.allSettled([
      writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CATALOG_UNIT_CONVERSION_VERSION_CREATED", entity: "EnterpriseCatalogUnitConversion", entityId: row.id, request: req, metadata: { organizationId, version: row.version } }),
      writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "catalog-unit-conversions" } }),
    ]);
    const { id, catalogItemId, sourceUnitId, targetUnitId, version, factor, sourceScale, targetScale, sourceCode, targetCode, createdAt } = row;
    return NextResponse.json({ ok: true, conversion: publicConversion({ id, catalogItemId, sourceUnitId, targetUnitId, version, factor, sourceScale, targetScale, sourceCode, targetCode, createdAt }) }, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
      return enterpriseDomainErrorResponse(new EnterpriseDomainError("CATALOG_CONVERSION_REVISION_CONFLICT", 409), "CATALOG_CONVERSION_CREATE_FAILED", req);
    }
    return enterpriseDomainErrorResponse(error, "CATALOG_CONVERSION_CREATE_FAILED", req);
  }
}
