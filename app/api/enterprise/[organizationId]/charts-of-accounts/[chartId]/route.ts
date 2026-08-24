import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; chartId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, chartId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "view");
  if (!auth.ok) return auth.response;

  const item = await prisma.enterpriseChartOfAccounts.findFirst({
    where: { id: chartId, organizationId },
    include: {
      groups: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
      accounts: {
        where: { archivedAt: null },
        orderBy: [{ code: "asc" }],
        include: {
          parent: { select: { id: true, code: true, nameFr: true, nameEn: true } },
          group: { select: { id: true, code: true, nameFr: true, nameEn: true } },
          _count: { select: { children: true, journalLines: true, accountMappings: true } },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json(
      { error: "CHART_OF_ACCOUNTS_NOT_FOUND", message: "Ce plan comptable n’existe pas dans votre entreprise." },
      { status: 404 },
    );
  }

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, chartId, domain: "chart-of-accounts-detail", accountCount: item.accounts.length },
  });
  return NextResponse.json({ item });
}
