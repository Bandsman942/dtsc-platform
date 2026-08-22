import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const ALLOWED_LOGO_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export const ORGANIZATION_LOGO_MAX_BYTES = 2 * 1024 * 1024;

function storageClient() {
  if (!env.SUPABASE_STORAGE_URL || !env.SUPABASE_STORAGE_SERVICE_ROLE_KEY) {
    throw new Error("ORGANIZATION_LOGO_STORAGE_NOT_CONFIGURED");
  }
  return createClient(env.SUPABASE_STORAGE_URL, env.SUPABASE_STORAGE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function validateOrganizationLogo(file: File) {
  const extension = ALLOWED_LOGO_TYPES.get(file.type);
  if (!extension) return { ok: false as const, message: "Utilisez une image PNG, JPG ou WebP." };
  if (file.size <= 0) return { ok: false as const, message: "Le fichier sélectionné est vide." };
  if (file.size > ORGANIZATION_LOGO_MAX_BYTES) return { ok: false as const, message: "Le logo ne doit pas dépasser 2 Mo." };
  return { ok: true as const, extension };
}

export async function uploadOrganizationLogo({ organizationId, file }: { organizationId: string; file: File }) {
  const validation = validateOrganizationLogo(file);
  if (!validation.ok) throw new Error(validation.message);
  const client = storageClient();
  // Candidate path: the currently saved logo is never overwritten before the
  // settings mutation succeeds. A failed form submission therefore leaves the
  // active branding unchanged.
  const storagePath = `company-logos/${organizationId}/${randomUUID()}.${validation.extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`ORGANIZATION_LOGO_UPLOAD_FAILED:${error.message}`);
  const { data: publicData } = client.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(data.path);
  if (!publicData.publicUrl) throw new Error("ORGANIZATION_LOGO_PUBLIC_URL_FAILED");
  return { path: data.path, publicUrl: publicData.publicUrl };
}