import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";

function storageClient() {
  if (!isSupabaseStorageConfigured()) throw new Error("ENTERPRISE_BULK_STORAGE_NOT_CONFIGURED");
  return createClient(env.SUPABASE_STORAGE_URL!, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "artifact.bin";
}

function assertTenantPath(organizationId: string, path: string) {
  const prefix = `enterprise-bulk/${organizationId}/`;
  if (!path.startsWith(prefix)) throw new Error("ENTERPRISE_BULK_ARTIFACT_PATH_INVALID");
}

export function isEnterpriseBulkStorageConfigured() {
  return isSupabaseStorageConfigured();
}

export async function uploadEnterpriseBulkArtifact({
  organizationId,
  category,
  filename,
  contentType,
  body,
}: {
  organizationId: string;
  category: "bank-statement-import" | "audit-export";
  filename: string;
  contentType: string;
  body: Buffer | string;
}) {
  const client = storageClient();
  const path = `enterprise-bulk/${organizationId}/${category}/${randomUUID()}-${safeName(filename)}`;
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`ENTERPRISE_BULK_ARTIFACT_UPLOAD_FAILED:${error.message}`);
  return { bucket: env.SUPABASE_STORAGE_BUCKET, path: data.path, size: buffer.byteLength };
}

export async function downloadEnterpriseBulkArtifact({ organizationId, path }: { organizationId: string; path: string }) {
  assertTenantPath(organizationId, path);
  const client = storageClient();
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).download(path);
  if (error) throw new Error(`ENTERPRISE_BULK_ARTIFACT_DOWNLOAD_FAILED:${error.message}`);
  return data;
}

export async function deleteEnterpriseBulkArtifact({ organizationId, path }: { organizationId: string; path: string }) {
  assertTenantPath(organizationId, path);
  if (!isEnterpriseBulkStorageConfigured()) return { deleted: false };
  const client = storageClient();
  const { error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([path]);
  if (error) throw new Error(`ENTERPRISE_BULK_ARTIFACT_DELETE_FAILED:${error.message}`);
  return { deleted: true };
}
