import { NextResponse } from "next/server";
import {
  getConfiguredOpenAIModels,
  getDefaultOpenAIModel,
  getDisplayName,
} from "@/lib/openai-config";

export async function GET() {
  return NextResponse.json({
    defaultModel: getDefaultOpenAIModel(),
    models: getConfiguredOpenAIModels().map((modelId) => ({
      id: modelId,
      name: getDisplayName(modelId),
    })),
  });
}
