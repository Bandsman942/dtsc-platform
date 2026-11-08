import { NextResponse } from "next/server";
import { z } from "zod";
import { requireConsoleCapability } from "@/lib/admin-api";
import { hasRecentStepUp } from "@/lib/auth/step-up";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { planMeetsRequirement } from "@/lib/billing/plans";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { BUSINESS_SUBTYPES } from "@/lib/enterprise/business-subtype-registry";
import {
  activateEnterpriseModule,
  disableEnterpriseModule,
  EnterpriseModuleConfigurationError,
} from "@/lib/enterprise/module-subscription-reconciliation";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import {
  getRetailExtensionPreferences,
  RETAIL_OPTIONAL_EXTENSION_MODULE_CODES,
} from "@/lib/enterprise/retail/extension-policy";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };
const schema = z.object({
  moduleCode: z.enum(RETAIL_OPTIONAL_EXTENSION_MODULE_CODES),
  enabled: z.boolean(),
  reason: z.string().trim().min(8).max(500),
}).strict();
const auditActions = ["DTSC_RETAIL_EXTENSION_ENABLED", "DTSC_RETAIL_EXTENSION_DISABLED"];

async function inspect(organizationId: string) {
  const [organization, configuration, entitlements, history] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { id: true, name: true, sectorCode: true },
    }),
    prisma.enterpriseRetailConfiguration.findUnique({
      where: { organizationId },
      select: { status: true, settingsJson: true },
    }),
    getOrganizationEntitlements(organizationId),
    prisma.auditLog.findMany({
      where: { organizationId, entity: "EnterpriseRetailConfiguration", action: { in: auditActions } },
      orderBy: { createdAt: "desc" }, take: 12,
      select: { id: true, action: true, createdAt: true, metadata: true, user: { select: { name: true } } },
    }),
  ]);
  if (!organization || !configuration || !entitlements) return null;
  const preferences = getRetailExtensionPreferences(configuration.settingsJson);
  const modules = RETAIL_OPTIONAL_EXTENSION_MODULE_CODES.map((moduleCode) => {
    const definition = getEnterpriseModuleDefinition(moduleCode);
    const installed = entitlements.modules.find((row) => row.canonicalCode === moduleCode || row.moduleCode === moduleCode);
    const eligible = Boolean(definition && configuration.status === "ACTIVE"
      && entitlements.subscriptionActive && planMeetsRequirement(entitlements.planCode, definition.minimumPlan)
      && entitlements.organizationStatus === "ACTIVE");
    return {
      moduleCode, labelFr: definition?.labelFr || moduleCode,
      labelEn: definition?.labelEn || moduleCode,
      descriptionFr: definition?.descriptionFr || "",
      descriptionEn: definition?.descriptionEn || "",
      iconKey: definition?.iconKey || "layers",
      minimumPlan: definition?.minimumPlan || "BUSINESS",
      eligible, enabled: Boolean(installed?.isEnabled && installed.allowed),
      configured: Boolean(installed?.isEnabled),
      choice: preferences[moduleCode] ?? null,
      reason: !eligible ? "L'abonnement actif ne couvre pas cette extension ou la configuration RETAIL n'est pas prête." : null,
    };
  });
  const planned = BUSINESS_SUBTYPES
    .filter((item) => item.sectorCode === "COMMERCE_RETAIL" && item.implementationStatus === "PLANNED")
    .map((item) => ({ code: item.code, labelFr: item.labelFr, labelEn: item.labelEn,
      descriptionFr: item.descriptionFr, descriptionEn: item.descriptionEn }));
  return {
    organization: { id: organization.id, name: organization.name },
    businessSubtypeCode: entitlements.businessSubtypeCode,
    planCode: entitlements.planCode, planLabel: entitlements.planLabel,
    subscriptionStatus: entitlements.subscriptionStatus,
    modules, planned,
    history: history.map((row) => ({
      id: row.id, action: row.action, at: row.createdAt, actorName: row.user?.name || null,
      reason: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        && typeof row.metadata.reason === "string" ? row.metadata.reason : null,
      moduleCode: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        && typeof row.metadata.moduleCode === "string" ? row.metadata.moduleCode : null,
    })),
  };
}

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.ORGANIZATIONS_READ);
  if (access.response) return access.response;
  const { id } = await params;
  const state = await inspect(id);
  const statusCode = state ? 200 : 404;
  await writeApiLog({ request: req, userId: access.session.userId, startedAt, statusCode,
    metadata: { operation: "dtsc_retail_extension_read", organizationId: id } });
  return NextResponse.json(state || { error: "Entreprise RETAIL introuvable ou inaccessible." },
    { status: statusCode, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.ORGANIZATIONS_MANAGE);
  if (access.response) return access.response;
  const limit = await rateLimit(getRateLimitKey(req, `dtsc-retail-extension:${access.session.userId}`), 15, 60 * 60 * 1000, { failureMode: "closed" });
  if (!limit.ok) return NextResponse.json({ error: "Trop de modifications. Réessayez plus tard." }, { status: 429 });
  const { id } = await params;
  if (!(await hasRecentStepUp(access.session))) {
    await writeAuditLog({ userId: access.session.userId, organizationId: id,
      action: "AUTH_CRITICAL_MUTATION_STEPUP_DENIED", entity: "EnterpriseRetailConfiguration", entityId: id,
      result: "DENIED", reasonCode: "STEP_UP_REQUIRED", riskLevel: "HIGH", request: req,
      metadata: { operation: "DTSC_RETAIL_EXTENSION" } });
    return NextResponse.json({ error: "Confirmez récemment votre identité.", reasonCode: "STEP_UP_REQUIRED" }, { status: 428 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sélection invalide ou justification trop courte.", reasonCode: "VALIDATION_ERROR" }, { status: 400 });
  const { moduleCode, enabled, reason } = parsed.data;
  const before = await inspect(id);
  if (!before) return NextResponse.json({ error: "Entreprise RETAIL introuvable." }, { status: 404 });
  const target = before.modules.find((item) => item.moduleCode === moduleCode);
  if (!target) return NextResponse.json({ error: "Extension inconnue." }, { status: 404 });
  if (enabled && !target.eligible) return NextResponse.json({ error: target.reason, reasonCode: "PLAN_REQUIRED" }, { status: 402 });
  if (target.configured === enabled && target.choice === enabled) {
    return NextResponse.json({ error: "Cette extension possède déjà ce statut.", reasonCode: "UNCHANGED" }, { status: 409 });
  }
  try {
    const result = enabled
      ? await activateEnterpriseModule({ organizationId: id, moduleCode, activateDependencies: true })
      : await disableEnterpriseModule({ organizationId: id, moduleCode });
    const affectedCodes = "activatedModules" in result ? result.activatedModules : [result.disabledModule];
    const affected = await prisma.enterpriseModule.findMany({
      where: { organizationId: id, moduleCode: { in: affectedCodes } }, select: { id: true },
    });
    await prisma.enterpriseAdminSection.updateMany({
      where: { organizationId: id, moduleId: { in: affected.map((item) => item.id) } },
      data: { isEnabled: enabled },
    });
    await writeAuditLog({
      userId: access.session.userId, organizationId: id,
      action: enabled ? "DTSC_RETAIL_EXTENSION_ENABLED" : "DTSC_RETAIL_EXTENSION_DISABLED",
      entity: "EnterpriseRetailConfiguration", entityId: id, request: req,
      riskLevel: "HIGH", reasonCode: "AUTHORIZED",
      before: { moduleCode, enabled: target.configured },
      after: { moduleCode, enabled },
      metadata: { moduleCode, enabled, reason, affectedCodes, planCode: before.planCode },
    });
    await writeApiLog({ request: req, userId: access.session.userId, startedAt, statusCode: 200,
      metadata: { action: "dtsc_retail_extension_changed", organizationId: id, moduleCode, enabled } });
    return NextResponse.json({ ok: true, message: enabled ? "Extension activée." : "Extension désactivée.", state: await inspect(id) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof EnterpriseModuleConfigurationError) {
      await writeApiLog({ request: req, userId: access.session.userId, startedAt, statusCode: error.status,
        metadata: { action: "dtsc_retail_extension_rejected", code: error.code, organizationId: id } });
      return NextResponse.json({ error: error.message, reasonCode: error.code, details: error.details },
        { status: error.status });
    }
    throw error;
  }
}
