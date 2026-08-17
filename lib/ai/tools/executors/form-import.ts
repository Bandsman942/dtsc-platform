import { getCertifiedFormImportTarget } from "@/lib/ai/forms/import-registry";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

type ImportArgs = {
  formCode: string;
  rows: Array<Record<string, unknown>>;
  sourceLabel?: string;
};

function safeMessage(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : "";
    if (message) return message.slice(0, 240);
  }
  return `HTTP_${status}`;
}

export const FORM_IMPORT_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  ENTERPRISE_FORM_BATCH_IMPORT: async ({ args, context }) => {
    const input = args as ImportArgs;
    const target = getCertifiedFormImportTarget(input.formCode);
    const organizationId = context.organizationId || context.session.activeOrganizationId;
    const sourceRequest = context.request;
    if (!target || !organizationId || !sourceRequest) throw new Error("FORM_IMPORT_CONTEXT_REQUIRED");
    if (context.session.activeContext !== "ORGANIZATION" || context.session.activeOrganizationId !== organizationId) throw new Error("FORM_IMPORT_ORGANIZATION_MISMATCH");

    const origin = new URL(sourceRequest.url).origin;
    const cookie = sourceRequest.headers.get("cookie") || "";
    const results: Array<{ index: number; ok: boolean; status: number; id?: string; message?: string }> = [];

    for (let index = 0; index < input.rows.length; index += 1) {
      const response = await fetch(`${origin}/api/enterprise/${encodeURIComponent(organizationId)}/${target.segment}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          "X-DTSC-Agent-Import": "1",
        },
        body: JSON.stringify(input.rows[index]),
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const candidate = body && typeof body === "object"
        ? Object.values(body).find((value) => value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string") as Record<string, unknown> | undefined
        : undefined;
      results.push({
        index,
        ok: response.ok,
        status: response.status,
        ...(candidate && typeof candidate.id === "string" ? { id: candidate.id } : {}),
        ...(!response.ok ? { message: safeMessage(body, response.status) } : {}),
      });

      // Do not hammer protected business routes after auth, entitlement or quota
      // failures. The canonical route remains the authority for every row.
      if ([401, 403, 429].includes(response.status)) break;
    }

    const succeeded = results.filter((item) => item.ok).length;
    return {
      formCode: input.formCode,
      sourceLabel: input.sourceLabel || null,
      attempted: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  },
};
