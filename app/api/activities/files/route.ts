import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { uploadOperationFileToSupabase } from "@/lib/supabase-storage";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const maxFileSize = 10_000_000;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `activities-file-upload:${user.id}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: user.id, startedAt });
    return NextResponse.json({ error: "Trop d'envois de fichiers. Réessayez plus tard." }, { status: 429 });
  }

  const canUpload = user.role === UserRole.ADMIN || await prisma.hrcfoEmployee.count({ where: { userId: user.id, status: { not: "EXITED" } } }) > 0;
  if (!canUpload) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt });
    return NextResponse.json({ error: "Aucun dossier collaborateur actif." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > maxFileSize) {
    await writeApiLog({ request: req, statusCode: 413, userId: user.id, startedAt, metadata: { size: file.size } });
    return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 413 });
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.has(extension) || (file.type && !allowedTypes.has(file.type))) {
    await writeApiLog({ request: req, statusCode: 415, userId: user.id, startedAt, metadata: { type: file.type, extension } });
    return NextResponse.json({ error: "Type de fichier non autorisé." }, { status: 415 });
  }

  try {
    const upload = await uploadOperationFileToSupabase({ userId: user.id, file });
    const url = `/api/activities/files/${upload.path.split("/").map(encodeURIComponent).join("/")}?v=${Date.now()}`;
    await writeAuditLog({
      userId: user.id,
      action: "ACTIVITY_FILE_UPLOADED",
      entity: "ActivityFile",
      entityId: upload.path,
      metadata: { size: file.size, type: file.type, name: file.name },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { path: upload.path } });
    return NextResponse.json({ ok: true, url, path: upload.path }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import impossible.";
    await writeApiLog({ request: req, statusCode: 500, userId: user.id, startedAt, metadata: { message } });
    return NextResponse.json({ error: "Import de fichier impossible. Vérifiez la configuration Supabase Storage." }, { status: 500 });
  }
}
