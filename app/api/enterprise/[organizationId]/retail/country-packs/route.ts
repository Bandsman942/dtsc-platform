import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { activateRetailCountryPack, getRetailCountryPackState } from "@/lib/enterprise/retail/country-packs";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";

const activationSchema = z.object({
  packCode: z.string().trim().min(3).max(80),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  configuration: z.record(z.string(), z.unknown()).optional().nullable(),
  evidence: z.record(z.string(), z.unknown()).optional().nullable(),
});

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  const state = await getRetailCountryPackState(organizationId);
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-country-packs" } });
  return NextResponse.json(state);
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, rateLimitAction: "country-pack" });
  if (!auth.ok) return auth.response;
  const parsed = activationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Configuration country pack invalide." }, { status: 400 });
  try {
    const activation = await activateRetailCountryPack({
      organizationId,
      actorUserId: auth.session.userId,
      packCode: parsed.data.packCode,
      countryCode: parsed.data.countryCode,
      configuration: parsed.data.configuration || null,
      evidence: parsed.data.evidence || null,
    });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_COUNTRY_PACK_ACTIVATED",
      entity: "EnterpriseRetailCountryPackActivation",
      entityId: activation.id,
      metadata: { organizationId, packCode: activation.packCode, countryCode: activation.countryCode, status: activation.status },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-country-packs", packCode: activation.packCode } });
    return NextResponse.json({ activation });
  } catch (error) {
    return retailErrorResponse(error, { request: req, startedAt, userId: auth.session.userId, metadata: { organizationId, domain: "retail-country-packs" } });
  }
}
