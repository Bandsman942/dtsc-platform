import { NextResponse } from "next/server";
import { DocumentStatus, SubscriptionStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { enqueueKnowledgeIndexJob } from "@/lib/knowledge-index/queue";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { documentUploadSchema } from "@/lib/validators";
import { knowledgeUploadLimits, prepareKnowledgeDocument } from "@/lib/rag";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const organizationId = getActiveOrganizationId(session);
  const documents = await prisma.knowledgeDocument.findMany({
    where: { userId: session.userId, organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
    take: 100,
  });
  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const organizationId = getActiveOrganizationId(session);
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { locale: true } });
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const body = documentUploadSchema.safeParse({ title: formData?.get("title") || "" });
  if (!body.success || !(file instanceof File)) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid document upload" }, { status: 400 });
  }
  if (file.size > knowledgeUploadLimits.maxUploadBytes) {
    await writeApiLog({ request: req, statusCode: 413, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Document too large" }, { status: 413 });
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: session.userId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  const currentDocuments = await prisma.knowledgeDocument.count({
    where: { userId: session.userId, organizationId, status: { in: [DocumentStatus.PROCESSING, DocumentStatus.READY] } },
  });
  const maxDocuments = activeSubscription?.plan.maxDocuments ?? 0;
  if (currentDocuments >= maxDocuments) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt, metadata: { maxDocuments } });
    return NextResponse.json({ error: "Document limit reached for your subscription", maxDocuments }, { status: 429 });
  }

  try {
    const prepared = await prepareKnowledgeDocument({
      userId: session.userId,
      organizationId,
      title: body.data.title || undefined,
      language: user?.locale === "en" ? "en" : "fr",
      file,
    });
    const queueEventId = await enqueueKnowledgeIndexJob({ documentId: prepared.id, organizationId });
    await writeAuditLog({
      userId: session.userId,
      action: "KNOWLEDGE_DOCUMENT_PREPARED",
      entity: "KnowledgeDocument",
      entityId: prepared.id,
      metadata: { indexVersion: prepared.indexVersion, queueEventId },
      request: req,
    });
    await writeApiLog({ request: req, statusCode: 202, userId: session.userId, startedAt, metadata: { documentId: prepared.id, status: "PROCESSING", queued: true } });
    return NextResponse.json({
      ok: true,
      document: { id: prepared.id, title: prepared.title, status: "PROCESSING", indexVersion: prepared.indexVersion },
      indexing: { queued: true },
    }, { status: 202 });
  } catch (error) {
    await writeApiLog({ request: req, statusCode: 422, userId: session.userId, startedAt, metadata: { reason: error instanceof Error ? error.message : "DOCUMENT_PREPARATION_FAILED" } });
    return NextResponse.json({ error: "Unable to prepare this document", reason: error instanceof Error ? error.message : "DOCUMENT_PREPARATION_FAILED" }, { status: 422 });
  }
}
