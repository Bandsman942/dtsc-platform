import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessPharmacyBatches } from "@/lib/pharmacy-batch-access";
import { getSellableBatchesForProduct } from "@/lib/pharmacy-batches";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string; productId: string }> };
export async function GET(req: Request, { params }: Params) {
  void req;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId, productId } = await params;
  if (!(await canAccessPharmacyBatches(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const product = await prisma.pharmacyProduct.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ batches: await getSellableBatchesForProduct(organizationId, productId) });
}
