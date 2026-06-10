import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyCash, type PharmacyCashAction } from "@/lib/pharmacy-cash-access";
import { cashCreateSchema } from "@/lib/pharmacy-cash-validators";
import { createPayment, createRefund, getCashDataset, openCashSession } from "@/lib/pharmacy-cash";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyCash(session.userId, organizationId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dataset = await getCashDataset(organizationId);
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(request, `pharmacy-cash:${session.userId}`), 120, 3600000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests", message: "Trop d'actions de caisse sur une courte période." }, { status: 429 });
  const { organizationId } = await params;
  const parsed = cashCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Données de caisse invalides." }, { status: 400 });
  const action: PharmacyCashAction = parsed.data.entityType === "session" ? "open" : parsed.data.entityType === "payment" ? "pay" : "refund";
  if (!(await canAccessPharmacyCash(session.userId, organizationId, action))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const record = parsed.data.entityType === "session"
      ? await openCashSession(organizationId, session.userId, parsed.data)
      : parsed.data.entityType === "payment"
        ? await createPayment(organizationId, session.userId, parsed.data)
        : await createRefund(organizationId, session.userId, parsed.data);
    await writeAuditLog({ userId: session.userId, action: `PHARMACY_CASH_${parsed.data.entityType.toUpperCase()}_CREATED`, entity: parsed.data.entityType, entityId: record.id, request, metadata: { organizationId } });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const messages: Record<string, string> = { CASHIER_NOT_FOUND: "Le caissier n'appartient pas à cette pharmacie.", DEPARTMENT_NOT_FOUND: "Le département n'appartient pas à cette pharmacie.", CASHIER_ALREADY_OPEN: "Ce caissier possède déjà une session ouverte.", SALE_NOT_FOUND: "La vente sélectionnée est introuvable.", INVOICE_NOT_FOUND: "La facture sélectionnée est introuvable.", SALE_INVOICE_MISMATCH: "La facture et la vente sélectionnées ne correspondent pas.", PAYMENT_NOT_FOUND: "Le paiement sélectionné est introuvable.", SESSION_REQUIRED: "Une session ouverte est obligatoire pour cet encaissement.", SESSION_NOT_OPEN: "La session de caisse sélectionnée n'est pas ouverte.", PAYMENT_EXCEEDS_REMAINING: "Le paiement dépasse le reste à payer.", REFUND_EXCEEDS_PAID: "Le remboursement dépasse le montant réellement payé.", RESTOCK_REQUIRES_FULL_REFUND: "La remise en stock complète exige un remboursement total de la vente." };
    return NextResponse.json({ error: duplicate ? "Duplicate" : code, message: duplicate ? "Ce numéro existe déjà dans cette pharmacie." : messages[code] || "Action de caisse impossible." }, { status: duplicate ? 409 : 400 });
  }
}
