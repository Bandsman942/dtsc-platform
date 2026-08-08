import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeRetailRequest } from "@/lib/enterprise/retail/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const items = await prisma.enterpriseFinancialAccount.findMany({
    where: { organizationId, status: "ACTIVE", archivedAt: null, accountType: { in: ["CASH", "BANK", "MOBILE_MONEY", "CLEARING"] } },
    orderBy: [{ currencyCode: "asc" }, { accountType: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, accountType: true, currencyCode: true, operationalBalance: true },
    take: 200,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-refund-accounts", count: items.length } });
  return NextResponse.json({ items });
}
