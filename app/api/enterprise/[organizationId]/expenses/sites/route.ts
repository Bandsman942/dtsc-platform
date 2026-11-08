import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await prisma.enterpriseSite.findMany({
    where: { organizationId, archivedAt: null, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: [{ name: "asc" }],
    take: 500,
  });
  await writeApiLog({ request: req, startedAt, statusCode: 200, userId: session.userId, metadata: { organizationId, domain: "expense-site-selector", count: items.length } });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
