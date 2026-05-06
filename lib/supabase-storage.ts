import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function isSupabaseStorageConfigured() {
  return Boolean(env.SUPABASE_STORAGE_URL && env.SUPABASE_STORAGE_SERVICE_ROLE_KEY);
}

export async function uploadKnowledgeFileToSupabase({
  userId,
  documentId,
  file,
}: {
  userId: string;
  documentId: string;
  file: File;
}) {
  if (!isSupabaseStorageConfigured()) {
    return null;
  }

  const client = createClient(env.SUPABASE_STORAGE_URL!, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const storagePath = `${userId}/${documentId}/${safeFileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    path: data.path,
  };
}

export async function deleteKnowledgeFileFromSupabase({
  bucket,
  path,
}: {
  bucket?: string | null;
  path?: string | null;
}) {
  if (!bucket || !path || !isSupabaseStorageConfigured()) {
    return { deleted: false };
  }

  const client = createClient(env.SUPABASE_STORAGE_URL!, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Supabase Storage delete failed: ${error.message}`);
  }

  return { deleted: true };
}
