import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { uploadPublicPublicationImageToSupabase } from "@/lib/supabase-storage";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_OPTIMIZED_IMAGE_BYTES = 1_600_000;

function toPublicPublicationImageUrl(path: string) {
  return `/api/public/publication-images/${path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}`;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      action: "PUBLIC_PUBLICATION_IMAGE_UPLOADED",
      entity: "PublicPublicationImage",
      entityId: upload.path,
      metadata: { size: file.size, type: file.type },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { path: upload.path } });

    return NextResponse.json({ ok: true, url: toPublicPublicationImageUrl(upload.path), path: upload.path }, { status: 201 });
  } catch (error) {
    console.error("Public publication image upload failed", error);
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Stockage image indisponible" }, { status: 500 });
  }
}
