import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { normalizePositionCode } from "@/lib/business-roles";
import { prisma } from "@/lib/prisma";
import { downloadOperationFileFromSupabase } from "@/lib/supabase-storage";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }

  const { path } = await params;
  const storagePath = path.join("/");
  const ownerId = storagePath.startsWith("operations/") ? storagePath.split("/")[1] || "" : "";
  const canDownload = await canDownloadActivityFile(user.id, user.role, ownerId, storagePath);
  if (!canDownload) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt, metadata: { path: storagePath } });
    return NextResponse.json({ error: "Forbidden", message: "Fichier non autorisé." }, { status: 403 });
  }

  try {
    const file = await downloadOperationFileFromSupabase(storagePath);
    await writeAuditLog({
      userId: user.id,
      action: "ACTIVITY_FILE_DOWNLOADED",
      entity: "ActivityFile",
      entityId: storagePath,
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { path: storagePath } });
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="${safeDownloadName(storagePath)}"`,
      },
    });
  } catch {
    await writeApiLog({ request: req, statusCode: 404, userId: user.id, startedAt, metadata: { path: storagePath } });
    return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}

async function canDownloadActivityFile(userId: string, role: UserRole, ownerId: string, storagePath: string) {
  if (role === UserRole.ADMIN || userId === ownerId) {
    return true;
  }
  if (await canDownloadCollaboratorRequestAttachment(userId, storagePath)) {
    return true;
  }
  const employee = await prisma.hrcfoEmployee.findFirst({
    where: { userId, status: { not: "EXITED" } },
    include: { position: true },
  });
  const positionCode = normalizePositionCode(employee?.position?.code || employee?.positionCode || employee?.jobTitle);
  return positionCode === "LA" || positionCode === "LEGAL_ADVISOR" || positionCode === "CEO";
}

async function canDownloadCollaboratorRequestAttachment(userId: string, storagePath: string) {
  const requests = await prisma.collaboratorRequest.findMany({
    where: {
      OR: [
        { requesterUserId: userId },
        { targetUserId: userId },
        { createdById: userId },
      ],
    },
    select: { attachments: true },
    take: 100,
  });
  return requests.some((request) => extractAttachmentUrls(request.attachments).some((url) => activityFileUrlMatchesPath(url, storagePath)));
}

function extractAttachmentUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (item && typeof item === "object" && "url" in item ? (item as { url?: unknown }).url : null))
    .filter((url): url is string => typeof url === "string" && url.startsWith("/api/activities/files/"));
}

function activityFileUrlMatchesPath(url: string, storagePath: string) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return url.includes(`/api/activities/files/${encodedPath}`);
}

function safeDownloadName(storagePath: string) {
  return (storagePath.split("/").pop() || "document-dtsc").replace(/"/g, "");
}
