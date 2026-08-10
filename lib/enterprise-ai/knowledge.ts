import { randomUUID } from "node:crypto";
import type { AiDataClassification } from "@/lib/ai/types";
import {
  createEmbedding as createProviderEmbedding,
  createEmbeddings,
  getEmbeddingIndexVersion,
} from "@/lib/ai/embeddings";
import { rerankKnowledgeCandidates } from "@/lib/ai/reranking";
import {
  chunkKnowledgeText,
  extractKnowledgeText,
  isSupportedKnowledgeFile,
  knowledgeUploadLimits,
  RAG_CHUNKING_VERSION,
  toVectorLiteral,
} from "@/lib/rag";
import { prisma } from "@/lib/prisma";
import { uploadEnterpriseAiKnowledgeFileToSupabase } from "@/lib/supabase-storage";
import type { EnterpriseAiAccess } from "@/lib/enterprise-ai/access";

export type EnterpriseAiKnowledgeCitation = {
  sourceId: string;
  title: string;
  confidentiality: string;
  dataClassification: AiDataClassification;
  sourceVersion: number;
  indexVersion: string;
  content: string;
  distance: number;
  lexicalRank: number;
  hybridScore: number;
  language: string;
  pageNumber: number | null;
  section: string | null;
};

type EnterpriseKnowledgeRetrievalRow = EnterpriseAiKnowledgeCitation & {
  chunkId: string;
};

type EnterpriseIndexMetadata = {
  id: string;
  organizationId: string;
  sectorCode: string | null;
  moduleCode: string | null;
  confidentiality: string;
  language: string;
  sourceVersion: number;
  dataClassification: AiDataClassification;
  extractedText: string | null;
};

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveKnowledgeDataClassification({
  confidentiality,
  sectorCode,
  moduleCode,
}: {
  confidentiality: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
}): AiDataClassification {
  if (confidentiality === "PUBLIC") return "PUBLIC";
  if (sectorCode === "HEALTH_CARE" || sectorCode === "PHARMACY") return "HEALTH_SENSITIVE";
  const moduleCodeUpper = String(moduleCode || "").toUpperCase();
  if (moduleCodeUpper.includes("HR") || moduleCodeUpper.includes("PAYROLL")) return "HR_SENSITIVE";
  if (
    moduleCodeUpper.includes("FINANCE") ||
    moduleCodeUpper.includes("ACCOUNT") ||
    moduleCodeUpper.includes("BUDGET")
  ) {
    return "FINANCIAL_SENSITIVE";
  }
  if (moduleCodeUpper.includes("LEGAL") || moduleCodeUpper.includes("CONTRACT")) return "LEGAL_SENSITIVE";
  if (confidentiality === "CONFIDENTIAL" || confidentiality === "MANAGERS_ONLY") return "CONFIDENTIAL";
  return "INTERNAL";
}

export function canIndexEnterpriseAiFile(file: File) {
  return file.size <= knowledgeUploadLimits.maxUploadBytes && isSupportedKnowledgeFile(file);
}

export async function assertEnterpriseAiKnowledgeQuota(
  organizationId: string,
  file: File,
  access: EnterpriseAiAccess
) {
  const [sourceCount, sourceStorage] = await Promise.all([
    prisma.enterpriseAiKnowledgeSource.count({
      where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
    }),
    prisma.enterpriseAiKnowledgeSource.aggregate({
      where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
      _sum: { sizeBytes: true },
    }),
  ]);
  const nextStorageMb = Math.ceil(((sourceStorage._sum.sizeBytes || 0) + file.size) / (1024 * 1024));
  if (sourceCount >= access.limits.maxEnterpriseAiKnowledgeSources) {
    return { ok: false as const, code: "SOURCE_LIMIT_REACHED" };
  }
  if (nextStorageMb > access.limits.maxEnterpriseAiStorageMb) {
    return { ok: false as const, code: "STORAGE_LIMIT_REACHED" };
  }
  return { ok: true as const };
}

async function indexEnterpriseChunks({
  organizationId,
  sourceId,
  sectorCode,
  moduleCode,
  language,
  sourceVersion,
  dataClassification,
  chunks,
}: {
  organizationId: string;
  sourceId: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
  language: string;
  sourceVersion: number;
  dataClassification: AiDataClassification;
  chunks: ReturnType<typeof chunkKnowledgeText>;
}) {
  const batchSize = 48;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const embedded = await createEmbeddings(batch.map((chunk) => chunk.content));
    const indexVersion = getEmbeddingIndexVersion(embedded.definition);
    for (let index = 0; index < batch.length; index += 1) {
      const chunk = batch[index];
      const embedding = embedded.embeddings[index];
      if (!chunk || !embedding) throw new Error("EMBEDDING_RESPONSE_COUNT_MISMATCH");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EnterpriseAiKnowledgeChunk"
          ("id","organizationId","sourceId","sectorCode","moduleCode","content","tokenHint","language","pageNumber","section","offsetStart","offsetEnd","embedding","dataClassification","embeddingProviderCode","embeddingModelCode","embeddingDimension","indexVersion","chunkingVersion","sourceVersion","contentHash")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT DO NOTHING`,
        randomUUID(),
        organizationId,
        sourceId,
        normalizeOptional(sectorCode),
        normalizeOptional(moduleCode),
        chunk.content,
        Math.ceil(chunk.content.length / 4),
        language,
        chunk.pageNumber,
        chunk.section,
        chunk.offsetStart,
        chunk.offsetEnd,
        toVectorLiteral(embedding),
        dataClassification,
        embedded.definition.providerCode,
        embedded.definition.modelCode,
        embedded.definition.dimension,
        indexVersion,
        RAG_CHUNKING_VERSION,
        sourceVersion,
        chunk.contentHash
      );
    }
  }
}

export async function prepareEnterpriseAiKnowledgeSource({
  organizationId,
  assistantId,
  userId,
  sectorCode,
  moduleCode,
  title,
  confidentiality,
  language = "fr",
  file,
}: {
  organizationId: string;
  assistantId: string;
  userId: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
  title?: string | null;
  confidentiality: string;
  language?: string;
  file: File;
}) {
  const dataClassification = resolveKnowledgeDataClassification({ confidentiality, sectorCode, moduleCode });
  const source = await prisma.enterpriseAiKnowledgeSource.create({
    data: {
      organizationId,
      assistantId,
      sectorCode: normalizeOptional(sectorCode),
      moduleCode: normalizeOptional(moduleCode),
      title: normalizeOptional(title) || file.name,
      sourceType: "DOCUMENT",
      status: "PROCESSING",
      confidentiality,
      language: language === "en" ? "en" : "fr",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      createdById: userId,
    },
  });

  try {
    const [storage, extractedText] = await Promise.all([
      uploadEnterpriseAiKnowledgeFileToSupabase({ organizationId, sourceId: source.id, file }),
      extractKnowledgeText(file),
    ]);
    const definition = (await createEmbeddings([])).definition;
    const indexVersion = getEmbeddingIndexVersion(definition);
    await prisma.enterpriseAiKnowledgeSource.update({
      where: { id: source.id },
      data: {
        extractedText,
        storageBucket: storage?.bucket || null,
        storagePath: storage?.path || null,
        errorMessage: null,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "EnterpriseAiKnowledgeSource"
       SET "dataClassification"=$2,"embeddingProviderCode"=$3,"embeddingModelCode"=$4,"embeddingDimension"=$5,"indexVersion"=$6,"chunkingVersion"=$7,"indexedAt"=NULL
       WHERE "id"=$1 AND "organizationId"=$8`,
      source.id,
      dataClassification,
      definition.providerCode,
      definition.modelCode,
      definition.dimension,
      indexVersion,
      RAG_CHUNKING_VERSION,
      organizationId
    );
    return {
      id: source.id,
      title: source.title,
      status: "PROCESSING" as const,
      dataClassification,
      indexVersion,
    };
  } catch (error) {
    await prisma.enterpriseAiKnowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Enterprise AI knowledge preparation failed",
      },
    });
    throw error;
  }
}

async function readEnterpriseIndexMetadata(sourceId: string, organizationId: string) {
  const rows = await prisma.$queryRawUnsafe<EnterpriseIndexMetadata[]>(
    `SELECT "id","organizationId","sectorCode","moduleCode","confidentiality","language","sourceVersion","dataClassification","extractedText"
     FROM "EnterpriseAiKnowledgeSource"
     WHERE "id"=$1 AND "organizationId"=$2
     LIMIT 1`,
    sourceId,
    organizationId
  );
  return rows[0] || null;
}

export async function indexPreparedEnterpriseAiKnowledgeSource({
  sourceId,
  organizationId,
}: {
  sourceId: string;
  organizationId: string;
}) {
  const source = await readEnterpriseIndexMetadata(sourceId, organizationId);
  if (!source?.extractedText) throw new Error("KNOWLEDGE_SOURCE_NOT_PREPARED");
  try {
    await prisma.enterpriseAiKnowledgeSource.update({
      where: { id: sourceId },
      data: { status: "PROCESSING", errorMessage: null },
    });
    const chunks = chunkKnowledgeText(source.extractedText);
    await indexEnterpriseChunks({
      organizationId,
      sourceId,
      sectorCode: source.sectorCode,
      moduleCode: source.moduleCode,
      language: source.language,
      sourceVersion: source.sourceVersion,
      dataClassification: source.dataClassification,
      chunks,
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "EnterpriseAiKnowledgeSource" SET "indexedAt"=$3 WHERE "id"=$1 AND "organizationId"=$2`,
      sourceId,
      organizationId,
      new Date()
    );
    return prisma.enterpriseAiKnowledgeSource.update({
      where: { id: sourceId },
      data: { status: "READY", errorMessage: null },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (error) {
    await prisma.enterpriseAiKnowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Enterprise AI knowledge indexing failed",
      },
    });
    throw error;
  }
}

export async function indexEnterpriseAiKnowledgeSource(
  input: Parameters<typeof prepareEnterpriseAiKnowledgeSource>[0]
) {
  const prepared = await prepareEnterpriseAiKnowledgeSource(input);
  return indexPreparedEnterpriseAiKnowledgeSource({
    sourceId: prepared.id,
    organizationId: input.organizationId,
  });
}

export async function retrieveEnterpriseAiKnowledge({
  organizationId,
  question,
  sectorCode,
  moduleCode,
  canReadSensitive,
  queryLocale,
}: {
  organizationId: string;
  question: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
  canReadSensitive: boolean;
  queryLocale?: string | null;
}) {
  const allowedConfidentialities = canReadSensitive
    ? ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "MANAGERS_ONLY"]
    : ["PUBLIC", "INTERNAL"];
  const readySources = await prisma.enterpriseAiKnowledgeSource.count({
    where: {
      organizationId,
      status: "READY",
      archivedAt: null,
      confidentiality: { in: allowedConfidentialities },
    },
  });
  if (!readySources) {
    return {
      context: "",
      citations: [] as EnterpriseAiKnowledgeCitation[],
      dataClassifications: [] as AiDataClassification[],
    };
  }

  const embedded = await createProviderEmbedding(question);
  const indexVersion = getEmbeddingIndexVersion(embedded.definition);
  const rows = await prisma.$queryRawUnsafe<EnterpriseKnowledgeRetrievalRow[]>(
    `SELECT kc."id" AS "chunkId", kc."sourceId", ks."title", ks."confidentiality", kc."dataClassification", kc."sourceVersion", kc."indexVersion",
            kc."content", kc."language", kc."pageNumber", kc."section", (kc."embedding" <=> $1::vector) AS distance,
            ts_rank_cd(to_tsvector('simple', kc."content"), plainto_tsquery('simple', $6)) AS "lexicalRank",
            ((1 - LEAST((kc."embedding" <=> $1::vector), 1)) * 0.82 + ts_rank_cd(to_tsvector('simple', kc."content"), plainto_tsquery('simple', $6)) * 0.18) AS "hybridScore"
     FROM "EnterpriseAiKnowledgeChunk" kc
     INNER JOIN "EnterpriseAiKnowledgeSource" ks ON ks."id" = kc."sourceId"
     WHERE kc."organizationId" = $2
       AND ks."organizationId" = $2
       AND ks."status" = 'READY'
       AND ks."archivedAt" IS NULL
       AND ks."confidentiality" = ANY($3::text[])
       AND ($4::text IS NULL OR kc."sectorCode" IS NULL OR kc."sectorCode" = $4)
       AND ($5::text IS NULL OR kc."moduleCode" IS NULL OR kc."moduleCode" = $5)
       AND kc."indexVersion" = ks."indexVersion"
       AND (kc."indexVersion" = $7 OR kc."indexVersion" = 'legacy-openai-1536-v1')
       AND ((kc."embedding" <=> $1::vector) <= 0.55 OR to_tsvector('simple', kc."content") @@ plainto_tsquery('simple', $6))
     ORDER BY "hybridScore" DESC, distance ASC
     LIMIT 18`,
    toVectorLiteral(embedded.embedding),
    organizationId,
    allowedConfidentialities,
    sectorCode || null,
    moduleCode || null,
    question,
    indexVersion
  );

  const reranked = await rerankKnowledgeCandidates({
    query: question,
    candidates: rows.map((row) => ({ id: row.chunkId, score: Number(row.hybridScore), value: row })),
    limit: 6,
  });
  const citations: EnterpriseAiKnowledgeCitation[] = reranked.map(({ value }) => ({
    sourceId: value.sourceId,
    title: value.title,
    confidentiality: value.confidentiality,
    dataClassification: value.dataClassification,
    sourceVersion: value.sourceVersion,
    indexVersion: value.indexVersion,
    content: value.content,
    distance: value.distance,
    lexicalRank: value.lexicalRank,
    hybridScore: value.hybridScore,
    language: value.language,
    pageNumber: value.pageNumber,
    section: value.section,
  }));
  const context = citations
    .map(
      (row, index) =>
        `Source entreprise ${index + 1} - ${row.title} (${row.confidentiality}, ${row.dataClassification}, langue ${row.language}${row.pageNumber ? `, page ${row.pageNumber}` : ""})\n${row.content}`
    )
    .join("\n\n---\n\n");

  return {
    context,
    citations,
    queryLocale: queryLocale || null,
    dataClassifications: Array.from(new Set(citations.map((row) => row.dataClassification))),
  };
}
