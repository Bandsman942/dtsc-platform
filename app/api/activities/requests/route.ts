import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  title: z.string().min(2).max(180),
  requestType: z.enum(["INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"]).default("INFORMATION"),
  targetEmployeeId: z.string().min(5),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  relatedEntityType: z.string().max(80).optional().or(z.literal("")),
  relatedEntityId: z.string().max(120).optional().or(z.literal("")),
  message: z.string().min(5).max(2500),
  attachments: z.array(z.object({
    name: z.string().min(1).max(220),
    url: z.string().regex(/^\/api\/activities\/files\/.+/).max(900),
    type: z.string().max(160).optional().or(z.literal("")),
    size: z.number().int().min(0).max(10_000_000),
    uploadedAt: z.string().datetime(),
    uploadedBy: z.string().max(160).optional().or(z.literal("")),
  })).max(8).default([]),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `activities-requests:${user.id}`), 30, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: user.id, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop de demandes envoyées. Réessayez plus tard." }, { status: 429 });
  }
  const employee = await prisma.hrcfoEmployee.findFirst({ where: { userId: user.id, status: { not: "EXITED" } } });
  if (!employee) {
    return NextResponse.json({ error: "Forbidden", message: "Aucun dossier collaborateur actif." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid request", message: "La demande collaborateur est invalide." }, { status: 400 });
  }
  if (parsed.data.targetEmployeeId === employee.id) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid recipient", message: "Choisissez un autre collaborateur comme destinataire." }, { status: 400 });
  }

  const target = await prisma.hrcfoEmployee.findFirst({
    where: { id: parsed.data.targetEmployeeId, status: { not: "EXITED" } },
    select: { id: true, fullName: true, userId: true },
  });
  if (!target) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid recipient", message: "Destinataire collaborateur introuvable." }, { status: 400 });
  }

  const attachments = parsed.data.attachments.map((attachment) => ({
    name: attachment.name,
    url: attachment.url,
    type: attachment.type || "",
    size: attachment.size,
    uploadedAt: attachment.uploadedAt,
    ...(attachment.uploadedBy ? { uploadedBy: attachment.uploadedBy } : {}),
  }));

  const collaboratorRequest = await prisma.collaboratorRequest.create({
    data: {
      title: parsed.data.title,
      requestType: parsed.data.requestType,
      requesterEmployeeId: employee.id,
      requesterName: employee.fullName,
      requesterUserId: user.id,
      targetEmployeeId: target.id,
      targetName: target.fullName,
      targetUserId: target.userId,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      relatedEntityType: parsed.data.relatedEntityType || null,
      relatedEntityId: parsed.data.relatedEntityId || null,
      message: parsed.data.message,
      attachments,
      status: "SUBMITTED",
      createdById: user.id,
    },
  });

  if (target.userId && target.userId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: target.userId,
        title: "Nouvelle demande collaborateur",
        body: `${employee.fullName} vous a envoyé une demande: ${parsed.data.title}.`,
        type: "COLLAB_REQUEST",
        targetUrl: "/activities",
      },
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: "COLLAB_REQUEST_CREATED",
    entity: "CollaboratorRequest",
    entityId: collaboratorRequest.id,
    request: req,
    metadata: { targetEmployeeId: target.id, priority: parsed.data.priority, attachmentCount: attachments.length },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt, metadata: { requestId: collaboratorRequest.id } });
  return NextResponse.json({ ok: true, request: collaboratorRequest }, { status: 201 });
}
