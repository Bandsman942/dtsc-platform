import { createEmbeddings, getEmbeddingIndexVersion } from "@/lib/ai/embeddings";
import {
  indexPreparedEnterpriseAiKnowledgeSource,
  resolveKnowledgeDataClassification,
} from "@/lib/enterprise-ai/knowledge";
import { RAG_CHUNKING_VERSION } from "@/lib/rag";
import { prisma } from "@/lib/prisma";

export async function reindexEnterpriseAiKnowledgeSource({
  sourceId,
  organizationId,
}: {
  sourceId: string;
  organizationId: string;
}) {
  const source = await prisma.enterpriseAiKnowledgeSource.findFirst({
    where: { id: sourceId, organizationId, archivedAt: null },
    select: {
      id: true,
      sectorCode: true,
      moduleCode: true,
      confidentiality: true,
      extractedText: true,
    },
  });
  if (!source?.extractedText) throw new Error("KNOWLEDGE_SOURCE_NOT_PREPARED");

  const definition = (await createEmbeddings([])).definition;
  const indexVersion = getEmbeddingIndexVersion(definition);
  const dataClassification = resolveKnowledgeDataClassification({
    confidentiality: source.confidentiality,
    sectorCode: source.sectorCode,
    moduleCode: source.moduleCode,
  });

  await prisma.$executeRawUnsafe(
    `UPDATE "EnterpriseAiKnowledgeSource"
     SET "dataClassification"=$3,
         "embeddingProviderCode"=$4,
         "embeddingModelCode"=$5,
         "embeddingDimension"=$6,
         "indexVersion"=$7,
         "chunkingVersion"=$8,
         "indexedAt"=NULL
     WHERE "id"=$1 AND "organizationId"=$2`,
    sourceId,
    organizationId,
    dataClassification,
    definition.providerCode,
    definition.modelCode,
    definition.dimension,
    indexVersion,
    RAG_CHUNKING_VERSION
  );

  return indexPreparedEnterpriseAiKnowledgeSource({ sourceId, organizationId });
}
