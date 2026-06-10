import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyPurchases } from "@/lib/pharmacy-purchase-access";
import { purchaseCreateSchema } from "@/lib/pharmacy-purchase-validators";
import { createPurchaseEntity, getPurchasesDataset, validatePurchaseReferences } from "@/lib/pharmacy-purchases";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyPurchases(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getPurchasesDataset(organizationId);
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-purchases:${session.userId}`), 100, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions achats sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyPurchases(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = purchaseCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Données achats invalides." }, { status: 400 });
  const referenceError = await validatePurchaseReferences(organizationId, parsed.data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  try {
    const record = await createPurchaseEntity(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_PURCHASE_${parsed.data.entityType.toUpperCase().replaceAll("-", "_")}_CREATED`, entity: parsed.data.entityType, entityId: record.id, request, metadata: { organizationId } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Duplicate" : "Creation failed", message: duplicate ? "Ce code, numéro ou association existe déjà dans cette pharmacie." : "Création impossible." }, { status: duplicate ? 409 : 400 });
  }
}
