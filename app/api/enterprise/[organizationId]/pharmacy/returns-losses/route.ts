import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReturnLoss } from "@/lib/pharmacy-return-loss-access";
import { returnLossEventSchema } from "@/lib/pharmacy-return-loss-validators";
import { createReturnLossEvent, getReturnLossDataset, validateReturnLossReferences } from "@/lib/pharmacy-return-losses";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now(); const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyReturnLoss(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getReturnLossDataset(organizationId);
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-return-loss:${session.userId}`), 100, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions retours et pertes." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyReturnLoss(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = returnLossEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Déclaration invalide." }, { status: 400 });
  const referenceError = await validateReturnLossReferences(organizationId, parsed.data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  try {
    const record = await createReturnLossEvent(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_RETURN_LOSS_CREATED", entity: "PharmacyReturnLossEvent", entityId: record.id, request, metadata: { organizationId, eventType: parsed.data.eventType } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Duplicate" : "Creation failed", message: duplicate ? "Ce numéro existe déjà dans cette pharmacie." : "Création impossible." }, { status: duplicate ? 409 : 400 });
  }
}
