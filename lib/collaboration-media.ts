import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_AUDIO_MAX_BYTES = 16 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "application/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/3gpp",
  "audio/3gpp2",
]);

function storageClient() {
  if (!env.SUPABASE_STORAGE_URL || !env.SUPABASE_STORAGE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  }
  return createClient(env.SUPABASE_STORAGE_URL, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeCollaborationMimeType(value: string | null | undefined) {
  return String(value || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
}

function safeExtension(file: File) {
  const mimeType = normalizeCollaborationMimeType(file.type);
  const fromName = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("3gpp")) return "3gp";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function expectedPrefix(groupId: string) {
  return `collaboration/${groupId}/`;
}

export function validateCollaborationImage(file: File) {
  if (!IMAGE_TYPES.has(normalizeCollaborationMimeType(file.type))) {
    return { ok: false as const, status: 415, message: "Image non prise en charge. Utilisez JPEG, PNG ou WEBP." };
  }
  if (file.size <= 0 || file.size > IMAGE_MAX_BYTES) {
    return { ok: false as const, status: 413, message: "L’image doit peser au maximum 8 Mo." };
  }
  return { ok: true as const };
}

export function validateCollaborationAudio(file: File, maxBytes = DEFAULT_AUDIO_MAX_BYTES) {
  const mimeType = normalizeCollaborationMimeType(file.type);
  if (!AUDIO_TYPES.has(mimeType)) {
    return { ok: false as const, status: 415, message: `Format audio non pris en charge (${mimeType}). Utilisez un enregistrement WEBM, OGG, M4A, MP4, MP3, AAC, WAV ou 3GP.` };
  }
  if (file.size <= 0 || file.size > maxBytes) {
    return { ok: false as const, status: 413, message: `Le message vocal doit peser au maximum ${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))} Mo.` };
  }
  return { ok: true as const, mimeType };
}

async function upload(groupId: string, category: "avatar" | "stories" | "voice", objectId: string, file: File) {
  const client = storageClient();
  const storagePath = `${expectedPrefix(groupId)}${category}/${objectId}/${randomUUID()}.${safeExtension(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = normalizeCollaborationMimeType(file.type);
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`COLLABORATION_MEDIA_UPLOAD_FAILED:${error.message}`);
  return {
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
    storagePath: data.path,
    mimeType: contentType,
    sizeBytes: file.size,
  };
}

export function uploadGroupAvatar(groupId: string, file: File) {
  return upload(groupId, "avatar", "profile", file);
}

export function uploadGroupStory(groupId: string, storyId: string, file: File) {
  return upload(groupId, "stories", storyId, file);
}

export function uploadVoiceMessage(groupId: string, messageId: string, file: File) {
  return upload(groupId, "voice", messageId, file);
}

export async function createCollaborationMediaSignedUrl(groupId: string, storageBucket: string, storagePath: string, expiresInSeconds = 120) {
  if (storageBucket !== env.SUPABASE_STORAGE_BUCKET || !storagePath.startsWith(expectedPrefix(groupId))) {
    throw new Error("INVALID_COLLABORATION_MEDIA_PATH");
  }
  const client = storageClient();
  const { data, error } = await client.storage.from(storageBucket).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(`COLLABORATION_MEDIA_SIGNED_URL_FAILED:${error?.message || "unknown"}`);
  return data.signedUrl;
}

export async function removeCollaborationMedia(groupId: string, storageBucket: string | null | undefined, storagePath: string | null | undefined) {
  if (!storageBucket || !storagePath) return;
  if (storageBucket !== env.SUPABASE_STORAGE_BUCKET || !storagePath.startsWith(expectedPrefix(groupId))) return;
  const client = storageClient();
  await client.storage.from(storageBucket).remove([storagePath]).catch(() => null);
}
