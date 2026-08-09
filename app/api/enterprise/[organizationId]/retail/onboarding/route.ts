import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { getRetailSelfServiceOnboarding, saveRetailSelfServiceOnboarding } from "@/lib/enterprise/retail/self-service-onboarding";

const onboardingSchema = z.object({
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional().nullable(),
  currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional().nullable(),
  siteId: z.string().trim().min(1).max(240).optional().nullable(),
  warehouseId: z.string().trim().min(1).max(240).optional().nullable(),
  cashFinancialAccountId: z.string().trim().min(1).max(240).optional().nullable(),
  revision: z.coerce.number().int().positive().optional().nullable(),
});

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "read");
  if (!auth.ok) return auth.response;
  try {
    const state = await getRetailSelfServiceOnboarding(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-self-service-onboarding" } });
    return NextResponse.json(state);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_ONBOARDING_LOAD_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true, limit: 90 });
  if (!auth.ok) return auth.response;
  const parsed = onboardingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Sélection d’onboarding invalide." }, { status: 400 });
  try {
    const result = await saveRetailSelfServiceOnboarding({ organizationId, actorUserId: auth.session.userId, selection: parsed.data });
    await writeAuditLog({
      userId: auth.session.userId,
      action: "ENTERPRISE_RETAIL_SELF_SERVICE_ONBOARDING_UPDATED",
      entity: "EnterpriseRetailOnboardingRun",
      entityId: result.run.id,
      metadata: { organizationId, status: result.run.status, currentStep: result.run.currentStep, ready: result.readiness.ready },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-self-service-onboarding", status: result.run.status } });
    return NextResponse.json(result);
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_ONBOARDING_SAVE_FAILED");
  }
}
