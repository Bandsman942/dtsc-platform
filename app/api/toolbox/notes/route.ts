import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { sanitizeRichHtml } from "@/lib/rich-content";

const moduleKeySchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);
const createNoteSchema = z.object({
  moduleKey: moduleKeySchema,
  title: z.string().trim().min(1).max(160),
  contentHtml: z.string().max(100_000).default(""),
  contentText: z.string().max(30_000).default(""),
  noteType: z.enum(["NOTE", "REMINDER"]).default("NOTE"),
  status: z.enum(["DRAFT", "ACTIVE", "DONE", "ARCHIVED"]).default("DRAFT"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  labels: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  color: z.string().trim().max(32).optional().or(z.literal("")),
  pinned: z.boolean().default(false),
  dueAt: z.string().datetime().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `toolbox-notes-read:${session.userId}`), 300, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de chargements de notes." }, { status: 429 });

  const url = new URL(req.url);
  const moduleKey = url.searchParams.get("moduleKey") || undefined;
  if (moduleKey && !moduleKeySchema.safeParse(moduleKey).success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Contexte de module invalide." }, { status: 400 });
  }
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const notes = await prisma.professionalToolNote.findMany({
    where: { userId: session.userId, ...(moduleKey ? { moduleKey } : {}), ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { moduleKey: moduleKey || null, count: notes.length } });
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `toolbox-notes-create:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de créations de notes." }, { status: 429 });
  const parsed = createNoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "La note est invalide." }, { status: 400 });

  const note = await prisma.professionalToolNote.create({
    data: {
      userId: session.userId,
      moduleKey: parsed.data.moduleKey,
      title: parsed.data.title,
      contentHtml: sanitizeRichHtml(parsed.data.contentHtml),
      contentText: parsed.data.contentText.trim(),
      noteType: parsed.data.noteType,
      status: parsed.data.status,
      priority: parsed.data.priority,
      labels: parsed.data.labels.join(","),
      color: parsed.data.color || null,
      pinned: parsed.data.pinned,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      completedAt: parsed.data.status === "DONE" ? new Date() : null,
    },
  });
  await writeAuditLog({ userId: session.userId, action: "PROFESSIONAL_TOOL_NOTE_CREATED", entity: "ProfessionalToolNote", entityId: note.id, request: req, metadata: { moduleKey: note.moduleKey, noteType: note.noteType } });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { noteId: note.id, moduleKey: note.moduleKey } });
  return NextResponse.json({ ok: true, note }, { status: 201 });
}
