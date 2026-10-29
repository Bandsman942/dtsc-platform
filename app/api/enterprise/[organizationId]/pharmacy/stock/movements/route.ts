import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { canAccessPharmacyStock } from "@/lib/pharmacy-stock-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };
const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function positiveInt(value: string | null, defaultValue: number, maximum: number) {
  if (!value || !/^[0-9]+$/.test(value)) return defaultValue;
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(Math.max(1, number), maximum) : defaultValue;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId } = await params;
  if (!(await canAccessPharmacyStock(session.userId, organizationId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = positiveInt(url.searchParams.get("page"), 1, 100_000);
  const pageSize = positiveInt(url.searchParams.get("pageSize"), PAGE_SIZE, MAX_PAGE_SIZE);
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length > 80) {
    return NextResponse.json({ error: "PHARMACY_STOCK_SEARCH_TOO_LONG" }, { status: 400 });
  }

  const where: Prisma.PharmacyStockMovementWhereInput = { organizationId };
  if (query) {
    where.OR = [
      { product: { name: { contains: query, mode: "insensitive" } } },
      { batch: { is: { batchNumber: { contains: query, mode: "insensitive" } } } },
      { reason: { contains: query, mode: "insensitive" } },
    ];
  }

  const [total, totalUnfilteredCount, movements] = await Promise.all([
    prisma.pharmacyStockMovement.count({ where }),
    query ? prisma.pharmacyStockMovement.count({ where: { organizationId } }) : Promise.resolve(null),
    prisma.pharmacyStockMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, movementType: true, direction: true,
        quantity: true, quantityBefore: true, quantityAfter: true,
        reason: true, createdAt: true,
        product: { select: { name: true } },
        batch: { select: { batchNumber: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);
  const totalUnfiltered = totalUnfilteredCount ?? total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(
    { movements, pagination: { page, pageSize, pageCount, total, totalUnfiltered } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
