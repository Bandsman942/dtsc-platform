import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; statementId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, statementId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_BANK", "view");
  if (!auth.ok) return auth.response;

  const statement = await prisma.enterpriseBankStatement.findFirst({
    where: { id: statementId, organizationId },
    include: {
      financialAccount: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          maskedReference: true,
          operationalBalance: true,
          reconciledBalance: true,
        },
      },
      lines: {
        orderBy: [{ lineNumber: "asc" }, { transactionDate: "asc" }],
      },
    },
  });
  if (!statement) return NextResponse.json({ error: "BANK_STATEMENT_NOT_FOUND", message: "Le relevé bancaire demandé est introuvable." }, { status: 404 });

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "bank-statement-detail", statementId },
  });
  return NextResponse.json({ statement });
}
