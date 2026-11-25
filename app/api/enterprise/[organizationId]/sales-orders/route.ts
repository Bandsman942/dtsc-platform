import { commercialAmountTotals, commercialPageTotals, commercialStatusCount } from "@/lib/enterprise/common/analytics";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { financeBusinessDateRange } from "@/lib/enterprise/accounting/http";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "read" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 20) || 20));
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim().toUpperCase() || "";
  const businessPartyId = url.searchParams.get("businessPartyId")?.trim() || "";
  const dates = financeBusinessDateRange(req);
  if (!dates.ok) return dates.response;
  const allowedStatuses = new Set(["DRAFT","PENDING_APPROVAL","CONFIRMED","IN_FULFILLMENT","PARTIALLY_FULFILLED","FULFILLED","CLOSED","CANCELLED"]);
  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json({ error: "SALES_STATUS_INVALID", message: "Sélectionnez un statut reconnu." }, { status: 400 });
  }
  if (search.length > 120) {
    return NextResponse.json({ error: "SALES_SEARCH_TOO_LONG", message: "Limitez la recherche à 120 caractères." }, { status: 400 });
  }
  // The quote/order stores only businessPartyId; resolve names against the
  // canonical enterprise party register, within the same organization.
  const matchingParties = search ? await prisma.enterpriseBusinessParty.findMany({
    where: { organizationId, archivedAt: null, OR: [
      { legalName: { contains: search, mode: "insensitive" } },
      { displayName: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ] },
    select: { id: true },
    take: 1001,
  }) : [];
  if (matchingParties.length > 1000) {
    return NextResponse.json({ error: "SALES_SEARCH_TOO_BROAD", message: "Trop de clients correspondent : affinez la recherche." }, { status: 422 });
  }
  const clientIds = matchingParties.map((party) => party.id);
  const base: Prisma.EnterpriseSalesOrderWhereInput = { organizationId, archivedAt: null };
  const where: Prisma.EnterpriseSalesOrderWhereInput = {
    ...base,
    ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
      ...(clientIds.length ? [{ businessPartyId: { in: clientIds } }] : []),
    ] } : {}),
    ...((dates.from || dates.to) ? { createdAt: { ...(dates.from ? { gte: dates.from } : {}), ...(dates.to ? { lte: dates.to } : {}) } } : {}),
    ...(status ? { status } : {}),
    ...(businessPartyId ? { businessPartyId } : {}),
  };
  const { items, total, filteredGroups, generalGroups } = await prisma.$transaction(async tx => {
    const [items, total, filteredGroups, generalGroups] = await Promise.all([
    tx.enterpriseSalesOrder.findMany({
      where,
      orderBy: [{ expectedFulfillmentAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        fulfillments: { orderBy: { createdAt: "desc" }, take: 10, include: { items: true } },
      },
    }),
    tx.enterpriseSalesOrder.count({ where }),
    tx.enterpriseSalesOrder.groupBy({ by: ["currency", "status"], where, _sum: { subtotalAmount: true, discountAmount: true, taxAmount: true, totalAmount: true }, _count: { _all: true } }),
    tx.enterpriseSalesOrder.groupBy({ by: ["currency", "status"], where: base, _sum: { subtotalAmount: true, discountAmount: true, taxAmount: true, totalAmount: true }, _count: { _all: true } }),
    ]);
    return { items, total, filteredGroups, generalGroups };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const confirmed = commercialStatusCount(filteredGroups, ["CONFIRMED"]);
  const partial = commercialStatusCount(filteredGroups, ["PARTIALLY_FULFILLED"]);
  const fulfilled = commercialStatusCount(filteredGroups, ["FULFILLED"]);
  const pending = commercialStatusCount(filteredGroups, ["DRAFT", "PENDING_APPROVAL"]);
  const generalMetrics = { confirmed: commercialStatusCount(generalGroups, ["CONFIRMED"]), partial: commercialStatusCount(generalGroups, ["PARTIALLY_FULFILLED"]), fulfilled: commercialStatusCount(generalGroups, ["FULFILLED"]), pending: commercialStatusCount(generalGroups, ["DRAFT", "PENDING_APPROVAL"]) };
  const partyIds = [...new Set(items.map((item) => item.businessPartyId))];
  const parties = partyIds.length
    ? await prisma.enterpriseBusinessParty.findMany({
        where: { organizationId, id: { in: partyIds }, archivedAt: null },
        select: { id: true, code: true, legalName: true, displayName: true },
      })
    : [];
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const projectedItems = items.map((item) => ({
    ...item,
    businessParty: partyById.get(item.businessPartyId) || null,
  }));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "sales-orders", page } });
  return NextResponse.json({
    items: projectedItems,
    filteredTotals: commercialAmountTotals(filteredGroups),
    generalTotals: commercialAmountTotals(generalGroups),
    pageTotals: commercialPageTotals(items),
    generalMetrics,
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    metrics: { confirmed, partial, fulfilled, pending },
    canManage: access.canManage,
    canWrite: access.canWrite,
  });
}
