import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeErrorResponse, financeListParams } from "@/lib/enterprise/accounting/http";
import { importBankStatement } from "@/lib/enterprise/accounting/treasury-service";
import { bankStatementSchema } from "@/lib/enterprise/accounting/treasury-schemas";
import { ENTERPRISE_BULK_LIMITS } from "@/lib/enterprise/bulk-jobs/constants";
import { enqueueBankStatementImport, enterpriseBulkJobStatus } from "@/lib/enterprise/bulk-jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_BANK", "view");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, search, status } = financeListParams(req);
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const where: Prisma.EnterpriseBankStatementWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { reference: { contains: search, mode: "insensitive" } },
        { currencyCode: { contains: search, mode: "insensitive" } },
        { financialAccount: { code: { contains: search, mode: "insensitive" } } },
        { financialAccount: { name: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseBankStatement.findMany({
      where,
      orderBy: { statementDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        financialAccount: { select: { id: true, code: true, name: true, currencyCode: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.enterpriseBankStatement.count({ where }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "bank-statements", hasSearch: Boolean(search), recordId: recordId || null } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_BANK", "create", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = bankStatementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message }, { status: 400 });

  try {
    if (parsed.data.lines.length > ENTERPRISE_BULK_LIMITS.bankStatementSyncMaxLines) {
      const job = await enqueueBankStatementImport(organizationId, auth.session.userId, parsed.data);
      const jobStatus = enterpriseBulkJobStatus(job.processingStatus);
      await writeAuditLog({
        userId: auth.session.userId,
        organizationId,
        action: "ENTERPRISE_BANK_STATEMENT_IMPORT_QUEUED",
        entity: "EnterpriseDomainEvent",
        entityId: job.id,
        request: req,
        reasonCode: "BANK_STATEMENT_BULK_IMPORT",
        riskLevel: "MEDIUM",
        metadata: {
          organizationId,
          financialAccountId: parsed.data.financialAccountId,
          reference: parsed.data.reference,
          currency: parsed.data.currencyCode,
          lineCount: parsed.data.lines.length,
          syncThreshold: ENTERPRISE_BULK_LIMITS.bankStatementSyncMaxLines,
        },
      });
      await writeApiLog({ request: req, statusCode: 202, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "bank-statements", mode: "durable", jobId: job.id } });
      return NextResponse.json({
        ok: true,
        queued: true,
        mode: "durable",
        job: {
          id: job.id,
          status: jobStatus,
          statusUrl: `/api/enterprise/${organizationId}/bank-statement-imports/${job.id}`,
        },
      }, { status: 202 });
    }

    const statement = await importBankStatement(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_BANK_STATEMENT_IMPORTED",
      entity: "EnterpriseBankStatement",
      entityId: statement.id,
      request: req,
      metadata: {
        organizationId,
        financialAccountId: statement.financialAccountId,
        reference: statement.reference,
        currency: statement.currencyCode,
        lineCount: statement.lines.length,
        mode: "synchronous",
      },
    });
    await writeApiLog({ request: req, statusCode: 201, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "bank-statements", mode: "synchronous" } });
    return NextResponse.json({ ok: true, queued: false, mode: "synchronous", statement }, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "BANK_STATEMENT_IMPORT_FAILED");
  }
}
