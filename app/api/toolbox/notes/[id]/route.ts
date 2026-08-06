import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { sanitizeRichHtml } from "@/lib/rich-content";

const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  contentHtml: z.string().max(100_000).optional(),
  contentText: z.string().max(30_000).optional(),
  noteType: z.enum(["NOTE", "REMINDER"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "DONE", "ARCHIVED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  color: z.string().trim().max(32).nullable().optional(),
  pinned: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  dueAt: z.string().datetime().nullable().optional().or(z.literal("")),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `toolbox-notes-update:${session.userId}`), 240, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de modifications de notes." }, { status: 429 });
  const { id } = await params;
  const parsed = updateNoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "La note est invalide." }, { status: 400 });
  const existing = await prisma.professionalToolNote.findFirst({ where: { id, userId: session.userId } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND", message: "Note introuvable." }, { status: 404 });
  const nextStatus = parsed.data.status || existing.status;
  const { contentHtml, contentText, labels, dueAt, ...scalarUpdates } = parsed.data;
  const note = await prisma.professionalToolNote.update({
    where: { id: existing.id },
    data: {
      ...scalarUpdates,
      ...(contentHtml !== undefined ? { contentHtml: sanitizeRichHtml(contentHtml) } : {}),
      ...(contentText !== undefined ? { contentText: contentText.trim() } : {}),
      ...(labels !== undefined ? { labels: labels.join(",") } : {}),
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      completedAt: nextStatus === "DONE" ? existing.completedAt || new Date() : null,
      archivedAt: nextStatus === "ARCHIVED" ? existing.archivedAt || new Date() : null,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "PROFESSIONAL_TOOL_NOTE_UPDATED", entity: "ProfessionalToolNote", entityId: note.id, request: req, metadata: { status: note.status, moduleKey: note.moduleKey } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { noteId: note.id } });
  return NextResponse.json({ ok: true, note });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `toolbox-notes-delete:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de suppressions de notes." }, { status: 429 });
  const { id } = await params;
  const existing = await prisma.professionalToolNote.findFirst({ where: { id, userId: session.userId } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND", message: "Note introuvable." }, { status: 404 });
  const note = await prisma.professionalToolNote.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await writeAuditLog({ userId: session.userId, action: "PROFESSIONAL_TOOL_NOTE_ARCHIVED", entity: "ProfessionalToolNote", entityId: note.id, request: req, metadata: { moduleKey: note.moduleKey } });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { noteId: note.id } });
  return NextResponse.json({ ok: true, note });
}
