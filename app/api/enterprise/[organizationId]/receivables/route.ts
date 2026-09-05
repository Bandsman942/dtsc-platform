import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeApiLog } from "@/lib/audit";
import { authorizeFinanceRequest, financeListParams } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function ageingWhere(value: string | null, overdue: boolean): Prisma.EnterpriseReceivableWhereInput {
  const today = startOfUtcDay();
  if (overdue) return { status: "OPEN", dueDate: { lt: today } };
  if (value === "TO_DUE") return { status: "OPEN", OR: [{ dueDate: null }, { dueDate: { gte: today } }] };
  if (value === "D1_30") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -30), lt: today } };
  if (value === "D31_60") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -60), lt: addUtcDays(today, -30) } };
  if (value === "D61_90") return { status: "OPEN", dueDate: { gte: addUtcDays(today, -90), lt: addUtcDays(today, -60) } };
  if (value === "D90_PLUS") return { status: "OPEN", dueDate: { lt: addUtcDays(today, -90) } };
  return {};
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
  const hasAgeFilter = overdue || Boolean(ageBucket);
  const ageFilter = ageingWhere(ageBucket, overdue);

  const where: Prisma.EnterpriseReceivableWhereInput = {
    organizationId,
    ...(recordId ? { id: recordId } : {}),
    ...(!hasAgeFilter && status ? { status } : {}),
    ...ageFilter,
    ...(businessPartyId ? { businessPartyId } : {}),
    ...(currencyCode ? { currencyCode } : {}),
    ...(search ? { salesInvoice: { OR: [
      { number: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ] } } : {}),
  };
  const today = startOfUtcDay();
  const [items, total, openByCurrency, overdueByCurrency] = await Promise.all([
    prisma.enterpriseReceivable.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { salesInvoice: true, _count: { select: { paymentAllocations: true, allocations: true } } },
    }),
    prisma.enterpriseReceivable.count({ where }),
    prisma.enterpriseReceivable.groupBy({
      by: ["currencyCode"],
      where: { organizationId, status: "OPEN" },
      _sum: { outstandingAmount: true },
      _count: { _all: true },
    }),
    prisma.enterpriseReceivable.groupBy({
      by: ["currencyCode"],
      where: { organizationId, status: "OPEN", dueDate: { lt: today } },
      _sum: { outstandingAmount: true },
      _count: { _all: true },
    }),
  ]);

  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "receivables", page, overdue, ageBucket } });
  return NextResponse.json({
    items,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { openByCurrency, overdueByCurrency },
  });
}
