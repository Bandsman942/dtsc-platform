import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getHealthMedicalRecordAccess } from "@/lib/health-medical-record-access";
import { healthMedicalRecordItemActionSchema, healthMedicalRecordItemSchema } from "@/lib/health-medical-record-validators";
import { createHealthMedicalRecordItem, transitionHealthMedicalRecordItem } from "@/lib/health-medical-records";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string; recordId: string }> };

async function context(req: Request, params: Params["params"]) {
  if (!isSameOriginRequest(req)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const limited = await rateLimit(getRateLimitKey(req, `health-medical-record-items:${session.userId}`), 160, 60 * 60 * 1000);
  if (!limited.ok) return { response: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  const { organizationId, recordId } = await params;
  const access = await getHealthMedicalRecordAccess({ session, organizationId, action: "write" });
  if (!access?.canManageStructuredItems) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, organizationId, recordId, access };
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await context(req, params);
  if (ctx.response) return ctx.response;
  const parsed = healthMedicalRecordItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "L’élément médical est incomplet ou invalide." }, { status: 400 });
  if (parsed.data.entity === "confidential_note" && !ctx.access.canManageConfidentialNotes) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const item = await createHealthMedicalRecordItem(ctx.organizationId, ctx.recordId, ctx.session.userId, parsed.data);
    await writeAuditLog({ userId: ctx.session.userId, action: `HEALTH_MEDICAL_RECORD_${parsed.data.entity.toUpperCase()}_CREATED`, entity: "HealthMedicalRecord", entityId: ctx.recordId, request: req, metadata: { organizationId: ctx.organizationId } });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Create failed", message: "Ajout impossible dans ce dossier médical." }, { status: 409 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await context(req, params);
  if (ctx.response) return ctx.response;
  const parsed = healthMedicalRecordItemActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  try {
    await transitionHealthMedicalRecordItem(ctx.organizationId, ctx.recordId, ctx.session.userId, parsed.data.entity, parsed.data.itemId, parsed.data.action, parsed.data.reason);
    await writeAuditLog({ userId: ctx.session.userId, action: `HEALTH_MEDICAL_RECORD_ITEM_${parsed.data.action.toUpperCase()}`, entity: "HealthMedicalRecord", entityId: ctx.recordId, request: req, metadata: { organizationId: ctx.organizationId, itemId: parsed.data.itemId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Action failed", message: "Action impossible sur cet élément médical." }, { status: 409 });
  }
}
