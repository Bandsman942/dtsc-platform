import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import {
  getOperationalActor,
  operationalChecklistProgress,
  OPERATIONAL_OBJECT_TYPES,
  resolveOperationalObjectAccess,
  type OperationalObjectType,
} from "@/lib/operational-access";
import { calculateDerivedOperationalProgress, syncDerivedOperationalProgress } from "@/lib/operational-progress";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const objectTypeSchema = z.enum(OPERATIONAL_OBJECT_TYPES);
const readSchema = z.object({ objectType: objectTypeSchema, objectId: z.string().min(5).max(120) });
const createSchema = readSchema.extend({ label: z.string().min(2).max(300), position: z.coerce.number().int().min(0).max(10000).optional() });
const updateSchema = z.object({ id: z.string().min(5).max(120), label: z.string().min(2).max(300).optional(), completed: z.boolean().optional(), position: z.coerce.number().int().min(0).max(10000).optional() });
const deleteSchema = z.object({ id: z.string().min(5).max(120) });

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const parsed = readSchema.safeParse({ objectType: url.searchParams.get("objectType"), objectId: url.searchParams.get("objectId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, ...parsed.data, action: "read" });
  if (!access.allowed) return NextResponse.json({ error: access.reason || "Forbidden" }, { status: access.reason === "NOT_FOUND" ? 404 : 403 });
  const result = await operationalChecklistProgress(parsed.data.objectType, parsed.data.objectId);
  const derived = await calculateDerivedOperationalProgress(parsed.data.objectType, parsed.data.objectId);
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: parsed.data });
  return NextResponse.json({ ...result, progress: derived.progress, derivedTotal: derived.total, derivedCompleted: derived.completed, openLinkedTasks: derived.openLinkedTasks, canManage: Boolean(access.capabilities && "canExecute" in access.capabilities ? access.capabilities.canExecute : "canMutate" in access.capabilities ? access.capabilities.canMutate : false) });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `operational-checklist-create:${user.id}`), 240, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: "Élément de checklist invalide." }, { status: 400 });
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, objectType: parsed.data.objectType, objectId: parsed.data.objectId, action: "checklist" });
  if (!access.allowed) return NextResponse.json({ error: access.reason || "Forbidden", message: "Seul le responsable ou le destinataire peut modifier cette checklist." }, { status: access.reason === "NOT_FOUND" ? 404 : 403 });
  const currentCount = await prisma.operationalChecklistItem.count({ where: { objectType: parsed.data.objectType, objectId: parsed.data.objectId, deletedAt: null } });
  const item = await prisma.operationalChecklistItem.create({
    data: {
      objectType: parsed.data.objectType,
      objectId: parsed.data.objectId,
      organizationId: parsed.data.objectType === "CALENDAR_EVENT" && access.object && "organizationId" in access.object ? access.object.organizationId : null,
      label: parsed.data.label,
      position: parsed.data.position ?? currentCount,
      createdById: user.id,
    },
  });
  const derived = await syncDerivedOperationalProgress(parsed.data.objectType, parsed.data.objectId);
  const progress = derived.progress;
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_CHECKLIST_ITEM_CREATED", entity: "OperationalChecklistItem", entityId: item.id, request: req, metadata: { objectType: parsed.data.objectType, objectId: parsed.data.objectId, progress } });
  await writeApiLog({ request: req, statusCode: 201, userId: user.id, startedAt });
  return NextResponse.json({ ok: true, item, ...(await operationalChecklistProgress(parsed.data.objectType, parsed.data.objectId)), progress: derived.progress, derivedTotal: derived.total, derivedCompleted: derived.completed, openLinkedTasks: derived.openLinkedTasks }, { status: 201 });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `operational-checklist-update:${user.id}`), 360, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const existing = await prisma.operationalChecklistItem.findFirst({ where: { id: parsed.data.id, deletedAt: null } });
  if (!existing || !objectTypeSchema.safeParse(existing.objectType).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const objectType = existing.objectType as OperationalObjectType;
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, objectType, objectId: existing.objectId, action: "checklist" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden", message: "Seul le responsable ou le destinataire peut modifier cette checklist." }, { status: 403 });
  const item = await prisma.operationalChecklistItem.update({
    where: { id: existing.id },
    data: {
      label: parsed.data.label,
      position: parsed.data.position,
      completed: parsed.data.completed,
      completedAt: parsed.data.completed === undefined ? undefined : parsed.data.completed ? new Date() : null,
      completedById: parsed.data.completed === undefined ? undefined : parsed.data.completed ? user.id : null,
    },
  });
  const derived = await syncDerivedOperationalProgress(objectType, existing.objectId);
  const progress = derived.progress;
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_CHECKLIST_ITEM_UPDATED", entity: "OperationalChecklistItem", entityId: item.id, request: req, metadata: { objectType, objectId: existing.objectId, progress } });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ ok: true, item, ...(await operationalChecklistProgress(objectType, existing.objectId)), progress: derived.progress, derivedTotal: derived.total, derivedCompleted: derived.completed, openLinkedTasks: derived.openLinkedTasks });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `operational-checklist-delete:${user.id}`), 180, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const existing = await prisma.operationalChecklistItem.findFirst({ where: { id: parsed.data.id, deletedAt: null } });
  if (!existing || !objectTypeSchema.safeParse(existing.objectType).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const objectType = existing.objectType as OperationalObjectType;
  const actor = await getOperationalActor(user);
  const access = await resolveOperationalObjectAccess({ actor, objectType, objectId: existing.objectId, action: "checklist" });
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.operationalChecklistItem.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  const derived = await syncDerivedOperationalProgress(objectType, existing.objectId);
  const progress = derived.progress;
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_CHECKLIST_ITEM_DELETED", entity: "OperationalChecklistItem", entityId: existing.id, request: req, metadata: { objectType, objectId: existing.objectId, progress } });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ ok: true, ...(await operationalChecklistProgress(objectType, existing.objectId)), progress: derived.progress, derivedTotal: derived.total, derivedCompleted: derived.completed, openLinkedTasks: derived.openLinkedTasks });
}
