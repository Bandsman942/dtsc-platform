import { NextResponse } from "next/server";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseCommonDomainAccess } from "@/lib/enterprise/common/access";
import {
  createManufacturingBom,
  createManufacturingRouting,
  createManufacturingWorkCenter,
  changeManufacturingBomStatus,
  changeManufacturingRoutingStatus,
  listManufacturingBoms,
  listManufacturingRoutings,
  listManufacturingWorkCenters,
  saveManufacturingConfiguration,
  updateManufacturingWorkCenter,
} from "@/lib/enterprise/manufacturing/definitions-service";
import {
  MANUFACTURING_MODULE_CODES,
  type ManufacturingModuleCode,
} from "@/lib/enterprise/manufacturing/constants";
import { authorizeManufacturingRequest, manufacturingErrorResponse } from "@/lib/enterprise/manufacturing/http";
import {
  createProductionOrder,
  createProductionQualityCheck,
  createProductionScrap,
  createShortagePurchase,
  listProductionOrders,
} from "@/lib/enterprise/manufacturing/production-service";
import { getManufacturingOverview, getManufacturingReferences, getManufacturingReportData } from "@/lib/enterprise/manufacturing/queries";
import {
  manufacturingBomCreateSchema,
  manufacturingConfigurationSchema,
  manufacturingDefinitionActionSchema,
  manufacturingProductionOrderCreateSchema,
  manufacturingQualityCheckSchema,
  manufacturingRoutingCreateSchema,
  manufacturingScrapSchema,
  manufacturingShortagePurchaseSchema,
  manufacturingWorkCenterCreateSchema,
  manufacturingWorkCenterUpdateSchema,
} from "@/lib/enterprise/manufacturing/validators";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

type Params = { params: Promise<{ organizationId: string }> };
const MANUFACTURING_MODULE_SET = new Set<string>(MANUFACTURING_MODULE_CODES);

type CollectionAction =
  | "SAVE_CONFIGURATION"
  | "CREATE_WORK_CENTER"
  | "UPDATE_WORK_CENTER"
  | "CREATE_BOM"
  | "CHANGE_BOM_STATUS"
  | "CREATE_ROUTING"
  | "CHANGE_ROUTING_STATUS"
  | "CREATE_ORDER"
  | "CREATE_QUALITY_CHECK"
  | "CREATE_SCRAP"
  | "CREATE_SHORTAGE_PURCHASE";

function requestedModuleCode(request: Request): ManufacturingModuleCode {
  const requested = new URL(request.url).searchParams.get("moduleCode")?.trim().toUpperCase() || "MANUFACTURING_OVERVIEW";
  return MANUFACTURING_MODULE_SET.has(requested) ? requested as ManufacturingModuleCode : "MANUFACTURING_OVERVIEW";
}

function payloadError(message: string) {
  return NextResponse.json({ error: "INVALID_PAYLOAD", message }, { status: 400 });
}

async function linkedAccess(userId: string, organizationId: string, moduleCode: string, action: "read" | "write" = "read") {
  return resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action });
}

export async function GET(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const moduleCode = requestedModuleCode(request);
  const authorization = await authorizeManufacturingRequest({ request, organizationId, moduleCode, action: "read" });
  if (!authorization.ok) return authorization.response;
  const periodDays = Math.min(366, Math.max(1, Number(new URL(request.url).searchParams.get("periodDays") || 30) || 30));
  try {
    const [overview, referencesRaw, boms, routings, workCenters, orders, report, salesAccess, hrAccess, timeAccess, assetsAccess, procurementAccess, catalogAccess, siteAccess] = await Promise.all([
      getManufacturingOverview(organizationId, periodDays),
      authorization.access.canWrite ? getManufacturingReferences(organizationId) : Promise.resolve(null),
      listManufacturingBoms(organizationId),
      listManufacturingRoutings(organizationId),
      listManufacturingWorkCenters(organizationId),
      listProductionOrders(organizationId, 100),
      moduleCode === "PRODUCTION_REPORTS" ? getManufacturingReportData(organizationId, periodDays) : Promise.resolve(null),
      linkedAccess(authorization.session.userId, organizationId, "SALES_QUOTES_ORDERS"),
      linkedAccess(authorization.session.userId, organizationId, "HUMAN_RESOURCES"),
      linkedAccess(authorization.session.userId, organizationId, "TIME_ATTENDANCE"),
      linkedAccess(authorization.session.userId, organizationId, "ASSETS_MAINTENANCE"),
      linkedAccess(authorization.session.userId, organizationId, "SUPPLIERS_PURCHASES"),
      linkedAccess(authorization.session.userId, organizationId, "CATALOG"),
      linkedAccess(authorization.session.userId, organizationId, "SITES_WAREHOUSES"),
    ]);
    const references = referencesRaw ? {
      configuration: referencesRaw.configuration,
      catalogItems: catalogAccess.allowed ? referencesRaw.catalogItems : [],
      warehouses: siteAccess.allowed ? referencesRaw.warehouses : [],
      salesOrders: salesAccess.allowed ? referencesRaw.salesOrders : [],
      employees: hrAccess.allowed ? referencesRaw.employees : [],
      assets: assetsAccess.allowed ? referencesRaw.assets : [],
      approvedTimesheetEntries: timeAccess.allowed ? referencesRaw.approvedTimesheetEntries : [],
      suppliers: procurementAccess.allowed ? referencesRaw.suppliers : [],
      boms: referencesRaw.boms,
      routings: referencesRaw.routings,
      workCenters: referencesRaw.workCenters,
    } : null;
    await writeApiLog({ request, statusCode: 200, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "manufacturing", moduleCode } });
    return NextResponse.json({
      moduleCode,
      capabilities: {
        canWrite: authorization.access.canWrite,
        canApprove: authorization.access.canApprove,
        canManage: authorization.access.canManage,
      },
      overview,
      report,
      references,
      boms,
      routings,
      workCenters,
      orders,
    });
  } catch (error) {
    return manufacturingErrorResponse(error, "MANUFACTURING_READ_FAILED");
  }
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now();
  const { organizationId } = await params;
  const body = await request.json().catch(() => null) as { action?: CollectionAction; payload?: unknown; entityId?: string } | null;
  if (!body?.action) return payloadError("Une action Manufacturing valide est obligatoire.");

  const actionPolicy: Record<CollectionAction, { moduleCode: ManufacturingModuleCode; action: "write" | "manage" }> = {
    SAVE_CONFIGURATION: { moduleCode: "MANUFACTURING_OVERVIEW", action: "manage" },
    CREATE_WORK_CENTER: { moduleCode: "WORK_CENTERS", action: "write" },
    UPDATE_WORK_CENTER: { moduleCode: "WORK_CENTERS", action: "write" },
    CREATE_BOM: { moduleCode: "BILL_OF_MATERIALS", action: "write" },
    CHANGE_BOM_STATUS: { moduleCode: "BILL_OF_MATERIALS", action: "manage" },
    CREATE_ROUTING: { moduleCode: "PRODUCTION_ROUTINGS", action: "write" },
    CHANGE_ROUTING_STATUS: { moduleCode: "PRODUCTION_ROUTINGS", action: "manage" },
    CREATE_ORDER: { moduleCode: "PRODUCTION_ORDERS", action: "write" },
    CREATE_QUALITY_CHECK: { moduleCode: "QUALITY_CONTROL", action: "write" },
    CREATE_SCRAP: { moduleCode: "SCRAP_WASTE", action: "write" },
    CREATE_SHORTAGE_PURCHASE: { moduleCode: "MATERIAL_REQUIREMENTS", action: "write" },
  };
  const policy = actionPolicy[body.action];
  const authorization = await authorizeManufacturingRequest({ request, organizationId, moduleCode: policy.moduleCode, action: policy.action, mutate: true });
  if (!authorization.ok) return authorization.response;

  const requireLinked = async (moduleCode: string, action: "read" | "write" = "read") => {
    const decision = await linkedAccess(authorization.session.userId, organizationId, moduleCode, action);
    if (!decision.allowed) throw Object.assign(new Error("Cette opération nécessite aussi l’accès au module lié."), { code: `${moduleCode}_ACCESS_DENIED`, statusCode: 403 });
  };

  try {
    let result: unknown;
    if (body.action === "SAVE_CONFIGURATION") {
      const parsed = manufacturingConfigurationSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Configuration invalide.");
      await requireLinked("SITES_WAREHOUSES");
      result = await saveManufacturingConfiguration(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_WORK_CENTER") {
      const parsed = manufacturingWorkCenterCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Centre de travail invalide.");
      await requireLinked("SITES_WAREHOUSES");
      if (parsed.data.assetId) await requireLinked("ASSETS_MAINTENANCE");
      result = await createManufacturingWorkCenter(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "UPDATE_WORK_CENTER") {
      if (!body.entityId) return payloadError("Le centre de travail à modifier est obligatoire.");
      const parsed = manufacturingWorkCenterUpdateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Centre de travail invalide.");
      await requireLinked("SITES_WAREHOUSES");
      if (parsed.data.assetId) await requireLinked("ASSETS_MAINTENANCE");
      result = await updateManufacturingWorkCenter(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_BOM") {
      const parsed = manufacturingBomCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Nomenclature invalide.");
      await requireLinked("CATALOG");
      result = await createManufacturingBom(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CHANGE_BOM_STATUS") {
      if (!body.entityId) return payloadError("La nomenclature est obligatoire.");
      const parsed = manufacturingDefinitionActionSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Action invalide.");
      result = await changeManufacturingBomStatus(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_ROUTING") {
      const parsed = manufacturingRoutingCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Gamme invalide.");
      if (parsed.data.catalogItemId) await requireLinked("CATALOG");
      result = await createManufacturingRouting(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CHANGE_ROUTING_STATUS") {
      if (!body.entityId) return payloadError("La gamme est obligatoire.");
      const parsed = manufacturingDefinitionActionSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Action invalide.");
      result = await changeManufacturingRoutingStatus(organizationId, body.entityId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_ORDER") {
      const parsed = manufacturingProductionOrderCreateSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Ordre de production invalide.");
      await Promise.all([requireLinked("CATALOG"), requireLinked("SITES_WAREHOUSES"), requireLinked("INVENTORY_LOGISTICS")]);
      if (parsed.data.salesOrderId) await requireLinked("SALES_QUOTES_ORDERS");
      result = await createProductionOrder(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_QUALITY_CHECK") {
      const parsed = manufacturingQualityCheckSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Contrôle qualité invalide.");
      if (parsed.data.inspectedEmployeeId) await requireLinked("HUMAN_RESOURCES");
      result = await createProductionQualityCheck(organizationId, authorization.session.userId, parsed.data);
    } else if (body.action === "CREATE_SCRAP") {
      const parsed = manufacturingScrapSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Rebut invalide.");
      await requireLinked("CATALOG");
      if (parsed.data.affectsInventory) await requireLinked("INVENTORY_LOGISTICS", "write");
      result = await createProductionScrap(organizationId, authorization.session.userId, parsed.data);
    } else {
      const parsed = manufacturingShortagePurchaseSchema.safeParse(body.payload);
      if (!parsed.success) return payloadError(parsed.error.issues[0]?.message || "Réapprovisionnement invalide.");
      const procurementAccess = await getEnterpriseCommonDomainAccess({ session: authorization.session, organizationId, moduleCode: "SUPPLIERS_PURCHASES", action: "write" });
      if (!procurementAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      result = await createShortagePurchase(organizationId, authorization.session.userId, parsed.data);
    }

    await writeAuditLog({ userId: authorization.session.userId, action: `MANUFACTURING_${body.action}`, entity: "Manufacturing", entityId: body.entityId || organizationId, request, metadata: { organizationId, moduleCode: policy.moduleCode } });
    await writeApiLog({ request, statusCode: 200, userId: authorization.session.userId, startedAt, metadata: { organizationId, domain: "manufacturing", action: body.action } });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return manufacturingErrorResponse(error);
  }
}
