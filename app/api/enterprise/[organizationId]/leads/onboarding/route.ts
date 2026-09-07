import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { enterpriseDomainErrorResponse } from "@/lib/enterprise/common/http";
import { createCanonicalLeadOnboarding } from "@/lib/enterprise/crm-sales/canonical-lead-onboarding";
import { leadCanonicalOnboardingSchema } from "@/lib/enterprise/crm-sales/schemas";
import { notifyUser } from "@/lib/notifications";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ organizationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-lead-onboarding:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { organizationId } = await params;
  const access = await getEnterpriseCommonDomainAccess({ session, organizationId, moduleCode: "CRM_PIPELINE", action: "write" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = leadCanonicalOnboardingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Prospection invalide." }, { status: 400 });
  }

  try {
    const result = await createCanonicalLeadOnboarding(organizationId, session.userId, parsed.data);
    await Promise.allSettled([
      ...(parsed.data.lead.ownerUserId && parsed.data.lead.ownerUserId !== session.userId
        ? [notifyUser({
            userId: parsed.data.lead.ownerUserId,
            organizationId,
            type: "ENTERPRISE_CRM",
            title: "Nouvelle prospection affectée",
            body: result.party.displayName || result.party.legalName,
            targetUrl: `/enterprise-modules/CRM_PIPELINE?lead=${encodeURIComponent(result.lead.id)}&section=next-action`,
            idempotencyKey: `lead-assigned:${result.lead.id}`,
          })]
        : []),
      writeAuditLog({
        userId: session.userId,
        action: "ENTERPRISE_CANONICAL_LEAD_CREATED",
        entity: "EnterpriseLead",
        entityId: result.lead.id,
        request: req,
        metadata: { organizationId, businessPartyId: result.party.id, mode: parsed.data.mode },
      }),
      writeApiLog({
        request: req,
        statusCode: 201,
        userId: session.userId,
        startedAt,
        metadata: { organizationId, domain: "lead-onboarding", mode: parsed.data.mode },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      lead: {
        id: result.lead.id,
        reference: result.lead.reference,
        status: result.lead.status,
        businessPartyId: result.party.id,
      },
      party: {
        id: result.party.id,
        code: result.party.code,
        legalName: result.party.legalName,
        displayName: result.party.displayName,
      },
    }, { status: 201 });
  } catch (error) {
    return enterpriseDomainErrorResponse(error, "LEAD_ONBOARDING_FAILED", req);
  }
}
