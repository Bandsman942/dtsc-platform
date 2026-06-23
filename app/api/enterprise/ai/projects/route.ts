import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { enterpriseAiProjectCreateSchema, enterpriseAiProjectDeleteSchema, enterpriseAiProjectUpdateSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_project_create_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-project:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les projets IA." }, { status: 429 });
  }
  const parsed = enterpriseAiProjectCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Nom de projet IA invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const existing = await prisma.enterpriseAiConversationProject.findFirst({
    where: { organizationId: data.organizationId, userId: session.userId, name: data.name },
    select: { id: true, name: true, updatedAt: true },
  });
  const project = existing || await prisma.enterpriseAiConversationProject.create({
    data: { organizationId: data.organizationId, userId: session.userId, name: data.name },
    select: { id: true, name: true, updatedAt: true },
  });
  await writeAuditLog({
    userId: session.userId,
    action: existing ? "ENTERPRISE_AI_PROJECT_REUSED" : "ENTERPRISE_AI_PROJECT_CREATED",
    entity: "EnterpriseAiConversationProject",
    entityId: project.id,
    request: req,
    metadata: { organizationId: data.organizationId },
  });
  await writeApiLog({ request: req, statusCode: existing ? 200 : 201, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, projectId: project.id } });
  return NextResponse.json({ ok: true, project: { ...project, updatedAt: project.updatedAt.toISOString() } }, { status: existing ? 200 : 201 });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_project_update_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-project:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les projets IA." }, { status: 429 });
  }
  const parsed = enterpriseAiProjectUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Modification de projet IA invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const currentProject = await prisma.enterpriseAiConversationProject.findFirst({
    where: { id: data.projectId, organizationId: data.organizationId, userId: session.userId },
    select: { id: true, name: true },
  });
  if (!currentProject) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Not found", message: "Projet IA introuvable." }, { status: 404 });
  }
  const existingTarget = await prisma.enterpriseAiConversationProject.findFirst({
    where: { organizationId: data.organizationId, userId: session.userId, name: data.name, id: { not: data.projectId } },
    select: { id: true, name: true, updatedAt: true },
  });
  const project = await prisma.$transaction(async (tx) => {
    if (existingTarget) {
      await tx.enterpriseAiConversation.updateMany({
        where: { organizationId: data.organizationId, userId: session.userId, projectId: data.projectId },
        data: { projectId: existingTarget.id, projectName: existingTarget.name },
      });
      await tx.enterpriseAiConversationProject.delete({ where: { id: data.projectId } });
      return existingTarget;
    }
    const renamed = await tx.enterpriseAiConversationProject.update({
      where: { id: data.projectId },
      data: { name: data.name },
      select: { id: true, name: true, updatedAt: true },
    });
    await tx.enterpriseAiConversation.updateMany({
      where: { organizationId: data.organizationId, userId: session.userId, projectId: data.projectId },
      data: { projectName: data.name },
    });
    return renamed;
  });
  await writeAuditLog({
    userId: session.userId,
    action: existingTarget ? "ENTERPRISE_AI_PROJECT_MERGED" : "ENTERPRISE_AI_PROJECT_RENAMED",
    entity: "EnterpriseAiConversationProject",
    entityId: project.id,
    request: req,
    metadata: { organizationId: data.organizationId, previousProjectId: data.projectId },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, projectId: project.id } });
  return NextResponse.json({ ok: true, project: { ...project, updatedAt: project.updatedAt.toISOString() } });
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_project_delete_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-project:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les projets IA." }, { status: 429 });
  }
  const parsed = enterpriseAiProjectDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Suppression de projet IA invalide." }, { status: 400 });
  }
  const data = parsed.data;
  const access = await getEnterpriseAiAccess(session, data.organizationId, "chat");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Forbidden", message: "Accès IA Entreprise refusé." }, { status: 403 });
  }
  const project = await prisma.enterpriseAiConversationProject.findFirst({
    where: { id: data.projectId, organizationId: data.organizationId, userId: session.userId },
    select: { id: true },
  });
  if (!project) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId } });
    return NextResponse.json({ error: "Not found", message: "Projet IA introuvable." }, { status: 404 });
  }
  await prisma.$transaction([
    prisma.enterpriseAiConversation.updateMany({
      where: { organizationId: data.organizationId, userId: session.userId, projectId: data.projectId },
      data: { projectId: null, projectName: null },
    }),
    prisma.enterpriseAiConversationProject.delete({ where: { id: data.projectId } }),
  ]);
  await writeAuditLog({
    userId: session.userId,
    action: "ENTERPRISE_AI_PROJECT_DELETED",
    entity: "EnterpriseAiConversationProject",
    entityId: data.projectId,
    request: req,
    metadata: { organizationId: data.organizationId },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: data.organizationId, projectId: data.projectId } });
  return NextResponse.json({ ok: true });
}
