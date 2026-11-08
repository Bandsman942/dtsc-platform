import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enterpriseValidationErrorResponse } from "@/lib/enterprise/common/http";
import { EnterpriseRetailError } from "@/lib/enterprise/retail/errors";
import { changeRetailFeatureActivation, getRetailFeatureActivation, RETAIL_ACTIVATION_FEATURES } from "@/lib/enterprise/retail/feature-activation";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ organizationId: string }> };

const inputSchema = z.object({
  feature: z.enum(RETAIL_ACTIVATION_FEATURES),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
  reason: z.string().trim().min(8).max(500),
}).strict();

async function authorizeOwner(req: Request, organizationId: string, mutation: boolean) {
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", mutation ? "manage" : "read",
    mutation ? { mutation: true, limit: 15 } : undefined);
  if (!auth.ok) return auth;
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: auth.session.userId, status: "ACTIVE", removedAt: null,
      role: { in: [...RETAIL_OWNER_ROLES] } },
    select: { id: true },
  });
  if (!member) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return auth;
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeOwner(req, organizationId, false);
  if (!auth.ok) return auth.response;
  const rawPage = new URL(req.url).searchParams.get("page") || "1";
  if (!/^\d{1,5}$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 10000) {
    return NextResponse.json({ error: "RETAIL_FEATURE_HISTORY_PAGE_INVALID" }, { status: 400 });
  }
  try {
    const result = await getRetailFeatureActivation(organizationId, Number(rawPage));
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-feature-activation", action: "read" } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_FEATURE_ACTIVATION_READ_FAILED");
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeOwner(req, organizationId, true);
  if (!auth.ok) return auth.response;
  // The canonical five-minute password + TOTP/recovery-code step-up is bound
  // to this session and organization. It never substitutes for Retail RBAC.
  if (!(await hasRecentStepUp(auth.session))) {
    await writeAuditLog({ userId: auth.session.userId, organizationId, action: "AUTH_CRITICAL_MUTATION_STEPUP_DENIED",
      entity: "EnterpriseRetailConfiguration", entityId: organizationId, request: req,
      result: "DENIED", riskLevel: "CRITICAL", reasonCode: "STEP_UP_REQUIRED",
      metadata: { organizationId, action: "RETAIL_FEATURE_ACTIVATION" } });
    return NextResponse.json({ error: "Confirmez récemment votre identité avant d'activer ou désactiver le Retail.",
      reasonCode: "STEP_UP_REQUIRED" }, { status: 428, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return enterpriseValidationErrorResponse(parsed.error, "RETAIL_FEATURE_ACTIVATION_INPUT_INVALID", req);
  try {
    const result = await changeRetailFeatureActivation({ organizationId, actorUserId: auth.session.userId, ...parsed.data });
    await writeApiLog({ request: req, startedAt, statusCode: 200, userId: auth.session.userId,
      metadata: { organizationId, domain: "retail-feature-activation", feature: parsed.data.feature, enabled: parsed.data.enabled } });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return retailErrorResponse(new EnterpriseRetailError("RETAIL_FEATURE_ACTIVATION_CONFLICT", 409));
    }
    return retailErrorResponse(error, "RETAIL_FEATURE_ACTIVATION_UPDATE_FAILED");
  }
}
