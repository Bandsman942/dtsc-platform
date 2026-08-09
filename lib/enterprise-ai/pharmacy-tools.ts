import { getSession } from "@/lib/auth";
import { executeAiTool } from "@/lib/ai/tools/execute";
import { selectPharmacyReadToolCodes } from "@/lib/ai/tools/select";
import type { EnterpriseAiToolResult } from "@/lib/enterprise-ai/pharmacy-tool-data";

export type { EnterpriseAiToolResult } from "@/lib/enterprise-ai/pharmacy-tool-data";

export async function runPharmacyReadTools(organizationId: string, content: string) {
  const session = await getSession();
  if (!session || session.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) {
    return [] as EnterpriseAiToolResult[];
  }

  const toolCodes = selectPharmacyReadToolCodes(content);
  const results: EnterpriseAiToolResult[] = [];

  for (const toolCode of toolCodes) {
    const execution = await executeAiTool({
      toolCode,
      args: {},
      context: {
        session,
        userId: session.userId,
        organizationId,
        assistantCode: "PHARMACY_ASSISTANT",
      },
    });
    if (execution.ok && execution.status === "SUCCESS" && execution.result) {
      results.push(execution.result as EnterpriseAiToolResult);
    }
  }

  return results;
}
