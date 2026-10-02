import { z } from "zod";
import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { deactivateManualAccountMapping, updateManualAccountMapping } from "@/lib/enterprise/accounting/account-mapping-service";
import { authorizeFinanceRequest, financeErrorResponse, financeValidationErrorResponse } from "@/lib/enterprise/accounting/http";
import { accountMappingUpdateSchema, revisionSchema } from "@/lib/enterprise/accounting/schemas";

type Params = { params: Promise<{ organizationId: string; mappingId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, mappingId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 30 });
  if (!auth.ok) return auth.response;
  const parsed = accountMappingUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "ACCOUNT_MAPPING_INPUT_INVALID");
  try {
    const mapping = await updateManualAccountMapping(organizationId, mappingId, auth.session.userId, parsed.data);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_ACCOUNT_MAPPING_UPDATED", entity: "EnterpriseAccountMapping", entityId: mapping.id, request: req, metadata: { organizationId, ledgerAccountId: mapping.ledgerAccountId, active: mapping.isActive } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, mappingId, domain: "account-mappings" } });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_MAPPING_UPDATE_FAILED");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, mappingId } = await params;
  const auth = await authorizeFinanceRequest(req, organizationId, "FINANCE_ACCOUNTING", "manage", { mutation: true, limit: 20 });
  if (!auth.ok) return auth.response;
  const parsed = z.object({ revision: revisionSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return financeValidationErrorResponse(parsed.error, "ACCOUNT_MAPPING_REVISION_INVALID");
  try {
    const mapping = await deactivateManualAccountMapping(organizationId, mappingId, auth.session.userId, parsed.data.revision);
    await writeAuditLog({ userId: auth.session.userId, action: "ENTERPRISE_ACCOUNT_MAPPING_DEACTIVATED", entity: "EnterpriseAccountMapping", entityId: mapping.id, request: req, metadata: { organizationId, mappingKey: mapping.mappingKey } });
    await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { organizationId, mappingId, domain: "account-mappings" } });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return financeErrorResponse(error, "ACCOUNT_MAPPING_DEACTIVATE_FAILED");
  }
}
