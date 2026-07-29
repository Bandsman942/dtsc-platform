import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const ENTERPRISE_DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ENTERPRISE_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function storageClient() {
  if (!env.SUPABASE_STORAGE_URL || !env.SUPABASE_STORAGE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  }
  return createClient(env.SUPABASE_STORAGE_URL, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function validateEnterpriseDocumentFile(file: File) {
  if (!ENTERPRISE_DOCUMENT_ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false as const, status: 415, message: "Ce format de fichier n’est pas autorisé." };
  }
  if (file.size <= 0 || file.size > ENTERPRISE_DOCUMENT_MAX_FILE_SIZE) {
    return { ok: false as const, status: 413, message: "Le fichier doit être compris entre 1 octet et 10 Mo." };
  }
  return { ok: true as const };
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
}

function expectedPrefix(organizationId: string, documentId: string) {
  return `enterprise/${organizationId}/documents/${documentId}/`;
}

export async function uploadEnterpriseDocumentVersion({
  organizationId,
  documentId,
  versionNumber,
  file,
}: {
  organizationId: string;
  documentId: string;
  versionNumber: number;
  file: File;
}) {
  const validation = validateEnterpriseDocumentFile(file);
  if (!validation.ok) throw new Error(validation.message);
  const client = storageClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${expectedPrefix(organizationId, documentId)}v${versionNumber}/${randomUUID()}-${safeName(file.name)}`;
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`ENTERPRISE_DOCUMENT_UPLOAD_FAILED:${error.message}`);
  return {
    storageProvider: "SUPABASE",
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    storagePath: data.path,
    checksum,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function createEnterpriseDocumentSignedUrl({
  organizationId,
  documentId,
  storageBucket,
  storagePath,
  expiresInSeconds = 120,
}: {
  organizationId: string;
  documentId: string;
  storageBucket: string;
  storagePath: string;
  expiresInSeconds?: number;
}) {
  if (storageBucket !== env.SUPABASE_STORAGE_BUCKET || !storagePath.startsWith(expectedPrefix(organizationId, documentId))) {
    throw new Error("INVALID_ENTERPRISE_DOCUMENT_STORAGE_PATH");
  }
  const client = storageClient();
  const { data, error } = await client.storage.from(storageBucket).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`ENTERPRISE_DOCUMENT_SIGNED_URL_FAILED:${error?.message || "unknown"}`);
  return data.signedUrl;
}
