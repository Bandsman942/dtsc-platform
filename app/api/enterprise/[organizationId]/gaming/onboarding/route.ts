import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { ENTERPRISE_ADMIN_ROLES } from "@/lib/enterprise-sector-templates";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { getEnterpriseGamingDashboardAccess } from "@/lib/enterprise/gaming/access";
import {
  gamingOnboardingSelectionSchema,
  getGamingSelfServiceOnboarding,
  saveGamingSelfServiceOnboarding,
} from "@/lib/enterprise/gaming/onboarding";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

function forbidden() {
  return NextResponse.json({
    error: "GAMING_ONBOARDING_ADMIN_REQUIRED",
    message: "Seul un administrateur de l’entreprise peut gérer la mise en service Gaming Lounge.",
  }, { status: 403 });
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { organizationId } = await params;
  const access = await getEnterpriseGamingDashboardAccess({ session, organizationId, action: "manage" });
  if (!access || !ENTERPRISE_ADMIN_ROLES.has(session.role)) return forbidden();
  try {
    const state = await getGamingSelfServiceOnboarding(organizationId);
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-onboarding", action: "read" } });
    return NextResponse.json(state);
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "GAMING_ONBOARDING_READ_FAILED", req);
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-gaming-onboarding:${session.userId}`), 60, 3_600_000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { organizationId } = await params;
  const access = await getEnterpriseGamingDashboardAccess({ session, organizationId, action: "manage" });
  if (!access || !ENTERPRISE_ADMIN_ROLES.has(session.role)) return forbidden();
  const parsed = gamingOnboardingSelectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-onboarding", action: "invalid" } });
    return NextResponse.json({ error: "GAMING_ONBOARDING_INVALID", message: parsed.error.issues[0]?.message || "Configuration Gaming invalide." }, { status: 400 });
  }
  try {
    const state = await saveGamingSelfServiceOnboarding({ organizationId, actorUserId: session.userId, selection: parsed.data });
    await Promise.allSettled([
      writeAuditLog({
        userId: session.userId,
        action: "ENTERPRISE_GAMING_SELF_SERVICE_ONBOARDING_UPDATED",
        entity: "EnterpriseGamingConfiguration",
        entityId: organizationId,
        request: req,
        metadata: { organizationId, ready: state.readiness.ready, currentStep: state.readiness.currentStep, completed: state.readiness.completed, total: state.readiness.total },
      }),
      writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId, domain: "gaming-onboarding", action: "update" } }),
    ]);
    return NextResponse.json(state);
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "GAMING_ONBOARDING_UPDATE_FAILED", req);
  }
}
