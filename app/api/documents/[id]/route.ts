import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, fileName: true },
  });

  if (!document) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.knowledgeDocument.delete({ where: { id: document.id } });
  await writeAuditLog({
    userId: session.userId,
    action: "KNOWLEDGE_DOCUMENT_DELETED",
    entity: "KnowledgeDocument",
    entityId: document.id,
    metadata: { fileName: document.fileName },
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { documentId: document.id } });

  return NextResponse.json({ ok: true });
}
