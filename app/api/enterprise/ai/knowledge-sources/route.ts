import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getEnterpriseAiAccess } from "@/lib/enterprise-ai/access";
import { assertEnterpriseAiKnowledgeQuota, canIndexEnterpriseAiFile, indexEnterpriseAiKnowledgeSource } from "@/lib/enterprise-ai/knowledge";
import { enterpriseAiKnowledgeListSchema, enterpriseAiKnowledgeUploadSchema } from "@/lib/enterprise-ai/validators";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = enterpriseAiKnowledgeListSchema.safeParse({
    organizationId: url.searchParams.get("organizationId") || "",
    cursor: url.searchParams.get("cursor") || "",
    status: url.searchParams.get("status") || undefined,
  });
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const access = await getEnterpriseAiAccess(session, parsed.data.organizationId, "read");
  if (!access) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sources = await prisma.enterpriseAiKnowledgeSource.findMany({
    where: {
      organizationId: parsed.data.organizationId,
      ...(parsed.data.status ? { status: parsed.data.status } : { archivedAt: null }),
      ...(parsed.data.cursor ? { createdAt: { lt: new Date(parsed.data.cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 21,
    include: { _count: { select: { chunks: true } }, createdBy: { select: { name: true } } },
  });
  const page = sources.slice(0, 20);
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId } });
  return NextResponse.json({
    sources: page.map((source) => ({
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
      status: source.status,
      sectorCode: source.sectorCode,
      moduleCode: source.moduleCode,
      confidentiality: source.confidentiality,
      fileName: source.fileName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      chunkCount: source._count.chunks,
      createdByName: source.createdBy.name,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      errorMessage: source.errorMessage,
      archivedAt: source.archivedAt?.toISOString() || null,
    })),
    nextCursor: sources.length > 20 ? page[page.length - 1]?.createdAt.toISOString() || null : null,
    permissions: {
      canUploadSources: access.canUploadSources,
      canManageSources: access.canManageSources,
    },
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "enterprise_ai_source_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `enterprise-ai-source:${session.userId}`), 20, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const parsed = enterpriseAiKnowledgeUploadSchema.safeParse({
    organizationId: formData?.get("organizationId"),
    title: formData?.get("title") || "",
    sectorCode: formData?.get("sectorCode") || "",
    moduleCode: formData?.get("moduleCode") || "",
    confidentiality: formData?.get("confidentiality") || "INTERNAL",
  });
  if (!parsed.success || !(file instanceof File)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Source IA invalide ou fichier manquant." }, { status: 400 });
  }
  const access = await getEnterpriseAiAccess(session, parsed.data.organizationId, "source_create");
  if (!access || !access.canUploadSources) {
    await writeApiLog({ request: req, statusCode: 403, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Forbidden", message: "Vous n'avez pas la permission d'ajouter des sources IA." }, { status: 403 });
  }
  if (!canIndexEnterpriseAiFile(file)) {
    await writeApiLog({ request: req, statusCode: 415, userId: session.userId, startedAt, metadata: { type: file.type, size: file.size } });
    return NextResponse.json({ error: "Unsupported file", message: "Fichier non supporté ou trop volumineux." }, { status: 415 });
  }
  const quota = await assertEnterpriseAiKnowledgeQuota(parsed.data.organizationId, file, access);
  if (!quota.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId, code: quota.code } });
    return NextResponse.json({ error: quota.code, message: quota.code === "SOURCE_LIMIT_REACHED" ? "Limite de sources IA atteinte." : "Limite de stockage IA atteinte." }, { status: 429 });
  }

  try {
    const source = await indexEnterpriseAiKnowledgeSource({
      organizationId: parsed.data.organizationId,
      assistantId: access.assistantId,
      userId: session.userId,
      sectorCode: parsed.data.sectorCode || access.sectorCode,
      moduleCode: parsed.data.moduleCode || null,
      title: parsed.data.title || null,
      confidentiality: parsed.data.confidentiality,
      file,
    });
    await writeAuditLog({ userId: session.userId, action: "ENTERPRISE_AI_SOURCE_INDEXED", entity: "EnterpriseAiKnowledgeSource", entityId: source.id, request: req, metadata: { organizationId: parsed.data.organizationId, confidentiality: source.confidentiality } });
    await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId, sourceId: source.id } });
    return NextResponse.json({ ok: true, source: { id: source.id, title: source.title, status: source.status, chunkCount: source._count.chunks } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed";
    await writeApiLog({ request: req, statusCode: 500, userId: session.userId, startedAt, metadata: { organizationId: parsed.data.organizationId, message } });
    return NextResponse.json({ error: "Indexing failed", message: "La source n'a pas pu être indexée." }, { status: 500 });
  }
}
