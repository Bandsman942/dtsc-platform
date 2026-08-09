import { PHARMACY_AI_TOOL_EXECUTORS } from "@/lib/ai/tools/executors/pharmacy";
import type { AiToolExecutor } from "@/lib/ai/tools/types";

const AI_TOOL_EXECUTORS: Record<string, AiToolExecutor> = {
  ...PHARMACY_AI_TOOL_EXECUTORS,
};

export function getAiToolExecutor(code: string) {
  return AI_TOOL_EXECUTORS[code] || null;
}

export function listExecutableAiToolCodes() {
  return Object.keys(AI_TOOL_EXECUTORS).sort();
}

export function assertAiToolExecutorIntegrity() {
  return Object.entries(AI_TOOL_EXECUTORS)
    .filter(([, executor]) => typeof executor !== "function")
    .map(([code]) => `${code}: executor is not callable`);
}
