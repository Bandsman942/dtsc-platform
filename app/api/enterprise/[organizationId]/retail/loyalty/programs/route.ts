import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { listRetailLoyaltyPrograms, upsertRetailLoyaltyProgram } from "@/lib/enterprise/retail/customer-payments";
import { retailLoyaltyProgramUpsertSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const items = await listRetailLoyaltyPrograms(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-loyalty", action: "list-programs", count: items.length } });
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canManageLoyalty) return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas d’administrer la fidélité." }, { status: 403 });
  const parsed = retailLoyaltyProgramUpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Programme de fidélité invalide." }, { status: 400 });
  try {
    const program = await upsertRetailLoyaltyProgram(organizationId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_LOYALTY_PROGRAM_UPSERTED", entity: "EnterpriseRetailLoyaltyProgram", entityId: program.id, request: req, metadata: { organizationId, code: program.code, status: program.status, currencyCode: program.currencyCode } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-loyalty", action: "upsert-program" } });
    return NextResponse.json({ ok: true, program });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_LOYALTY_PROGRAM_SAVE_FAILED");
  }
}
