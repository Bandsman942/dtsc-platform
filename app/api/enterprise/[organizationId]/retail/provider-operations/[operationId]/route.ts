import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { transitionRetailProviderOperation } from "@/lib/enterprise/retail/customer-payments";
import { retailProviderOperationTransitionSchema } from "@/lib/enterprise/retail/customer-payments-schemas";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { finalizeConfirmedRetailOperatorOperation } from "@/lib/enterprise/retail/operator-orchestration";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string; operationId: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, operationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 300 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  const parsed = retailProviderOperationTransitionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Transition provider invalide." }, { status: 400 });
  const reconciliation = parsed.data.status === "RECONCILED" || parsed.data.reconciled;
  if ((reconciliation && !permissions.canReconcileProviders) || (!reconciliation && !permissions.canManageProviders)) {
    return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas cette transition provider." }, { status: 403 });
  }
  try {
    const operation = await transitionRetailProviderOperation(organizationId, operationId, parsed.data);
    const finalized = operation.status === "CONFIRMED"
      ? await finalizeConfirmedRetailOperatorOperation(organizationId, operation.id)
      : null;
    await writeAuditLog({ userId: auth.session.userId, action: `ENTERPRISE_RETAIL_PROVIDER_OPERATION_${operation.status}`, entity: "EnterpriseRetailProviderOperation", entityId: operation.id, request: req, metadata: { organizationId, providerId: operation.providerId, status: operation.status, externalReference: operation.externalReference, revision: operation.revision, businessEffectFinalized: Boolean(finalized) } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-provider-operations", action: "transition", status: operation.status, businessEffectFinalized: Boolean(finalized) } });
    return NextResponse.json({ ok: true, operation, finalized });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_OPERATION_TRANSITION_FAILED");
  }
}
