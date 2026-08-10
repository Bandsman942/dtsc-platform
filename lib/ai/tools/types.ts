import type { SessionPayload } from "@/lib/session";
import type { AiDataClassification } from "@/lib/ai/types";

export type AiToolRuntimeContext = {
  session: SessionPayload;
  userId: string;
  organizationId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  assistantCode?: string | null;
  dataClassifications?: AiDataClassification[];
  request?: Request | null;
};

export type AiToolExecutorInput = {
  args: unknown;
  context: AiToolRuntimeContext;
};

export type AiToolExecutor = (input: AiToolExecutorInput) => Promise<unknown>;

export type AiToolAuthorizationDecision = {
  allowed: boolean;
  reasonCode:
    | "ALLOWED"
    | "TOOL_NOT_REGISTERED"
    | "CONTEXT_NOT_ALLOWED"
    | "ASSISTANT_NOT_ALLOWED"
    | "ORGANIZATION_CONTEXT_REQUIRED"
    | "ENTERPRISE_AI_ACCESS_DENIED"
    | "TOOL_READ_DISABLED"
    | "SECTOR_NOT_ALLOWED"
    | "PLAN_NOT_ALLOWED"
    | "MODULE_NOT_ALLOWED"
    | "SENSITIVE_DATA_NOT_ALLOWED";
  message: string;
};

export type AiToolExecutionResult = {
  ok: boolean;
  toolCode: string;
  status: "SUCCESS" | "DENIED" | "INVALID_INPUT" | "INVALID_OUTPUT" | "CONFIRMATION_REQUIRED" | "FAILED";
  result?: unknown;
  reasonCode?: string;
  auditId?: string | null;
};
