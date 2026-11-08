import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveOrganizationMembership } from "@/lib/organizations";
import { isSameOriginRequest } from "@/lib/request-security";

/** Existing AiToolExecution is the authoritative execution journal.
 * No duplicate AssistantActionRun table and no client-authored SUCCESS status.
 */
type Row = {
  id: string;
  toolCode: string;
  status: string;
  resultJson: unknown | null;
  reasonCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
};
const safeCode = new Set(["DTSC_CONTACT_EMAIL_SEND", "SUPPORT_TICKET_CREATE"]);

export async function GET(req: Request) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const organizationId = session.activeContext === "ORGANIZATION" ? session.activeOrganizationId || null : null;
  if (session.activeContext === "ORGANIZATION"
    && (!organizationId || !await requireActiveOrganizationMembership(session, organizationId))) {
    return NextResponse.json({ error: "ORGANIZATION_ACCESS_DENIED" }, { status: 403 });
  }
  const value = new URL(req.url).searchParams.get("conversationId");
  if (value && !z.string().uuid().safeParse(value).success) {
    return NextResponse.json({ error: "INVALID_CONVERSATION_ID" }, { status: 400 });
  }
  const conversationId = value || null;
  const rows = conversationId
    ? await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT "id", "toolCode", "status", "resultJson", "reasonCode", "createdAt", "completedAt"
      FROM "AiToolExecution"
      WHERE "userId" = ${session.userId}
        AND ("organizationId" IS NOT DISTINCT FROM ${organizationId})
        AND "conversationId" = ${conversationId}
        AND "toolCode" IN ('SUPPORT_TICKET_CREATE', 'DTSC_CONTACT_EMAIL_SEND')
      ORDER BY "createdAt" DESC
      LIMIT 12
    `)
    : await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT "id", "toolCode", "status", "resultJson", "reasonCode", "createdAt", "completedAt"
      FROM "AiToolExecution"
      WHERE "userId" = ${session.userId}
        AND ("organizationId" IS NOT DISTINCT FROM ${organizationId})
        AND "toolCode" IN ('SUPPORT_TICKET_CREATE', 'DTSC_CONTACT_EMAIL_SEND')
      ORDER BY "createdAt" DESC
      LIMIT 12
    `);
  const actions = rows.filter(row => safeCode.has(row.toolCode)).map(row => {
    const result = row.resultJson && typeof row.resultJson === "object" && !Array.isArray(row.resultJson)
      ? row.resultJson as Record<string, unknown> : {};
    const successful = row.status === "SUCCESS"
      && (row.toolCode === "SUPPORT_TICKET_CREATE"
        ? typeof result.ticketId === "string" && result.ticketId.length > 0
        : result.sent === true && typeof result.contactMessageId === "string");
    return {
      id: row.id,
      toolCode: row.toolCode,
      status: successful ? "SUCCEEDED" : row.status === "SUCCESS" ? "UNVERIFIED" : row.status,
      ticketId: successful && row.toolCode === "SUPPORT_TICKET_CREATE" ? result.ticketId : null,
      contactMessageId: successful && row.toolCode === "DTSC_CONTACT_EMAIL_SEND" ? result.contactMessageId : null,
      reasonCode: row.status === "FAILED" ? "ACTION_FAILED" : row.status === "SUCCESS" && !successful ? "SUCCESS_NOT_VERIFIED" : null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() || null,
    };
  });
  return NextResponse.json({ actions }, { headers: { "Cache-Control": "private, no-store" } });
}
