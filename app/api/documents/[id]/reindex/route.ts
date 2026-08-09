import { after, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { indexPreparedKnowledgeDocument } from "@/lib/rag";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit(getRateLimitKey(req, `knowledge-reindex:${session.userId}`), 12, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const organizationId = getActiveOrganizationId(session);
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id, userId: session.userId, organizationId },
    select: { id: true, title: true, extractedText: true },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!document.extractedText) return NextResponse.json({ error: "Document not prepared" }, { status: 409 });

  await prisma.knowledgeDocument.update({ where: { id }, data: { status: "PROCESSING", errorMessage: null } });
  const userId = session.userId;
  after(async () => {
    try {
      const indexed = await indexPreparedKnowledgeDocument({ documentId: id, userId, organizationId });
      await writeAuditLog({ userId, action: "KNOWLEDGE_DOCUMENT_REINDEXED", entity: "KnowledgeDocument", entityId: id, metadata: { organizationId, chunks: indexed._count.chunks } });
    } catch (error) {
      console.error("Personal knowledge reindex failed", id, error);
    }
  });

  await writeAuditLog({ userId, action: "KNOWLEDGE_DOCUMENT_REINDEX_REQUESTED", entity: "KnowledgeDocument", entityId: id, request: req, metadata: { organizationId } });
  await writeApiLog({ request: req, statusCode: 202, userId, startedAt, metadata: { documentId: id, organizationId } });
  return NextResponse.json({ ok: true, document: { id, title: document.title, status: "PROCESSING" } }, { status: 202 });
}
