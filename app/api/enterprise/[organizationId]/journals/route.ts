import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { createJournal } from "@/lib/enterprise/accounting/master-service";
import { journalCreateSchema } from "@/lib/enterprise/accounting/schemas";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view"); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const { page, pageSize, search, status } = financeListParams(req); const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseJournalWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { nameFr: { contains: search, mode: "insensitive" } }, { nameEn: { contains: search, mode: "insensitive" } }, { journalType: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseJournal.findMany({ where, orderBy: [{ journalType: "asc" }, { code: "asc" }], skip: recordId ? 0 : (page - 1) * pageSize, take: recordId ? 1 : pageSize }),
    prisma.enterpriseJournal.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "journals", recordId: recordId || null, hasSearch: Boolean(search) } });
  return NextResponse.json({ items, pagination: { page: recordId ? 1 : page, pageSize: recordId ? 1 : pageSize, total, pageCount: recordId ? 1 : Math.max(1, Math.ceil(total / pageSize)) } });
}
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now(); const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "create", { mutation: true }); if (!auth.ok) return auth.response;
  const parsed = journalCreateSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });
  try { const journal = await createJournal(organizationId, auth.session.userId, parsed.data); await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_JOURNAL_CREATED", entity: "EnterpriseJournal", entityId: journal.id, request: req, metadata: { organizationId, code: journal.code } }); await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "journals" } }); return NextResponse.json({ ok: true, journal }, { status: 201 }); } catch (error) { return financeErrorResponse(error, "JOURNAL_CREATE_FAILED"); }
}
