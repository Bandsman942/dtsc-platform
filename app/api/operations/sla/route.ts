import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { OPERATIONAL_OBJECT_TYPES, type OperationalObjectType } from "@/lib/operational-access";
import { bindOperationalSlaInstance, canManageOperationalSla, evaluateSlaInstances, listOperationalSlaTargets } from "@/lib/operational-sla";
import { getOperationalSlaReference, isOperationalSlaObjectType } from "@/lib/operational-sla-reference";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const policySchema = z.object({
  action: z.literal("CREATE_POLICY"),
  organizationId: z.string().max(120).optional().or(z.literal("")),
  name: z.string().trim().min(3).max(160),
  objectType: z.enum(OPERATIONAL_OBJECT_TYPES),
  priority: z.string().trim().max(80).optional().or(z.literal("")),
  startStatus: z.string().trim().max(80).optional().or(z.literal("")),
  stopStatuses: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  targetMinutes: z.coerce.number().int().min(5).max(525600),
  warningMinutes: z.coerce.number().int().min(1).max(525599).optional(),
  escalationUserIds: z.array(z.string().min(5).max(120)).max(30).default([]),
}).strict().superRefine((data, ctx) => {
  if (data.warningMinutes && data.warningMinutes >= data.targetMinutes) {
    ctx.addIssue({ code: "custom", path: ["warningMinutes"], message: "L'avertissement doit intervenir avant l'échéance." });
  }
  const reference = getOperationalSlaReference(data.objectType);
  if (!reference) {
    ctx.addIssue({ code: "custom", path: ["objectType"], message: "Type d'objet SLA non pris en charge." });
    return;
  }
  if (data.priority && !reference.priorities.includes(data.priority)) {
    ctx.addIssue({ code: "custom", path: ["priority"], message: "Choisissez une priorité autorisée pour ce type d'objet." });
  }
  if (data.startStatus && !reference.statuses.includes(data.startStatus)) {
    ctx.addIssue({ code: "custom", path: ["startStatus"], message: "Choisissez un statut de démarrage autorisé pour ce type d'objet." });
  }
  for (const status of data.stopStatuses) {
    if (!reference.statuses.includes(status)) {
      ctx.addIssue({ code: "custom", path: ["stopStatuses"], message: "Un statut d'arrêt n'appartient pas au workflow de ce type d'objet." });
      break;
    }
  }
});
const bindSchema = z.object({
  action: z.literal("BIND_INSTANCE"),
  policyId: z.string().min(5).max(120),
  objectType: z.enum(OPERATIONAL_OBJECT_TYPES),
  objectId: z.string().min(5).max(120),
  responsibleUserId: z.string().min(5).max(120).optional().or(z.literal("")),
}).strict();
const evaluateSchema = z.object({ action: z.literal("EVALUATE"), organizationId: z.string().max(120).optional().or(z.literal("")) }).strict();
const archiveSchema = z.object({ action: z.literal("ARCHIVE_POLICY"), policyId: z.string().min(5).max(120) }).strict();
const mutationSchema = z.discriminatedUnion("action", [policySchema, bindSchema, evaluateSchema, archiveSchema]);

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageOperationalSla(user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId") || undefined;
  const targetObjectType = url.searchParams.get("targetObjectType") || "";
  if (targetObjectType && !isOperationalSlaObjectType(targetObjectType)) {
    return NextResponse.json({ error: "Invalid target type", message: "Ce type d'objet SLA n'est pas pris en charge." }, { status: 400 });
  }

  const [policies, instances, targets] = await Promise.all([
    prisma.operationalSlaPolicy.findMany({ where: { ...(organizationId ? { organizationId } : {}), archivedAt: null }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], take: 500 }),
    prisma.operationalSlaInstance.findMany({ where: organizationId ? { organizationId } : {}, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 1000 }),
    targetObjectType ? listOperationalSlaTargets({ user, objectType: targetObjectType as OperationalObjectType }) : Promise.resolve([]),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { domain: "operational_sla", organizationId: organizationId || null, targetObjectType: targetObjectType || null } });
  return NextResponse.json({ policies, instances, targets });
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageOperationalSla(user))) return NextResponse.json({ error: "Forbidden", message: "Permission SLA requise." }, { status: 403 });
  const limited = await rateLimit(getRateLimitKey(req, `operational-sla:${user.id}`), 100, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = mutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", message: parsed.error.issues[0]?.message || "Action SLA invalide." }, { status: 400 });

  if (parsed.data.action === "CREATE_POLICY") {
    const policy = await prisma.operationalSlaPolicy.create({
      data: {
        organizationId: parsed.data.organizationId || null,
        name: parsed.data.name,
        objectType: parsed.data.objectType,
        priority: parsed.data.priority || null,
        startStatus: parsed.data.startStatus || null,
        stopStatusesJson: parsed.data.stopStatuses,
        targetMinutes: parsed.data.targetMinutes,
        warningMinutes: parsed.data.warningMinutes || null,
        escalationJson: { userIds: parsed.data.escalationUserIds },
        createdById: user.id,
      },
    });
    await writeAuditLog({ userId: user.id, action: "OPERATIONAL_SLA_POLICY_CREATED", entity: "OperationalSlaPolicy", entityId: policy.id, request: req, metadata: { objectType: policy.objectType, priority: policy.priority, startStatus: policy.startStatus, stopStatuses: parsed.data.stopStatuses, targetMinutes: policy.targetMinutes, organizationId: policy.organizationId } });
    return NextResponse.json({ ok: true, policy }, { status: 201 });
  }

  if (parsed.data.action === "BIND_INSTANCE") {
    try {
      const instance = await bindOperationalSlaInstance({ user, policyId: parsed.data.policyId, objectType: parsed.data.objectType, objectId: parsed.data.objectId, responsibleUserId: parsed.data.responsibleUserId || null });
      await writeAuditLog({ userId: user.id, action: "OPERATIONAL_SLA_INSTANCE_BOUND", entity: "OperationalSlaInstance", entityId: instance.id, request: req, metadata: { policyId: instance.policyId, objectType: instance.objectType, objectId: instance.objectId } });
      return NextResponse.json({ ok: true, instance }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error ? error.message : "SLA_BIND_FAILED";
      const response = bindFailure(code);
      return NextResponse.json({ error: code, message: response.message }, { status: response.status });
    }
  }

  if (parsed.data.action === "EVALUATE") {
    const results = await evaluateSlaInstances({ organizationId: parsed.data.organizationId || null });
    await writeAuditLog({ userId: user.id, action: "OPERATIONAL_SLA_EVALUATED", entity: "OperationalSlaInstance", request: req, metadata: { evaluatedCount: results.length, organizationId: parsed.data.organizationId || null } });
    return NextResponse.json({ ok: true, results });
  }

  const existing = await prisma.operationalSlaPolicy.findFirst({ where: { id: parsed.data.policyId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const policy = await prisma.operationalSlaPolicy.update({ where: { id: existing.id }, data: { isActive: false, archivedAt: new Date() } });
  await prisma.operationalSlaInstance.updateMany({ where: { policyId: existing.id, status: { in: ["RUNNING", "WARNING"] } }, data: { status: "CANCELED", completedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: "OPERATIONAL_SLA_POLICY_ARCHIVED", entity: "OperationalSlaPolicy", entityId: policy.id, request: req });
  return NextResponse.json({ ok: true, policy });
}

function bindFailure(code: string) {
  if (code === "SLA_POLICY_NOT_FOUND") return { status: 404, message: "La politique SLA sélectionnée est introuvable ou inactive." };
  if (code === "SLA_OBJECT_FORBIDDEN") return { status: 403, message: "Cet objet est introuvable ou n'est pas accessible avec vos droits." };
  if (code === "SLA_POLICY_PRIORITY_MISMATCH") return { status: 409, message: "La priorité actuelle de l'objet ne correspond pas au filtre de cette politique SLA." };
  if (code === "SLA_POLICY_START_STATUS_MISMATCH") return { status: 409, message: "Le statut actuel de l'objet ne correspond pas au statut de démarrage de cette politique SLA." };
  if (code === "SLA_POLICY_STOP_STATUS_REACHED") return { status: 409, message: "L'objet a déjà atteint un statut qui clôt ce suivi SLA." };
  return { status: 400, message: "Impossible de rattacher cette politique SLA à l'objet demandé." };
}
