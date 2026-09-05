import { NextResponse } from "next/server";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { BANK_STATEMENT_IMPORT_EVENT_TYPE } from "@/lib/enterprise/bulk-jobs/constants";
import { enterpriseBulkJobStatus, type BankStatementImportJobPayload } from "@/lib/enterprise/bulk-jobs/queue";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; jobId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { organizationId, jobId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_BANK", "view");
  if (!auth.ok) return auth.response;
  const job = await prisma.enterpriseDomainEvent.findFirst({
    where: { id: jobId, organizationId, eventType: BANK_STATEMENT_IMPORT_EVENT_TYPE },
    select: { id: true, processingStatus: true, attemptCount: true, lastError: true, payloadJson: true, createdAt: true, updatedAt: true, processedAt: true },
  });
  if (!job) return NextResponse.json({ error: "BANK_STATEMENT_IMPORT_JOB_NOT_FOUND" }, { status: 404 });
  const payload = job.payloadJson as BankStatementImportJobPayload | null;
  const statement = payload?.reference ? await prisma.enterpriseBankStatement.findFirst({
    where: { organizationId, reference: payload.reference },
    select: { id: true, status: true, reference: true, _count: { select: { lines: true } } },
  }) : null;
  const expectedLineCount = payload?.expectedLineCount || 0;
  const importedLineCount = statement?._count.lines || 0;
  const progressPercent = expectedLineCount ? Math.min(100, Math.round((importedLineCount / expectedLineCount) * 100)) : 0;
  return NextResponse.json({
    job: {
      id: job.id,
      status: enterpriseBulkJobStatus(job.processingStatus),
      attemptCount: job.attemptCount,
      errorCode: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      processedAt: job.processedAt,
      expectedLineCount,
      importedLineCount,
      progressPercent,
      statement: statement ? { id: statement.id, reference: statement.reference, status: statement.status } : null,
    },
  });
}
