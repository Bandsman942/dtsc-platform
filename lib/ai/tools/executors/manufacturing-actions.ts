import type { AiToolExecutor } from "@/lib/ai/tools/types";
import {
  MANUFACTURING_AI_ACTION_INPUT_SCHEMAS,
  MANUFACTURING_AI_ACTION_TOOL_CODE,
} from "@/lib/ai/tools/manufacturing-action-contract";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { submitProductionOrder } from "@/lib/enterprise/manufacturing/production-service";

export const MANUFACTURING_AI_ACTION_EXECUTORS: Record<string, AiToolExecutor> = {
  [MANUFACTURING_AI_ACTION_TOOL_CODE]: async ({ args, context }) => {
    const organizationId = context.organizationId || context.session.activeOrganizationId || null;
    if (!organizationId || context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) {
      throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
    }
    const access = await resolveEnterpriseModuleAccess({
      userId: context.userId,
      organizationId,
      moduleCode: "PRODUCTION_ORDERS",
      action: "submit",
    });
    if (!access.allowed) throw new Error("PRODUCTION_ORDER_SUBMIT_ACCESS_DENIED");

    const parsed = MANUFACTURING_AI_ACTION_INPUT_SCHEMAS[MANUFACTURING_AI_ACTION_TOOL_CODE].parse(args || {});
    const order = await submitProductionOrder(organizationId, parsed.orderId, context.userId, {
      action: "SUBMIT",
      revision: parsed.revision,
      approverUserId: parsed.approverUserId,
    });
    return {
      orderId: order.id,
      reference: order.reference,
      status: order.status,
      revision: order.revision,
      approverUserId: order.approverUserId || null,
    };
  },
};
