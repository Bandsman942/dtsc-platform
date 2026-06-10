import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyReceipts } from "@/lib/pharmacy-receipt-access";
import { pharmacyReceiptSchema } from "@/lib/pharmacy-receipt-validators";
import { createPharmacyReceipt, duplicateReceiptMessage, getPharmacyReceiptsDataset, validateReceiptReferences } from "@/lib/pharmacy-receipts";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyReceipts(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getPharmacyReceiptsDataset(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `pharmacy-receipts:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions de réception sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyReceipts(session.userId, organizationId, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = pharmacyReceiptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Réception invalide." }, { status: 400 });
  const referenceError = await validateReceiptReferences(organizationId, parsed.data);
  if (referenceError) return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  try {
    const receipt = await createPharmacyReceipt(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: "PHARMACY_RECEIPT_CREATED", entity: "PharmacyReceipt", entityId: receipt.id, request: req, metadata: { organizationId } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, receipt }, { status: 201 });
  } catch (error) {
    const message = duplicateReceiptMessage(error);
    if (message) return NextResponse.json({ error: "Duplicate receipt", message }, { status: 409 });
    throw error;
  }
}
