import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";

type PendingRow = {
  id: string;
  conversationId: string | null;
  turnId: string | null;
  toolCode: string;
  argumentsJson: unknown | null;
  expiresAt: Date;
  createdAt: Date;
};

function preview(toolCode: string, args: unknown) {
  const value = args && typeof args === "object" ? args as Record<string, unknown> : {};
  return {
    subject: typeof value.subject === "string" ? value.subject : null,
    priority: toolCode === "SUPPORT_TICKET_CREATE" && typeof value.priority === "string" ? value.priority : null,
  };
}

export async function GET(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId")?.trim() || null;
  if (!conversationId) return NextResponse.json({ confirmations: [] });
  const organizationId = session.activeContext === "ORGANIZATION" ? session.activeOrganizationId || null : null;

  const rows = await prisma.$queryRaw<PendingRow[]>(Prisma.sql`
    SELECT "id", "conversationId", "turnId", "toolCode", "argumentsJson", "expiresAt", "createdAt"
    FROM "AiToolConfirmation"
    WHERE "userId" = ${session.userId}
      AND ("organizationId" IS NOT DISTINCT FROM ${organizationId})
      AND "conversationId" = ${conversationId}
      AND "status" = 'PENDING'
      AND "expiresAt" > CURRENT_TIMESTAMP
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);

  return NextResponse.json({
    confirmations: rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      turnId: row.turnId,
      toolCode: row.toolCode,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      preview: preview(row.toolCode, row.argumentsJson),
    })),
  });
}
