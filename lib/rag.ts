import { createHash, randomUUID } from "node:crypto";
import { DocumentStatus } from "@prisma/client";
import { createEmbedding as createProviderEmbedding, createEmbeddings, getEmbeddingIndexVersion } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/prisma";
import { uploadKnowledgeFileToSupabase } from "@/lib/supabase-storage";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_CHARS = 1_200;
const CHUNK_OVERLAP_CHARS = 180;
export const RAG_CHUNKING_VERSION = "char-overlap-v2";
const SUPPORTED_TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "application/pdf",
]);

export function isSupportedKnowledgeFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    SUPPORTED_TEXT_MIME_TYPES.has(file.type) ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".pdf")
  );
}

export async function extractKnowledgeText(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  if (!isSupportedKnowledgeFile(file)) throw new Error("UNSUPPORTED_FILE_TYPE");

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { default: parsePdf } = await import("@cedrugs/pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parsePdf(buffer);
    const pdfText = String(parsed.text || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
    if (pdfText.length < 40) throw new Error("EMPTY_DOCUMENT");
    return pdfText.slice(0, 120_000);
  }

  const text = await file.text();
  const normalized = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (normalized.length < 40) throw new Error("EMPTY_DOCUMENT");
  return normalized.slice(0, 120_000);
}

export type KnowledgeChunkInput = {
  content: string;
  offsetStart: number;
  offsetEnd: number;
  pageNumber: number | null;
  section: string | null;
  contentHash: string;
};

function chunkHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function chunkKnowledgeText(text: string): KnowledgeChunkInput[] {
  const chunks: KnowledgeChunkInput[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = text.slice(cursor, cursor + MAX_CHUNK_CHARS);
    const lastBreak = next.lastIndexOf("\n\n");
    const raw = lastBreak > 400 ? next.slice(0, lastBreak) : next;
    const content = raw.trim();
    if (content) {
      const contentStart = cursor + Math.max(raw.indexOf(content), 0);
      chunks.push({
        content,
        offsetStart: contentStart,
        offsetEnd: contentStart + content.length,
        pageNumber: null,
        section: null,
        contentHash: chunkHash(content),
      });
    }
    if (cursor + MAX_CHUNK_CHARS >= text.length) break;
    cursor += Math.max(raw.length - CHUNK_OVERLAP_CHARS, 1);
  }
  return chunks.slice(0, 120);
}

export function chunkText(text: string) {
  return chunkKnowledgeText(text).map((chunk) => chunk.content);
}

export async function createEmbedding(input: string) {
  const result = await createProviderEmbedding(input);
  return result.embedding;
}

export function toVectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

async function indexPersonalChunks({
  documentId,
  userId,
  organizationId,
  language,
  sourceVersion,
  chunks,
}: {
  documentId: string;
  userId: string;
  organizationId: string | null;
  language: string;
  sourceVersion: number;
  chunks: KnowledgeChunkInput[];
}) {
  const batchSize = 48;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const batch = chunks.slice(offset, offset + batchSize);
    const embedded = await createEmbeddings(batch.map((chunk) => chunk.content));
    const indexVersion = getEmbeddingIndexVersion(embedded.definition);
    for (let index = 0; index < batch.length; index += 1) {
      const chunk = batch[index];
      const embedding = embedded.embeddings[index];
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk"
          ("id", "documentId", "userId", "organizationId", "content", "tokenHint", "language", "pageNumber", "section", "offsetStart", "offsetEnd", "embedding", "embeddingProviderCode", "embeddingModelCode", "embeddingDimension", "indexVersion", "chunkingVersion", "sourceVersion", "contentHash")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT DO NOTHING`,
        randomUUID(), documentId, userId, organizationId, chunk.content, Math.ceil(chunk.content.length / 4), language,
        chunk.pageNumber, chunk.section, chunk.offsetStart, chunk.offsetEnd, toVectorLiteral(embedding),
        embedded.definition.providerCode, embedded.definition.modelCode, embedded.definition.dimension, indexVersion,
        RAG_CHUNKING_VERSION, sourceVersion, chunk.contentHash,
      );
    }
  }
}

export async function indexKnowledgeDocument({
  userId,
  organizationId = null,
  title,
  language = "fr",
  file,
}: {
  userId: string;
  organizationId?: string | null;
  title?: string;
  language?: string;
  file: File;
}) {
  const document = await prisma.knowledgeDocument.create({
    data: {
      userId,
      organizationId,
      title: title || file.name,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      status: DocumentStatus.PROCESSING,
      language: language === "en" ? "en" : "fr",
    },
  });

  try {
    const storage = await uploadKnowledgeFileToSupabase({ userId, documentId: document.id, file });
    const extractedText = await extractKnowledgeText(file);
    const chunks = chunkKnowledgeText(extractedText);
    const embeddingDefinition = (await createEmbeddings([])).definition;
    const indexVersion = getEmbeddingIndexVersion(embeddingDefinition);

    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeDocument"
       SET "embeddingProviderCode"=$2,"embeddingModelCode"=$3,"embeddingDimension"=$4,"indexVersion"=$5,"chunkingVersion"=$6
       WHERE "id"=$1`,
      document.id, embeddingDefinition.providerCode, embeddingDefinition.modelCode, embeddingDefinition.dimension, indexVersion, RAG_CHUNKING_VERSION,
    );

    await indexPersonalChunks({
      documentId: document.id,
      userId,
      organizationId,
      language: language === "en" ? "en" : "fr",
      sourceVersion: document.versionNumber,
      chunks,
    });

    const indexedAt = new Date();
    await prisma.$executeRawUnsafe(`UPDATE "KnowledgeDocument" SET "indexedAt"=$2 WHERE "id"=$1`, document.id, indexedAt);
    return prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: DocumentStatus.READY, extractedText, storageBucket: storage?.bucket, storagePath: storage?.path },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (error) {
    await prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: DocumentStatus.FAILED, errorMessage: error instanceof Error ? error.message : "Document indexing failed" },
    });
    throw error;
  }
}

export async function retrieveKnowledgeContext(userId: string, question: string, organizationId: string | null = null) {
  const readyDocuments = await prisma.knowledgeDocument.count({ where: { userId, organizationId, status: DocumentStatus.READY } });
  if (!readyDocuments) return "";

  const embedded = await createProviderEmbedding(question);
  const vector = toVectorLiteral(embedded.embedding);
  const indexVersion = getEmbeddingIndexVersion(embedded.definition);
  const rows = await prisma.$queryRawUnsafe<Array<{ content: string; title: string; distance: number; lexicalRank: number; hybridScore: number }>>(
    `SELECT kc."content", kd."title",
            (kc."embedding" <=> $1::vector) AS distance,
            ts_rank_cd(to_tsvector('simple', kc."content"), plainto_tsquery('simple', $4)) AS "lexicalRank",
            ((1 - LEAST((kc."embedding" <=> $1::vector), 1)) * 0.82 +
             ts_rank_cd(to_tsvector('simple', kc."content"), plainto_tsquery('simple', $4)) * 0.18) AS "hybridScore"
     FROM "KnowledgeChunk" kc
     INNER JOIN "KnowledgeDocument" kd ON kd."id" = kc."documentId"
     WHERE kc."userId" = $2
       AND kd."organizationId" IS NOT DISTINCT FROM $3
       AND kd."status" = 'READY'
       AND kc."indexVersion" = kd."indexVersion"
       AND (kc."indexVersion" = $5 OR kc."indexVersion" = 'legacy-openai-1536-v1')
       AND ((kc."embedding" <=> $1::vector) <= 0.55 OR to_tsvector('simple', kc."content") @@ plainto_tsquery('simple', $4))
     ORDER BY "hybridScore" DESC, distance ASC
     LIMIT 5`,
    vector, userId, organizationId, question, indexVersion,
  );

  if (!rows.length) return "";
  return rows.map((row, index) => `Source ${index + 1} - ${row.title}\n${row.content}`).join("\n\n---\n\n");
}

export const knowledgeUploadLimits = {
  maxUploadBytes: MAX_UPLOAD_BYTES,
  supportedTypes: Array.from(SUPPORTED_TEXT_MIME_TYPES),
};
