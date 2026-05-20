import { NextResponse } from "next/server";
import { requireAdminBlockAccess } from "@/lib/admin-api";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { uploadOperationFileToSupabase } from "@/lib/supabase-storage";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
const maxFileSize = 6_000_000;
const operationFileBlocks = ["coo", "hrCfo", "sco", "mpo", "cto", "la", "ceo"] as const;

export async function POST(req: Request) {
  const startedAt = Date.now();
  let lastResponse: NextResponse | undefined;
  for (const blockId of operationFileBlocks) {
    const { session, response } = await requireAdminBlockAccess(blockId);
    if (session) {
      return uploadForSession(req, session.userId, startedAt);
    }
    lastResponse = response;
  }
  await writeApiLog({ request: req, statusCode: 403, startedAt });
  return lastResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function uploadForSession(req: Request, userId: string, startedAt: number) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    await writeApiLog({ request: req, statusCode: 400, userId, startedAt });
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (file.size > maxFileSize) {
    await writeApiLog({ request: req, statusCode: 413, userId, startedAt, metadata: { size: file.size } });
    return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 413 });
  }
  if (file.type && !allowedTypes.has(file.type)) {
    await writeApiLog({ request: req, statusCode: 415, userId, startedAt, metadata: { type: file.type } });
    return NextResponse.json({ error: "Type de fichier non autorisé." }, { status: 415 });
  }

  try {
    const upload = await uploadOperationFileToSupabase({ userId, file });
    await writeAuditLog({
      userId,
      action: "OPERATION_FILE_UPLOADED",
      entity: "OperationFile",
      entityId: upload.path,
      metadata: { size: file.size, type: file.type, name: file.name },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 201, userId, startedAt, metadata: { path: upload.path } });
    return NextResponse.json({ ok: true, url: upload.url, path: upload.path }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import impossible.";
    await writeApiLog({ request: req, statusCode: 500, userId, startedAt, metadata: { message } });
    return NextResponse.json({ error: "Import de fichier impossible. Vérifiez la configuration Supabase Storage." }, { status: 500 });
  }
}
