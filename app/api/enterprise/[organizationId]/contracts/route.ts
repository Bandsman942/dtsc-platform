import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { contractCreateSchema, contractUpdateSchema } from "@/lib/enterprise/crm-sales/schemas";
import { createEnterpriseContract, updateEnterpriseContract } from "@/lib/enterprise/crm-sales/service";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const where: Prisma.EnterpriseContractWhereInput = {
    organizationId,
    archivedAt: null,
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
  };
  const [rawItems, total, draft, pendingApproval, approved, active, suspended, expiring, expired, terminated] = await Promise.all([
    prisma.enterpriseContract.findMany({ where, orderBy: [{ endDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseContract.count({ where }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "DRAFT" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "PENDING_APPROVAL" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "APPROVED" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "SUSPENDED" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "ACTIVE", endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "EXPIRED" } }),
    prisma.enterpriseContract.count({ where: { organizationId, archivedAt: null, status: "TERMINATED" } }),
  ]);
  const parties = await prisma.enterpriseBusinessParty.findMany({ where: { organizationId, id: { in: [...new Set(rawItems.map((item) => item.businessPartyId))] } }, select: { id: true, code: true, legalName: true, displayName: true } });
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const approvals = await prisma.enterpriseApproval.findMany({ where: { organizationId, targetEntityType: "EnterpriseContract", targetEntityId: { in: rawItems.map((item) => item.id) }, archivedAt: null }, orderBy: { requestedAt: "desc" } });
  const approvalByContract = new Map<string, (typeof approvals)[number]>();
  for (const approval of approvals) if (!approvalByContract.has(approval.targetEntityId)) approvalByContract.set(approval.targetEntityId, approval);
  const items = rawItems.map((item) => ({ ...item, businessParty: partyById.get(item.businessPartyId) || null, approval: approvalByContract.get(item.id) || null }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts", page } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { draft, pendingApproval, approved, active, suspended, expiring, expired, terminated }, canManage: access.canManage });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-contract-create:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = contractCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Contrat invalide." }, { status: 400 });
  try {
    const contract = await createEnterpriseContract(organizationId, session.userId, parsed.data);
    if (parsed.data.approverUserId && parsed.data.approverUserId !== session.userId) {
      await notifyUser({
        userId: parsed.data.approverUserId,
        organizationId,
        type: "ENTERPRISE_APPROVAL",
        title: "Contrat à valider",
        body: contract.title,
        targetUrl: `/enterprise-modules/CONTRACTS?contract=${encodeURIComponent(contract.id)}&section=validation`,
        idempotencyKey: `contract-approval:${contract.id}:${contract.revision}`,
      });
    }
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_CREATED", entity: "EnterpriseContract", entityId: contract.id, request: req, metadata: { organizationId, status: contract.status } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts" } });
    return NextResponse.json({ ok: true, contract }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "CONTRACT_CREATE_FAILED");
  }
}


export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CONTRACTS", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.json().catch(() => null) as ({ contractId?: string } & Record<string, unknown>) | null;
  const contractId = typeof raw?.contractId === "string" ? raw.contractId : "";
  const parsed = contractUpdateSchema.safeParse(raw);
  if (!contractId || !parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.success ? "Contrat introuvable." : parsed.error.issues[0]?.message || "Modification invalide." }, { status: 400 });
  try {
    const contract = await updateEnterpriseContract(organizationId, contractId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_CONTRACT_UPDATED", entity: "EnterpriseContract", entityId: contract.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "contracts", action: "update" } });
    return NextResponse.json({ ok: true, contract });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "CONTRACT_UPDATE_FAILED");
  }
}
