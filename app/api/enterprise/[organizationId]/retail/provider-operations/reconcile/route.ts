import { NextResponse } from "next/server";
import { z } from "zod";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeRetailRequest, retailErrorResponse } from "@/lib/enterprise/retail/http";
import { reconcileRetailProviderOperations } from "@/lib/enterprise/retail/operator-orchestration";
import { getRetailCustomerPaymentPermissions } from "@/lib/enterprise/retail/permissions";

type Params = { params: Promise<{ organizationId: string }> };

const reconciliationSchema = z.object({
  operationId: z.string().trim().min(1).max(240).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const auth = await authorizeRetailRequest(req, organizationId, "RETAIL_POS", "manage", { mutation: true, limit: 120 });
  if (!auth.ok) return auth.response;
  const permissions = await getRetailCustomerPaymentPermissions(auth.session.userId, organizationId);
  if (!permissions.canReconcileProviders) {
    return NextResponse.json({ error: "Forbidden", message: "Votre fonction ne permet pas le rapprochement des opérations provider." }, { status: 403 });
  }
  const parsed = reconciliationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Demande de rapprochement invalide." }, { status: 400 });
  try {
    const results = await reconcileRetailProviderOperations(organizationId, parsed.data.operationId, parsed.data.limit);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_RETAIL_PROVIDER_RECONCILIATION_RUN", entity: "EnterpriseRetailProviderOperation", entityId: parsed.data.operationId || organizationId, request: req, metadata: { organizationId, operationId: parsed.data.operationId || null, resultCount: results.length, finalizedCount: results.filter((item) => item.finalized).length } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, domain: "retail-provider-operations", action: "reconcile", resultCount: results.length } });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return retailErrorResponse(error, "RETAIL_PROVIDER_RECONCILIATION_FAILED");
  }
}
