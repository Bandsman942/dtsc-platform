import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { canAccessPharmacyPrescriptions } from "@/lib/pharmacy-prescription-access";
import { pharmacyPrescriptionSchema } from "@/lib/pharmacy-prescription-validators";
import {
  createPharmacyPrescription,
  getPharmacyPrescriptionsDataset,
  validatePrescriptionReferences,
} from "@/lib/pharmacy-prescriptions";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  if (!(await canAccessPharmacyPrescriptions(session.userId, organizationId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dataset = await getPharmacyPrescriptionsDataset(organizationId);
  await writeApiLog({ request, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json(dataset);
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(
    getRateLimitKey(request, `pharmacy-prescriptions:${session.userId}`),
    80,
    3600000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests", message: "Trop d'actions sur les ordonnances." },
      { status: 429 },
    );
  }
  const { organizationId } = await params;
  if (!(await canAccessPharmacyPrescriptions(session.userId, organizationId, "create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = pharmacyPrescriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", message: parsed.error.issues[0]?.message || "Ordonnance invalide." },
      { status: 400 },
    );
  }
  const referenceError = await validatePrescriptionReferences(organizationId, parsed.data);
  if (referenceError) {
    return NextResponse.json({ error: "Invalid reference", message: referenceError }, { status: 400 });
  }
  try {
    const prescription = await createPharmacyPrescription(organizationId, session.userId, parsed.data);
    await writeAuditLog({
      userId: session.userId,
      action: "PHARMACY_PRESCRIPTION_CREATED",
      entity: "PharmacyPrescription",
      entityId: prescription.id,
      request,
      metadata: { organizationId },
    });
    await writeApiLog({ request, statusCode: 201, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, prescription }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Unique constraint")
      ? "Ce numéro d'ordonnance existe déjà dans cette pharmacie."
      : "L'ordonnance n'a pas pu être enregistrée.";
    return NextResponse.json({ error: "Creation failed", message }, { status: 400 });
  }
}
