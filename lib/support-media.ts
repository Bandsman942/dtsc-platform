import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const SUPPORT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

function storage() {
  if (!env.SUPABASE_STORAGE_URL || !env.SUPABASE_STORAGE_SERVICE_ROLE_KEY || !env.SUPABASE_STORAGE_BUCKET) {
    throw new Error("SUPPORT_PRIVATE_STORAGE_UNAVAILABLE");
  }
  return createClient(env.SUPABASE_STORAGE_URL, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(env.SUPABASE_STORAGE_BUCKET);
}

export function validateSupportPhoto(file: File) {
  if (!MIME.has(file.type.toLowerCase())) return { ok: false as const, status: 415, message: "Formats acceptés : JPEG, PNG et WebP." };
  if (file.size <= 0 || file.size > SUPPORT_PHOTO_MAX_BYTES) return { ok: false as const, status: 413, message: "La photo doit peser au maximum 8 Mo." };
  return { ok: true as const };
}

function signatureIsValid(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function uploadSupportPhoto(ticketId: string, file: File) {
  const validation = validateSupportPhoto(file);
  if (!validation.ok) throw new Error(validation.message);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!signatureIsValid(bytes, file.type)) throw new Error("Le fichier ne contient pas une image valide.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `support/tickets/${ticketId}/${randomUUID()}.${extension}`;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const { error } = await storage().upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw new Error("L'enregistrement privé de l'image a échoué.");
  return { storageBucket: bucket, storagePath: path, mimeType: file.type, sizeBytes: file.size };
}

export async function createSupportPhotoUrl(ticketId: string, bucket: string, path: string) {
  if (bucket !== env.SUPABASE_STORAGE_BUCKET || !path.startsWith(`support/tickets/${ticketId}/`)) {
    throw new Error("UNAUTHORIZED_SUPPORT_MEDIA_PATH");
  }
  const { data, error } = await storage().createSignedUrl(path, 90);
  if (error || !data?.signedUrl) throw new Error("SUPPORT_MEDIA_NOT_AVAILABLE");
  return data.signedUrl;
}

export async function removeSupportPhoto(ticketId: string, bucket: string, path: string) {
  if (bucket === env.SUPABASE_STORAGE_BUCKET && path.startsWith(`support/tickets/${ticketId}/`)) {
    await storage().remove([path]).catch(() => null);
  }
}
