import { randomUUID } from "node:crypto";
import { createEmbedding, chunkText, extractKnowledgeText, isSupportedKnowledgeFile, knowledgeUploadLimits, toVectorLiteral } from "@/lib/rag";
import { prisma } from "@/lib/prisma";
import { uploadEnterpriseAiKnowledgeFileToSupabase } from "@/lib/supabase-storage";
import type { EnterpriseAiAccess } from "@/lib/enterprise-ai/access";

export type EnterpriseAiKnowledgeCitation = {
  sourceId: string;
  title: string;
  confidentiality: string;
  content: string;
  distance: number;
};

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function canIndexEnterpriseAiFile(file: File) {
  return file.size <= knowledgeUploadLimits.maxUploadBytes && isSupportedKnowledgeFile(file);
}

export async function assertEnterpriseAiKnowledgeQuota(organizationId: string, file: File, access: EnterpriseAiAccess) {
  const [sourceCount, sourceStorage] = await Promise.all([
    prisma.enterpriseAiKnowledgeSource.count({ where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } } }),
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

export async function indexEnterpriseAiKnowledgeSource({
  organizationId,
  assistantId,
  userId,
  sectorCode,
  moduleCode,
  title,
  confidentiality,
  file,
}: {
  organizationId: string;
  assistantId: string;
  userId: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
  title?: string | null;
  confidentiality: string;
  file: File;
}) {
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
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      createdById: userId,
    },
  });

  try {
    const storage = await uploadEnterpriseAiKnowledgeFileToSupabase({ organizationId, sourceId: source.id, file });
    const extractedText = await extractKnowledgeText(file);
    const chunks = chunkText(extractedText);

    for (const chunk of chunks) {
      const embedding = await createEmbedding(chunk);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EnterpriseAiKnowledgeChunk" ("id", "organizationId", "sourceId", "sectorCode", "moduleCode", "content", "tokenHint", "embedding")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
        randomUUID(),
        organizationId,
        source.id,
        normalizeOptional(sectorCode),
        normalizeOptional(moduleCode),
        chunk,
        Math.ceil(chunk.length / 4),
        toVectorLiteral(embedding)
      );
    }

    return prisma.enterpriseAiKnowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "READY",
        extractedText,
        storageBucket: storage?.bucket || null,
        storagePath: storage?.path || null,
      },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (error) {
    await prisma.enterpriseAiKnowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Enterprise AI knowledge indexing failed",
      },
    });
    throw error;
  }
}

export async function retrieveEnterpriseAiKnowledge({
  organizationId,
  question,
  sectorCode,
  moduleCode,
  canReadSensitive,
}: {
  organizationId: string;
  question: string;
  sectorCode?: string | null;
  moduleCode?: string | null;
  canReadSensitive: boolean;
}) {
  const allowedConfidentialities = canReadSensitive ? ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "MANAGERS_ONLY"] : ["PUBLIC", "INTERNAL"];
  const readySources = await prisma.enterpriseAiKnowledgeSource.count({
    where: {
      organizationId,
      status: "READY",
      archivedAt: null,
      confidentiality: { in: allowedConfidentialities },
    },
  });
  if (!readySources) {
    return { context: "", citations: [] as EnterpriseAiKnowledgeCitation[] };
  }

  const embedding = await createEmbedding(question);
  const rows = await prisma.$queryRawUnsafe<EnterpriseAiKnowledgeCitation[]>(
    `SELECT kc."sourceId", ks."title", ks."confidentiality", kc."content", (kc."embedding" <=> $1::vector) AS distance
     FROM "EnterpriseAiKnowledgeChunk" kc
     INNER JOIN "EnterpriseAiKnowledgeSource" ks ON ks."id" = kc."sourceId"
     WHERE kc."organizationId" = $2
       AND ks."organizationId" = $2
       AND ks."status" = 'READY'
       AND ks."archivedAt" IS NULL
       AND ks."confidentiality" = ANY($3::text[])
       AND ($4::text IS NULL OR kc."sectorCode" IS NULL OR kc."sectorCode" = $4)
       AND ($5::text IS NULL OR kc."moduleCode" IS NULL OR kc."moduleCode" = $5)
     ORDER BY kc."embedding" <=> $1::vector
     LIMIT 6`,
    toVectorLiteral(embedding),
    organizationId,
    allowedConfidentialities,
    sectorCode || null,
    moduleCode || null
  );

  const context = rows
    .map((row, index) => `Source entreprise ${index + 1} - ${row.title} (${row.confidentiality})\n${row.content}`)
    .join("\n\n---\n\n");

  return { context, citations: rows };
}
