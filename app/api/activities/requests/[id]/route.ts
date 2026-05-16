import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

const requestUpdateSchema = z.object({
  status: z.enum(["SUBMITTED", "IN_PROGRESS", "WAITING_RESPONSE", "ANSWERED", "TREATED", "REJECTED", "CANCELED"]).optional(),
  response: z.string().max(2000).optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activities-request-update:${user.id}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: user.id, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de mises à jour de demandes. Réessayez plus tard." }, { status: 429 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } } });
  if (!employee) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur actif." }, { status: 403 });
  }
  const { id } = await params;
  const collaboratorRequest = await prisma.collaboratorRequest.findFirst({
    where: user.role === UserRole.ADMIN
      ? { id }
      : { id, OR: [{ requesterEmployeeId: employee.id }, { targetEmployeeId: employee.id }] },
  });
  if (!collaboratorRequest) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt, metadata: { requestId: id } });
    return NextResponse.json({ error: "Forbidden", message: "Demande introuvable ou non autorisée." }, { status: 403 });
  }
  const parsed = requestUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt, metadata: { requestId: id } });
    return NextResponse.json({ error: "Invalid request update", message: "La mise à jour de la demande est invalide." }, { status: 400 });
  }

  const nextStatus = parsed.data.status || collaboratorRequest.status;
  const updated = await prisma.collaboratorRequest.update({
    where: { id },
    data: {
      status: nextStatus,
      response: parsed.data.response ?? collaboratorRequest.response,
    },
  });

  await notifyRequestUpdate(updated, user.id);
  await writeAuditLog({
    userId: user.id,
    action: "COLLAB_REQUEST_UPDATED",
    entity: "CollaboratorRequest",
    entityId: id,
    request: req,
    metadata: { status: nextStatus },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { requestId: id, status: nextStatus } });
  return NextResponse.json({ ok: true, request: updated });
}

async function notifyRequestUpdate(
  request: { title: string; status: string; requesterUserId: string | null; targetUserId: string | null },
  actorId: string
) {
  const recipients = [...new Set([request.requesterUserId, request.targetUserId].filter((id): id is string => Boolean(id) && id !== actorId))];
  for (const userId of recipients) {
    await prisma.notification.create({
      data: {
        userId,
        title: "Demande collaborateur mise à jour",
        body: `${request.title} est maintenant ${request.status}.`,
        type: "COLLAB_REQUEST",
        targetUrl: "/activities",
      },
    });
  }
}
