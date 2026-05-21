import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { getAppSettings } from "@/lib/settings";
import { uploadPublicPublicationImageToSupabase } from "@/lib/supabase-storage";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_OPTIMIZED_IMAGE_BYTES = 1_600_000;

function canPublishAnnouncement(role: UserRole, allowClients: boolean) {
  return allowClients || role === UserRole.ADMIN || role === UserRole.MANAGER || role === UserRole.SUPPORT;
}

function toPublicPublicationImageUrl(path: string) {
  return `/api/public/publication-images/${path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}`;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `announcement-image-upload:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'images envoyées. Réessayez plus tard." }, { status: 429 });
  }

  const settings = await getAppSettings();
  if (!canPublishAnnouncement(session.role, settings.allowClientAnnouncements)) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Publication non autorisée." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Image manquante" }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    await writeApiLog({ request: req, statusCode: 415, userId: session.userId, startedAt, metadata: { type: file.type } });
    return NextResponse.json({ error: "Format image non supporté" }, { status: 415 });
  }

  if (file.size > MAX_OPTIMIZED_IMAGE_BYTES) {
    await writeApiLog({ request: req, statusCode: 413, userId: session.userId, startedAt, metadata: { size: file.size } });
    return NextResponse.json({ error: "Image trop lourde après optimisation" }, { status: 413 });
  }

  try {
    const upload = await uploadPublicPublicationImageToSupabase({ userId: session.userId, file });
    await writeAuditLog({
      userId: session.userId,
      action: "ANNOUNCEMENT_IMAGE_UPLOADED",
      entity: "AnnouncementImage",
      entityId: upload.path,
      metadata: { size: file.size, type: file.type },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { path: upload.path } });
    return NextResponse.json({ ok: true, url: toPublicPublicationImageUrl(upload.path), path: upload.path }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stockage image indisponible";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { message } });
    return NextResponse.json({ error: "Stockage image indisponible" }, { status: 500 });
  }
}
