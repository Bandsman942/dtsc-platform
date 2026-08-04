import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAiModelDefinition, listCatalogAiModelsForUi } from "@/lib/ai/catalog";
import type { AiContextCode } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";

function resolveContext(activeContext?: string | null): AiContextCode {
  if (activeContext === "DTSC_INTERNAL") return "DTSC_INTERNAL";
  if (activeContext === "ORGANIZATION") return "ORGANIZATION";
  return "PERSONAL";
}

export async function GET() {
  const session = await getSession();
  const user = session
    ? await prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true, preferredModel: true } })
    : null;
  const context = resolveContext(session?.activeContext);
  const locale = user?.locale || "fr";
  const models = listCatalogAiModelsForUi({ context, locale });
  const preferred = user?.preferredModel ? getAiModelDefinition(user.preferredModel) : null;
  const defaultModel = preferred && models.some((model) => model.id === preferred.code) ? preferred.code : models[0]?.id || null;

  return NextResponse.json({
    defaultModel,
    models: models.map((model) => ({
      id: model.id,
      name: model.label,
      providerCode: model.providerCode,
      status: model.status,
      minimumPlan: model.minimumPlan,
    })),
  });
}
