import { randomUUID } from "node:crypto";
import { DocumentStatus } from "@prisma/client";
import { env, requireEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { uploadKnowledgeFileToSupabase } from "@/lib/supabase-storage";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_CHARS = 1_200;
const CHUNK_OVERLAP_CHARS = 180;
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
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  if (!isSupportedKnowledgeFile(file)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { default: parsePdf } = await import("@cedrugs/pdf-parse");
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parsePdf(buffer);
    const pdfText = String(parsed.text || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
    if (pdfText.length < 40) {
      throw new Error("EMPTY_DOCUMENT");
    }
    return pdfText.slice(0, 120_000);
  }

  const text = await file.text();
  const normalized = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (normalized.length < 40) {
    throw new Error("EMPTY_DOCUMENT");
  }

  return normalized.slice(0, 120_000);
}

export function chunkText(text: string) {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = text.slice(cursor, cursor + MAX_CHUNK_CHARS);
    const lastBreak = next.lastIndexOf("\n\n");
    const chunk = lastBreak > 400 ? next.slice(0, lastBreak) : next;
    chunks.push(chunk.trim());
    if (cursor + MAX_CHUNK_CHARS >= text.length) {
      break;
    }
    cursor += Math.max(chunk.length - CHUNK_OVERLAP_CHARS, 1);
  }

  return chunks.filter(Boolean).slice(0, 120);
}

export async function createEmbedding(input: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_EMBEDDING_MODEL,
      input,
    }),
  });

  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed with status ${response.status}`);
  }

  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("OpenAI embeddings response is invalid");
  }

  const values = embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
  if (values.length !== 1536) {
    throw new Error("Embedding dimension must be 1536 for the current pgvector schema");
  }

  return values;
}

function toVectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function indexKnowledgeDocument({
  userId,
  title,
  file,
}: {
  userId: string;
  title?: string;
  file: File;
}) {
  const document = await prisma.knowledgeDocument.create({
    data: {
      userId,
      title: title || file.name,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      status: DocumentStatus.PROCESSING,
    },
  });

  try {
    const storage = await uploadKnowledgeFileToSupabase({ userId, documentId: document.id, file });
    const extractedText = await extractKnowledgeText(file);
    const chunks = chunkText(extractedText);

    for (const chunk of chunks) {
      const embedding = await createEmbedding(chunk);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "KnowledgeChunk" ("id", "documentId", "userId", "content", "tokenHint", "embedding")
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        randomUUID(),
        document.id,
        userId,
        chunk,
        Math.ceil(chunk.length / 4),
        toVectorLiteral(embedding)
      );
    }

    return prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.READY,
        extractedText,
        storageBucket: storage?.bucket,
        storagePath: storage?.path,
      },
      include: { _count: { select: { chunks: true } } },
    });
  } catch (error) {
    await prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Document indexing failed",
      },
    });
    throw error;
  }
}

export async function retrieveKnowledgeContext(userId: string, question: string) {
  const readyDocuments = await prisma.knowledgeDocument.count({
    where: { userId, status: DocumentStatus.READY },
  });
  if (!readyDocuments) {
    return "";
  }

  const embedding = await createEmbedding(question);
  const vector = toVectorLiteral(embedding);
  const rows = await prisma.$queryRawUnsafe<Array<{ content: string; title: string; distance: number }>>(
    `SELECT kc."content", kd."title", (kc."embedding" <=> $1::vector) AS distance
     FROM "KnowledgeChunk" kc
     INNER JOIN "KnowledgeDocument" kd ON kd."id" = kc."documentId"
     WHERE kc."userId" = $2 AND kd."status" = 'READY'
     ORDER BY kc."embedding" <=> $1::vector
     LIMIT 5`,
    vector,
    userId
  );

  if (!rows.length) {
    return "";
  }

  return rows
    .map((row, index) => `Source ${index + 1} - ${row.title}\n${row.content}`)
    .join("\n\n---\n\n");
}

export const knowledgeUploadLimits = {
  maxUploadBytes: MAX_UPLOAD_BYTES,
  supportedTypes: Array.from(SUPPORTED_TEXT_MIME_TYPES),
};
