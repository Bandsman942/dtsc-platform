import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { listEnterpriseCurrencies } from "@/lib/enterprise/accounting/currency-service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_CLOSE", "view");
  if (!auth.ok) return auth.response;

  const [configuration, periods, fiscalYears, currencies, recentEntries] = await Promise.all([
    prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } }),
    prisma.enterpriseFiscalPeriod.findMany({
      where: { organizationId, status: { in: ["OPEN", "SOFT_CLOSED"] } },
      include: { fiscalYear: true },
      orderBy: { endDate: "desc" },
      take: 60,
    }),
    prisma.enterpriseFiscalYear.findMany({
      where: { organizationId, status: { in: ["OPEN", "CLOSING"] } },
      include: { periods: { orderBy: { startDate: "asc" } } },
      orderBy: { endDate: "desc" },
      take: 20,
    }),
    listEnterpriseCurrencies(organizationId),
    prisma.enterpriseJournalEntry.findMany({
      where: {
        organizationId,
        postingEvent: { in: ["FX_CLOSING_REVALUATION_POSTED", "YEAR_END_CLOSED"] },
      },
      select: {
        id: true,
        number: true,
        postingEvent: true,
        accountingDate: true,
        reference: true,
        description: true,
        status: true,
        functionalCurrencyCode: true,
        totalDebit: true,
        totalCredit: true,
        sourceEntityId: true,
        reversalRecordsAsOriginal: {
          select: {
            reversalEntry: { select: { id: true, number: true, accountingDate: true, status: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ accountingDate: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
  ]);

  await writeApiLog({
    request: req,
    statusCode: 200,
    userId: auth.session.userId,
    startedAt,
    metadata: { organizationId, domain: "financial-close-operations" },
  });
  return NextResponse.json({
    functionalCurrencyCode: configuration?.functionalCurrencyCode || null,
    periods,
    fiscalYears,
    currencies,
    recentEntries,
    capabilities: { canRun: Boolean(auth.access.capabilities.canManage) },
  });
}
