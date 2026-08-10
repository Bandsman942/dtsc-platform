import type { AiToolExecutor } from "@/lib/ai/tools/types";

export const TASK_DRAFT_AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  TASK_DRAFT_PREPARE: async ({ args }) => {
    const input = args as { title: string; description?: string };
    return {
      title: input.title,
      description: input.description?.trim() || null,
      status: "DRAFT" as const,
    };
  },
};
