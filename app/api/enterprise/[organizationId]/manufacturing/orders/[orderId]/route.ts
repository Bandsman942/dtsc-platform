import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { authorizeManufacturingRequest, manufacturingErrorResponse } from "@/lib/enterprise/manufacturing/http";
import {
  changeProductionOrderLifecycle,
  consumeProductionMaterial,
  decideProductionOrder,
  receiveProductionOutput,
  recordProductionExecution,
  refreshProductionRequirements,
  submitProductionOrder,
} from "@/lib/enterprise/manufacturing/production-service";
import {
  manufacturingExecutionRecordSchema,
  manufacturingMaterialConsumptionSchema,
  manufacturingOrderDecisionSchema,
  manufacturingOrderLifecycleSchema,
  manufacturingOrderSubmitSchema,
  manufacturingOutputReceiptSchema,
} from "@/lib/enterprise/manufacturing/validators";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

type Params = { params: Promise<{ organizationId: string; orderId: string }> };
type OrderAction = "SUBMIT" | "APPROVE" | "REJECT" | "START" | "COMPLETE" | "CANCEL" | "CONSUME_MATERIAL" | "RECEIVE_OUTPUT" | "RECORD_EXECUTION" | "REFRESH_REQUIREMENTS";

function payloadError(message: string) {
  return NextResponse.json({ error: "INVALID_PAYLOAD", message }, { status: 400 });
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId, orderId } = await params;
  const body = await request.json().catch(() => null) as { action?: OrderAction; payload?: unknown } | null;
  if (!body?.action) return payloadError("Une action d’ordre de production est obligatoire.");

  const policy = body.action === "SUBMIT"
    ? { moduleCode: "PRODUCTION_ORDERS" as const, action: "submit" as const }
    : body.action === "APPROVE" || body.action === "REJECT"
      ? { moduleCode: "PRODUCTION_ORDERS" as const, action: "approve" as const }
      : body.action === "CONSUME_MATERIAL" || body.action === "RECEIVE_OUTPUT" || body.action === "RECORD_EXECUTION"
        ? { moduleCode: "PRODUCTION_EXECUTION" as const, action: "write" as const }
        : body.action === "REFRESH_REQUIREMENTS"
          ? { moduleCode: "MATERIAL_REQUIREMENTS" as const, action: "write" as const }
          : { moduleCode: "PRODUCTION_ORDERS" as const, action: "write" as const };

  const authorization = await authorizeManufacturingRequest({ request, organizationId, moduleCode: policy.moduleCode, action: policy.action, mutate: true });
  if (!authorization.ok) return authorization.response;

  const requireLinked = async (moduleCode: string, action: "read" | "write" = "read") => {
    const decision = await resolveEnterpriseModuleAccess({ userId: authorization.session.userId, organizationId, moduleCode, action });
    if (!decision.allowed) throw Object.assign(new Error("Cette opération nécessite aussi l’accès au module lié."), { code: `${moduleCode}_ACCESS_DENIED`, statusCode: 403 });
  };

  try {
    let result: unknown;
    if (body.action === "SUBMIT") {
      const parsed = manufacturingOrderSubmitSchema.safeParse({ ...(body.payload as object || {}), action: "SUBMIT" });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Soumission invalide.");
      result = await submitProductionOrder(organizationId, orderId, authorization.session.userId, parsed.data);
    } else if (body.action === "APPROVE" || body.action === "REJECT") {
      const parsed = manufacturingOrderDecisionSchema.safeParse({ ...(body.payload as object || {}), action: body.action });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Décision invalide.");
      result = await decideProductionOrder(organizationId, orderId, authorization.session.userId, parsed.data);
    } else if (body.action === "START" || body.action === "COMPLETE" || body.action === "CANCEL") {
      const parsed = manufacturingOrderLifecycleSchema.safeParse({ ...(body.payload as object || {}), action: body.action });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Transition invalide.");
      result = await changeProductionOrderLifecycle(organizationId, orderId, authorization.session.userId, parsed.data);
    } else if (body.action === "CONSUME_MATERIAL") {
      const parsed = manufacturingMaterialConsumptionSchema.safeParse({ ...(body.payload as object || {}), action: "CONSUME_MATERIAL" });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Consommation invalide.");
      await requireLinked("INVENTORY_LOGISTICS", "write");
      if (parsed.data.employeeId) await requireLinked("HUMAN_RESOURCES");
      if (parsed.data.assetId) await requireLinked("ASSETS_MAINTENANCE");
      if (parsed.data.timesheetEntryId) await requireLinked("TIME_ATTENDANCE");
      result = await consumeProductionMaterial(organizationId, orderId, authorization.session.userId, parsed.data);
    } else if (body.action === "RECEIVE_OUTPUT") {
      const parsed = manufacturingOutputReceiptSchema.safeParse({ ...(body.payload as object || {}), action: "RECEIVE_OUTPUT" });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Réception de production invalide.");
      await requireLinked("INVENTORY_LOGISTICS", "write");
      if (parsed.data.employeeId) await requireLinked("HUMAN_RESOURCES");
      if (parsed.data.assetId) await requireLinked("ASSETS_MAINTENANCE");
      if (parsed.data.timesheetEntryId) await requireLinked("TIME_ATTENDANCE");
      result = await receiveProductionOutput(organizationId, orderId, authorization.session.userId, parsed.data);
    } else if (body.action === "RECORD_EXECUTION") {
      const parsed = manufacturingExecutionRecordSchema.safeParse({ ...(body.payload as object || {}), action: "RECORD_EXECUTION" });
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Exécution invalide.");
      if (parsed.data.workCenterId || parsed.data.routingOperationId) await requireLinked("WORK_CENTERS");
      if (parsed.data.employeeId) await requireLinked("HUMAN_RESOURCES");
      if (parsed.data.assetId) await requireLinked("ASSETS_MAINTENANCE");
      if (parsed.data.timesheetEntryId) await requireLinked("TIME_ATTENDANCE");
      result = await recordProductionExecution(organizationId, orderId, authorization.session.userId, parsed.data);
    } else {
      await requireLinked("INVENTORY_LOGISTICS");
      result = await refreshProductionRequirements(organizationId, orderId, authorization.session.userId);
    }

    await writeAuditLog({ userId: authorization.session.userId, action: `MANUFACTURING_ORDER_${body.action}`, entity: "EnterpriseProductionOrder", entityId: orderId, request, metadata: { organizationId } });
    await writeApiLog({ request, statusCode: 200, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "manufacturing-order", action: body.action, orderId } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return manufacturingErrorResponse(error, "MANUFACTURING_ORDER_ACTION_FAILED");
  }
}
