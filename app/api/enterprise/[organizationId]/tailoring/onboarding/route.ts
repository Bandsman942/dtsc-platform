import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { ENTERPRISE_ADMIN_ROLES } from "@/lib/enterprise-sector-templates";
import { authorizeTailoringRequest, tailoringErrorResponse } from "@/lib/enterprise/tailoring/http";
import {
  getTailoringSelfServiceOnboarding,
  saveTailoringSelfServiceOnboarding,
  tailoringOnboardingSelectionSchema,
} from "@/lib/enterprise/tailoring/onboarding";

type Params = { params: Promise<{ organizationId: string }> };

function forbidden() {
  return NextResponse.json({
    error: "TAILORING_ONBOARDING_ADMIN_REQUIRED",
    message: "Seul un administrateur de l’entreprise peut gérer la mise en service Couture.",
  }, { status: 403 });
}

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const authorization = await authorizeTailoringRequest({
    request,
    organizationId,
    moduleCode: "TAILORING_OVERVIEW",
    action: "manage",
  });
  if (!authorization.ok) return authorization.response;
  if (!ENTERPRISE_ADMIN_ROLES.has(authorization.session.role)) return forbidden();

  try {
    const state = await getTailoringSelfServiceOnboarding(organizationId);
    await writeApiLog({
      request,
      statusCode: 200,
      userId: authorization.session.userId,
      startedAt,
      metadata: { organizationId, domain: "tailoring", action: "onboarding_read" },
    });
    return NextResponse.json(state);
  } catch (error) {
    return tailoringErrorResponse(error, "TAILORING_ONBOARDING_READ_FAILED");
  }
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const authorization = await authorizeTailoringRequest({
    request,
    organizationId,
    moduleCode: "TAILORING_OVERVIEW",
    action: "manage",
    mutate: true,
  });
  if (!authorization.ok) return authorization.response;
  if (!ENTERPRISE_ADMIN_ROLES.has(authorization.session.role)) return forbidden();

  const parsed = tailoringOnboardingSelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request, statusCode: 400, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "tailoring", action: "onboarding_invalid" } });
    return NextResponse.json({
      error: "TAILORING_ONBOARDING_INVALID",
      message: parsed.error.issues[0]?.message || "Configuration de mise en service invalide.",
    }, { status: 400 });
  }

  try {
    const state = await saveTailoringSelfServiceOnboarding({
      organizationId,
      actorUserId: authorization.session.userId,
      selection: parsed.data,
    });
    await writeAuditLog({
      userId: authorization.session.userId,
      action: "ENTERPRISE_TAILORING_SELF_SERVICE_ONBOARDING_UPDATED",
      entity: "EnterpriseTailoringOnboardingRun",
      entityId: state.latestRun.id,
      request,
      metadata: {
        organizationId,
        status: state.latestRun.status,
        currentStep: state.latestRun.currentStep,
        completed: state.readiness.completed,
        total: state.readiness.total,
      },
    });
    await writeApiLog({ request, statusCode: 200, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "tailoring", action: "onboarding_update" } });
    return NextResponse.json(state);
  } catch (error) {
    return tailoringErrorResponse(error, "TAILORING_ONBOARDING_UPDATE_FAILED");
  }
}
