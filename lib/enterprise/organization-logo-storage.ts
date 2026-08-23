import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const ALLOWED_LOGO_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const ORGANIZATION_LOGO_ASSET_PATTERN = /^[0-9a-f-]{36}\.(?:png|jpg|webp)$/i;

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

function expectedOrganizationLogoPrefix(organizationId: string) {
  return `company-logos/${organizationId}/`;
}

function safeOrganizationLogoPath(organizationId: string, candidate: string | null | undefined) {
  if (!candidate) return null;
  const decoded = decodeURIComponent(candidate).replace(/^\/+/, "");
  const prefix = expectedOrganizationLogoPrefix(organizationId);
  if (!decoded.startsWith(prefix)) return null;
  const asset = decoded.slice(prefix.length);
  return ORGANIZATION_LOGO_ASSET_PATTERN.test(asset) ? `${prefix}${asset}` : null;
}

export function resolveOrganizationLogoStoragePath({ organizationId, logoUrl }: { organizationId: string; logoUrl: string | null | undefined }) {
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl, "https://dtsc.invalid");
    const expectedProxyPath = `/api/enterprise/${organizationId}/logo`;
    if (parsed.pathname === expectedProxyPath) {
      const asset = parsed.searchParams.get("asset");
      if (!asset || !ORGANIZATION_LOGO_ASSET_PATTERN.test(asset)) return null;
      return safeOrganizationLogoPath(organizationId, `${expectedOrganizationLogoPrefix(organizationId)}${asset}`);
    }

    const bucketMarker = `/storage/v1/object/public/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/`;
    const decodedPathname = decodeURIComponent(parsed.pathname);
    const markerIndex = decodedPathname.indexOf(bucketMarker);
    if (markerIndex < 0) return null;
    return safeOrganizationLogoPath(organizationId, decodedPathname.slice(markerIndex + bucketMarker.length));
  } catch {
    return null;
  }
}

export function organizationLogoProxyUrl(organizationId: string, logoUrl: string | null | undefined) {
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl, "https://dtsc.invalid");
    if (parsed.pathname === `/api/enterprise/${organizationId}/logo`) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return logoUrl;
  }
  return resolveOrganizationLogoStoragePath({ organizationId, logoUrl })
    ? `/api/enterprise/${organizationId}/logo`
    : logoUrl;
}

export async function uploadOrganizationLogo({ organizationId, file }: { organizationId: string; file: File }) {
  const validation = validateOrganizationLogo(file);
  if (!validation.ok) throw new Error(validation.message);
  const client = storageClient();
  // A candidate receives a unique asset key. It is not considered active until
  // Organization.logoUrl is successfully updated by the settings mutation.
  const assetKey = `${randomUUID()}.${validation.extension}`;
  const storagePath = `${expectedOrganizationLogoPrefix(organizationId)}${assetKey}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`ORGANIZATION_LOGO_UPLOAD_FAILED:${error.message}`);
  return { path: data.path, assetKey };
}

export async function downloadOrganizationLogoFromSupabase({ organizationId, storagePath }: { organizationId: string; storagePath: string }) {
  const safePath = safeOrganizationLogoPath(organizationId, storagePath);
  if (!safePath) throw new Error("ORGANIZATION_LOGO_PATH_INVALID");
  const client = storageClient();
  const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).download(safePath);
  if (error) throw new Error(`ORGANIZATION_LOGO_DOWNLOAD_FAILED:${error.message}`);
  return data;
}
