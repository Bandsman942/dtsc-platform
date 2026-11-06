import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

/** Server-side, tenant-scoped options for the Pharmacy sale form only. */
export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacySales(session.userId, organizationId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "products" && kind !== "batches" && kind !== "prescriptions") {
    return NextResponse.json({ error: "INVALID_REFERENCE_KIND" }, { status: 400 });
  }
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const page = Math.min(10_000, Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = Math.min(25, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));
  const selectedId = (url.searchParams.get("selectedId") || "").slice(0, 80);
  const productId = (url.searchParams.get("productId") || "").slice(0, 80);
  const skip = (page - 1) * pageSize;

  let items: Array<Record<string, unknown>> = [];
  let selected: Record<string, unknown> | null = null;
  let total = 0;

  if (kind === "products") {
    const where: Prisma.PharmacyProductWhereInput = {
      organizationId, status: "ACTIVE",
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { genericName: { contains: q, mode: "insensitive" } },
        { internalCode: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };
    const fields = { id: true, name: true, stockUnit: true, referenceSalePrice: true } as const;
    const [records, count, selectedRecord] = await Promise.all([
      prisma.pharmacyProduct.findMany({ where, select: fields, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: pageSize }),
      prisma.pharmacyProduct.count({ where }),
      selectedId ? prisma.pharmacyProduct.findFirst({ where: { organizationId, status: "ACTIVE", id: selectedId }, select: fields }) : null,
    ]);
    items = records.map((item) => ({ ...item, title: item.name }));
    selected = selectedRecord ? { ...selectedRecord, title: selectedRecord.name } : null;
    total = count;
  } else if (kind === "batches") {
    if (!productId) return NextResponse.json({ items: [], selected: null, page: 1, pageCount: 1, total: 0 });
    const where: Prisma.PharmacyBatchWhereInput = {
      organizationId, productId, availableQuantity: { gt: 0 }, expiryDate: { gt: new Date() },
      recall: false, quarantine: false, status: { in: ["ACTIVE", "NEAR_EXPIRY"] },
      ...(q ? { OR: [
        { batchNumber: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ] } : {}),
    };
    const fields = { id: true, batchNumber: true, availableQuantity: true, expiryDate: true } as const;
    const [records, count, selectedRecord] = await Promise.all([
      prisma.pharmacyBatch.findMany({ where, select: fields, orderBy: [{ expiryDate: "asc" }, { id: "asc" }], skip, take: pageSize }),
      prisma.pharmacyBatch.count({ where }),
      selectedId ? prisma.pharmacyBatch.findFirst({ where: { ...where, id: selectedId, OR: undefined }, select: fields }) : null,
    ]);
    // Batch expiry is a date-only value encoded at UTC midnight in the database.
    const display = (item: typeof records[number]) => ({ ...item, title: `${item.batchNumber} · ${item.availableQuantity} · ${formatEnterpriseBusinessDate(item.expiryDate, "UTC")}` });
    items = records.map(display);
    selected = selectedRecord ? display(selectedRecord) : null;
    total = count;
  } else {
    const where: Prisma.PharmacyPrescriptionWhereInput = {
      organizationId, status: { notIn: ["REJECTED", "ARCHIVED", "CANCELLED"] },
      ...(q ? { prescriptionNumber: { contains: q, mode: "insensitive" } } : {}),
    };
    const fields = { id: true, prescriptionNumber: true } as const;
    const [records, count, selectedRecord] = await Promise.all([
      prisma.pharmacyPrescription.findMany({ where, select: fields, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], skip, take: pageSize }),
      prisma.pharmacyPrescription.count({ where }),
      selectedId ? prisma.pharmacyPrescription.findFirst({ where: { organizationId, status: { notIn: ["REJECTED", "ARCHIVED", "CANCELLED"] }, id: selectedId }, select: fields }) : null,
    ]);
    items = records.map((item) => ({ id: item.id, title: item.prescriptionNumber }));
    selected = selectedRecord ? { id: selectedRecord.id, title: selectedRecord.prescriptionNumber } : null;
    total = count;
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ items, selected, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), total });
}
