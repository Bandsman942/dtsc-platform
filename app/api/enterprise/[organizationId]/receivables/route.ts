import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dueDateFilter(value: string | null, overdue: boolean): Prisma.DateTimeNullableFilter | undefined {
  const today = startOfToday();
  const day = 86_400_000;
  if (overdue) return { lt: today };
  if (value === "TO_DUE") return { gte: today };
  if (value === "D1_30") return { gte: new Date(today.getTime() - 30 * day), lt: today };
  if (value === "D31_60") return { gte: new Date(today.getTime() - 60 * day), lt: new Date(today.getTime() - 30 * day) };
  if (value === "D61_90") return { gte: new Date(today.getTime() - 90 * day), lt: new Date(today.getTime() - 60 * day) };
  if (value === "D90_PLUS") return { lt: new Date(today.getTime() - 90 * day) };
  return undefined;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_RECEIVABLES", "view");
  if (!auth.ok) return auth.response;
  const { page, pageSize, search, status } = financeListParams(req);
  const url = new URL(req.url);
  const overdue = url.searchParams.get("overdue") === "true";
  const ageBucket = url.searchParams.get("ageBucket");
  const recordId = url.searchParams.get("recordId")?.trim() || undefined;
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || undefined;
  const currencyCode = url.searchParams.get("currencyCode")?.trim().toUpperCase() || undefined;
  const dueDate = dueDateFilter(ageBucket, overdue);
  const effectiveStatus = dueDate ? "OPEN" : status;
  const where: Prisma.EnterpriseReceivableWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(effectiveStatus ? { status: effectiveStatus } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(search ? { salesInvoice: { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ] } } : {}),
  };
  const [items, total, openAmount, overdueAmount] = await Promise.all([
    prisma.enterpriseReceivable.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { salesInvoice: true, _count: { select: { paymentAllocations: true, allocations: true } } } }),
    prisma.enterpriseReceivable.count({ where }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { outstandingAmount: true } }),
    prisma.enterpriseReceivable.aggregate({ where: { organizationId, status: "OPEN", dueDate: { lt: startOfToday() } }, _sum: { outstandingAmount: true } }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "receivables", page, overdue, ageBucket } });
  return NextResponse.json({ items, pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) }, metrics: { openAmount: openAmount._sum.outstandingAmount || new Prisma.Decimal(0), overdueAmount: overdueAmount._sum.outstandingAmount || new Prisma.Decimal(0) } });
}
