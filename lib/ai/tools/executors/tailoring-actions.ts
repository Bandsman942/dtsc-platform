import type { AiToolExecutor, AiToolRuntimeContext } from "@/lib/ai/tools/types";
import {
  TAILORING_AI_ACTION_INPUT_SCHEMAS,
  type TailoringAiActionToolCode,
} from "@/lib/ai/tools/tailoring-action-contract";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import {
  completeTailoringFitting,
  updateTailoringAlteration,
  upsertTailoringFinishing,
} from "@/lib/enterprise/tailoring/service";
import { prisma } from "@/lib/prisma";

function organizationIdFrom(context: AiToolRuntimeContext) {
  const organizationId = context.organizationId || context.session.activeOrganizationId || null;
  if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  return organizationId;
}

async function requireLinkedRead(context: AiToolRuntimeContext, organizationId: string, moduleCode: string) {
  const access = await resolveEnterpriseModuleAccess({ userId: context.userId, organizationId, moduleCode, action: "read" });
  if (!access.allowed) throw new Error(`${moduleCode}_ACCESS_DENIED`);
}

const executors: Record<TailoringAiActionToolCode, AiToolExecutor> = {
  ERP_TAILORING_FITTING_COMPLETE: async ({ args, context }) => {
    const organizationId = organizationIdFrom(context);
    const parsed = TAILORING_AI_ACTION_INPUT_SCHEMAS.ERP_TAILORING_FITTING_COMPLETE.parse(args || {});
    const fitting = await completeTailoringFitting(organizationId, parsed.fittingId, context.userId, {
      revision: parsed.revision,
      status: "COMPLETED",
      result: parsed.result,
      notes: parsed.notes,
    });
    return { entityId: fitting.id, status: fitting.status, result: fitting.result, revision: fitting.revision };
  },

  ERP_TAILORING_ALTERATION_UPDATE: async ({ args, context }) => {
    const organizationId = organizationIdFrom(context);
    const parsed = TAILORING_AI_ACTION_INPUT_SCHEMAS.ERP_TAILORING_ALTERATION_UPDATE.parse(args || {});
    const current = await prisma.enterpriseTailoringAlteration.findFirst({
      where: { id: parsed.alterationId, organizationId },
      select: { assignedEmployeeId: true, dueAt: true, notes: true },
    });
    if (!current) throw new Error("TAILORING_ALTERATION_NOT_FOUND");
    const alteration = await updateTailoringAlteration(organizationId, parsed.alterationId, context.userId, {
      revision: parsed.revision,
      status: parsed.status,
      assignedEmployeeId: current.assignedEmployeeId,
      dueAt: current.dueAt,
      notes: parsed.notes === undefined ? current.notes : parsed.notes,
    });
    return { entityId: alteration.id, status: alteration.status, revision: alteration.revision };
  },

  ERP_TAILORING_FINISHING_UPDATE: async ({ args, context }) => {
    const organizationId = organizationIdFrom(context);
    const parsed = TAILORING_AI_ACTION_INPUT_SCHEMAS.ERP_TAILORING_FINISHING_UPDATE.parse(args || {});
    await Promise.all([
      requireLinkedRead(context, organizationId, "TAILORING_GARMENT_TRACKING"),
      requireLinkedRead(context, organizationId, "QUALITY_CONTROL"),
    ]);
    const finishing = await upsertTailoringFinishing(organizationId, context.userId, {
      productionOrderId: parsed.productionOrderId,
      garmentBundleId: parsed.garmentBundleId,
      qualityCheckId: parsed.qualityCheckId,
      status: parsed.status,
      pressed: parsed.pressed,
      threadTrimmed: parsed.threadTrimmed,
      fasteningsChecked: parsed.fasteningsChecked,
      packaged: parsed.packaged,
      notes: parsed.notes,
      revision: parsed.revision,
    });
    return {
      entityId: finishing.id,
      garmentBundleId: finishing.garmentBundleId,
      qualityCheckId: finishing.qualityCheckId || null,
      status: finishing.status,
      revision: finishing.revision,
    };
  },
};

export const TAILORING_AI_ACTION_EXECUTORS: Record<string, AiToolExecutor> = executors;
