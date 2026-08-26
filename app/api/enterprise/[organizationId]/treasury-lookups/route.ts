import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_TREASURY", "view");
  if (!auth.ok) return auth.response;

  const [accounts, ledgerAccounts, currencies, members, sites] = await Promise.all([
    prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: [{ accountType: "asc" }, { code: "asc" }],
      take: 500,
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true, availableBalance: true, status: true, revision: true },
    }),
    prisma.enterpriseLedgerAccount.findMany({
      where: {
        organizationId,
        isActive: true,
        archivedAt: null,
        accountSubtype: { in: ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"] },
      },
      orderBy: { code: "asc" },
      take: 1000,
      select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true, accountSubtype: true, currencyCode: true },
    }),
    prisma.enterpriseCurrency.findMany({
      where: { isActive: true, OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { code: "asc" },
      take: 500,
      select: { code: true, name: true, symbol: true, precision: true },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId, status: "ACTIVE", removedAt: null },
      orderBy: { user: { name: "asc" } },
      take: 1000,
      select: { userId: true, role: true, positionTitle: true, user: { select: { name: true, email: true } } },
    }),
    prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, code: true, name: true },
    }),
  ]);

  const currencyByCode = new Map<string, { code: string; name: string; symbol: string | null; precision: number }>();
  for (const currency of currencies) currencyByCode.set(currency.code, currency);
  for (const account of accounts) {
    if (!currencyByCode.has(account.currencyCode)) currencyByCode.set(account.currencyCode, { code: account.currencyCode, name: account.currencyCode, symbol: null, precision: 2 });
  }

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "treasury-lookups" } });
  return NextResponse.json({
    accounts,
    ledgerAccounts,
    currencies: [...currencyByCode.values()].sort((a, b) => a.code.localeCompare(b.code)),
    members: members.map((member) => ({ id: member.userId, label: member.user.name || member.user.email, email: member.user.email, role: member.role, positionTitle: member.positionTitle })),
    sites,
  });
}
