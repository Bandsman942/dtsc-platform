import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { createManualAccountMapping } from "@/lib/enterprise/accounting/account-mapping-service";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { accountMappingCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { getSemanticAccountDefinition } from "@/lib/enterprise/accounting/semantic-account-registry";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseAccountMappingWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {}),
    ...(search ? {
      OR: [
        { mappingKey: { contains: search, mode: "insensitive" } },
        { ledgerAccount: { code: { contains: search, mode: "insensitive" } } },
        { ledgerAccount: { nameFr: { contains: search, mode: "insensitive" } } },
        { ledgerAccount: { nameEn: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseAccountMapping.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { mappingKey: "asc" }, { effectiveFrom: "desc" }],
      skip: recordId ? 0 : (page - 1) * pageSize,
      take: recordId ? 1 : pageSize,
      include: { ledgerAccount: { include: { chart: { select: { id: true, code: true, nameFr: true, nameEn: true, status: true, templateCode: true } } } } },
    }),
    prisma.enterpriseAccountMapping.count({ where }),
  ]);
  const projected = items.map((item) => {
    const definition = getSemanticAccountDefinition(item.mappingKey);
    const templateManaged = Boolean(item.ledgerAccount.chart.templateCode);
    return {
      ...item,
      semanticLabelFr: definition?.labelFr || item.mappingKey,
      semanticLabelEn: definition?.labelEn || item.mappingKey,
      domain: definition?.domain || null,
      category: definition?.category || null,
      status: item.isActive ? "ACTIVE" : "INACTIVE",
      templateManaged,
      capabilities: {
        canEdit: Boolean(auth.access.capabilities.canManage && !templateManaged),
        canDeactivate: Boolean(auth.access.capabilities.canManage && !templateManaged && item.isActive),
      },
    };
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-mappings", recordId: recordId || null } });
  return NextResponse.json({ items: projected, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = accountMappingCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "ACCOUNT_MAPPING_INPUT_INVALID");
  try {
    const mapping = await createManualAccountMapping(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_ACCOUNT_MAPPING_CREATED", entity: "EnterpriseAccountMapping", entityId: mapping.id, request: req, metadata: { organizationId, mappingKey: mapping.mappingKey, ledgerAccountId: mapping.ledgerAccountId } });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "account-mappings" } });
    return NextResponse.json({ ok: true, mapping }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_MAPPING_CREATE_FAILED");
  }
}
