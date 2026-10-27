import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import { attestRelationshipDelivery } from "@/lib/enterprise/relationship-benefits/delivery";
import {
  authorizeRelationshipBenefitsRequest,
  relationshipBenefitErrorResponse,
} from "@/lib/enterprise/relationship-benefits/http";

type Params = { params: Promise<{ organizationId: string; usageId: string }> };

const deliveryAttestationSchema = z.object({
  revision: z.number().int().positive(),
  fulfillmentReference: z.string().trim().min(3).max(160),
}).strict();

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, usageId } = await params;
  const auth = await authorizeRelationshipBenefitsRequest(req, organizationId, "manage", {
    mutation: true, limit: 80,
  });
  if (!auth.ok) return auth.response;
  // A user who can maintain relationship benefits is not thereby allowed to
  // attest an ERP sale or delivery: both independent permissions are required.
  const salesAccess = await getEnterpriseCommonDomainAccess({
    session: auth.session, organizationId, moduleCode: "SALES_QUOTES_ORDERS", action: "write",
  });
  if (!salesAccess) {
    return NextResponse.json({
      error: "RELATIONSHIP_DELIVERY_SALES_PERMISSION_REQUIRED",
      message: "Vous devez également disposer du droit de gestion des commandes et livraisons.",
    }, { status: 403 });
  }
  const parsed = deliveryAttestationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: "RELATIONSHIP_DELIVERY_INPUT_INVALID",
      message: parsed.error.issues[0]?.message || "La référence de livraison est invalide.",
    }, { status: 400 });
  }
  try {
    const result = await attestRelationshipDelivery({
      organizationId, usageId, actorUserId: auth.session.userId, ...parsed.data,
    });
    await writeAuditLog({
      userId: auth.session.userId, action: "ENTERPRISE_RELATIONSHIP_DELIVERY_ATTESTED",
      entity: "EnterpriseRelationshipBenefitUsage", entityId: usageId, request: req,
      metadata: { organizationId, replayed: result.replayed },
    });
    await writeApiLog({
      request: req, statusCode: 200, startedAt, userId: auth.session.userId,
      metadata: { organizationId, domain: "relationship-benefits", action: "delivery-attestation" },
    });
    return NextResponse.json({
      ok: true, usage: result.usage,
      message: result.replayed ? "Cette livraison était déjà attestée." : "Livraison vérifiée et avantage enregistré comme utilisé.",
    });
  } catch (error) {
    const response = relationshipBenefitErrorResponse(error);
    await writeApiLog({
      request: req, statusCode: response.status, startedAt, userId: auth.session.userId,
      metadata: { organizationId, domain: "relationship-benefits", action: "delivery-attestation-failed" },
    });
    return response;
  }
}
