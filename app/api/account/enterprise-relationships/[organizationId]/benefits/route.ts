import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { relationshipBenefitUsageCancelSchema, relationshipBenefitUsageSchema } from "@/lib/enterprise/relationship-benefits/contracts";
import { requireIdentityLinkSession } from "@/lib/enterprise/identity-links/http";
import {
  cancelRelationshipBenefitUsageByUser,
  createRelationshipBenefitUsage,
  EnterpriseRelationshipBenefitError,
  resolveEnterpriseRelationshipBenefits,
} from "@/lib/enterprise/relationship-benefits/service";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ organizationId: string }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  let userId: string | undefined;

  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const url = new URL(req.url);
    const identityLinkId = url.searchParams.get("identityLinkId");
    const result = await resolveEnterpriseRelationshipBenefits({
      userId: session.userId,
      organizationId,
      identityLinkId,
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId,
      startedAt,
      metadata: {
        organizationId,
        domain: "relationship-benefits-account",
        action: "resolve",
        itemCount: result.items.length,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof EnterpriseRelationshipBenefitError ? error.status : 500;
    await writeApiLog({
      request: req,
      statusCode: status,
      userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits-account", action: "resolve-failed" },
    });
    return NextResponse.json(
      {
        error: "RELATIONSHIP_BENEFIT_RESOLVE_FAILED",
        message: error instanceof Error ? error.message : "Les avantages n’ont pas pu être chargés.",
      },
      { status },
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  let userId: string | undefined;

  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `relationship-benefit-use:${organizationId}:${session.userId}`),
      60,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests", message: "Trop de demandes sur une courte période. Réessayez plus tard." },
        { status: 429 },
      );
    }

    const parsed = relationshipBenefitUsageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "RELATIONSHIP_BENEFIT_USAGE_INPUT_INVALID",
          message: parsed.error.issues[0]?.message || "La demande est invalide.",
        },
        { status: 400 },
      );
    }

    const usage = await createRelationshipBenefitUsage({
      organizationId,
      userId: session.userId,
      ...parsed.data,
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_RELATIONSHIP_BENEFIT_REQUESTED",
      entity: "EnterpriseRelationshipBenefitUsage",
      entityId: usage.id,
      request: req,
      metadata: {
        organizationId,
        benefitId: parsed.data.benefitId,
        identityLinkId: parsed.data.identityLinkId,
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 201,
      userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits-account", action: "request" },
    });
    return NextResponse.json(
      { ok: true, usage, message: "Votre demande a été transmise à l’entreprise." },
      { status: 201 },
    );
  } catch (error) {
    const status = error instanceof EnterpriseRelationshipBenefitError ? error.status : 500;
    await writeApiLog({
      request: req,
      statusCode: status,
      userId,
      startedAt,
      metadata: { organizationId, domain: "relationship-benefits-account", action: "request-failed" },
    });
    return NextResponse.json(
      {
        error:
          error instanceof EnterpriseRelationshipBenefitError
            ? error.code
            : "RELATIONSHIP_BENEFIT_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "La demande n’a pas pu être envoyée.",
      },
      { status },
    );
  }
}


export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  let userId: string | undefined;

  try {
    const session = await requireIdentityLinkSession(req);
    userId = session.userId;
    const limited = await rateLimit(
      getRateLimitKey(req, `relationship-benefit-cancel:${organizationId}:${session.userId}`),
      60,
      60 * 60 * 1000,
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests", message: "Trop d’annulations sur une courte période. Réessayez plus tard." },
        { status: 429 },
      );
    }

    const parsed = relationshipBenefitUsageCancelSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "RELATIONSHIP_BENEFIT_CANCEL_INPUT_INVALID",
          message: parsed.error.issues[0]?.message || "La demande d’annulation est invalide.",
        },
        { status: 400 },
      );
    }

    const usage = await cancelRelationshipBenefitUsageByUser({
      organizationId,
      userId: session.userId,
      ...parsed.data,
    });
    await writeAuditLog({
      userId: session.userId,
      action: "ENTERPRISE_RELATIONSHIP_BENEFIT_CANCELLED_BY_USER",
      entity: "EnterpriseRelationshipBenefitUsage",
      entityId: parsed.data.usageId,
      request: req,
      metadata: {
        organizationId,
        identityLinkId: parsed.data.identityLinkId,
        status: usage?.status || "CANCELLED",
      },
    });
    await writeApiLog({
      request: req,
      statusCode: 200,
      userId,
      startedAt,
      metadata: {
        organizationId,
        domain: "relationship-benefits-account",
        action: "cancel",
      },
    });
    return NextResponse.json({
      ok: true,
      usage,
      message: "Votre demande d’avantage a été annulée.",
    });
  } catch (error) {
    const status = error instanceof EnterpriseRelationshipBenefitError ? error.status : 500;
    await writeApiLog({
      request: req,
      statusCode: status,
      userId,
      startedAt,
      metadata: {
        organizationId,
        domain: "relationship-benefits-account",
        action: "cancel-failed",
      },
    });
    return NextResponse.json(
      {
        error:
          error instanceof EnterpriseRelationshipBenefitError
            ? error.code
            : "RELATIONSHIP_BENEFIT_CANCEL_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "La demande d’avantage n’a pas pu être annulée.",
      },
      { status },
    );
  }
}
