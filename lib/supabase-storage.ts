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

export async function uploadProfileAvatarToSupabase({
  userId,
  file,
}: {
  userId: string;
  file: File;
}) {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage is not configured");
  }

  const client = createClient(env.SUPABASE_STORAGE_URL!, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `avatars/${userId}/profile.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase Storage avatar upload failed: ${error.message}`);
  }

  const { data: publicData } = client.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(data.path);

  return {
    path: data.path,
    publicUrl: publicData.publicUrl,
  };
}

export async function downloadProfileAvatarFromSupabase(path: string) {
  if (!isSupabaseStorageConfigured()) {
    throw new Error("Supabase Storage is not configured");
  }

  const client = createClient(env.SUPABASE_STORAGE_URL!, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).download(path);

  if (error) {
    throw new Error(`Supabase Storage avatar download failed: ${error.message}`);
  }

  return data;
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
