import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEnterpriseFinanceAccess } from "@/lib/enterprise/finance/access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** Read-only, tenant-scoped budget selectors. Never return balances or full bank identifiers. */
export async function GET(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseFinanceAccess({ session, organizationId, moduleCode: "FINANCE_BUDGETS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
  if (kind === "financial-account") {
    const items = await prisma.enterpriseFinancialAccount.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { code: "asc" }, take: 30,
      select: { id: true, code: true, name: true, accountType: true, currencyCode: true, siteId: true },
    });
    return NextResponse.json({ items });
  }
  if (kind === "expense-account") {
    const items = await prisma.enterpriseLedgerAccount.findMany({
      where: { organizationId, isActive: true, archivedAt: null, allowDirectPosting: true, accountType: { in: ["EXPENSE", "OTHER_EXPENSE", "ASSET", "LIABILITY"] }, ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { nameFr: { contains: search, mode: "insensitive" } }, { nameEn: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { code: "asc" }, take: 30,
      select: { id: true, code: true, nameFr: true, nameEn: true, accountType: true },
    });
    return NextResponse.json({ items });
  }
  if (kind === "employee") {
    const items = await prisma.enterpriseEmployee.findMany({
      where: { organizationId, employmentStatus: "ACTIVE", archivedAt: null, ...(search ? { OR: [{ employeeNumber: { contains: search, mode: "insensitive" } }, { displayName: { contains: search, mode: "insensitive" } }] } : {}) },
      orderBy: { displayName: "asc" }, take: 30,
      select: { id: true, employeeNumber: true, displayName: true },
    });
    return NextResponse.json({ items });
  }
  return NextResponse.json({ error: "INVALID_REFERENCE_KIND", message: "Ce type de référence n’est pas disponible pour les budgets." }, { status: 400 });
}
