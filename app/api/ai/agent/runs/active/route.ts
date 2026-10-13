import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveOrganizationId, requireActiveOrganizationMembership } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

/**
 * Recover only a user's resumable run metadata after a page refresh.
 * A RUNNING stream is deliberately excluded: the browser cannot assume that
 * the original HTTP execution survived a navigation.
 * Never expose another user, organization or assistant scope.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const variant = new URL(req.url).searchParams.get("variant");
  if (variant !== "chatbot" && variant !== "enterprise") {
    return NextResponse.json({ error: "INVALID_VARIANT" }, { status: 400 });
  }

  const organizationId = getActiveOrganizationId(session);
  if (variant === "enterprise" && (session.activeContext !== "ORGANIZATION" || !organizationId)) {
    return NextResponse.json({ error: "ORGANIZATION_CONTEXT_REQUIRED" }, { status: 403 });
  }
  if (session.activeContext === "ORGANIZATION" && (!organizationId || !await requireActiveOrganizationMembership(session, organizationId))) {
    return NextResponse.json({ error: "ORGANIZATION_ACCESS_DENIED" }, { status: 403 });
  }

  // An old WAITING_CONFIRMATION row is not a resumable approval after its
  // ten-minute confirmation TTL. Look through recent runs, but only restore
  // one backed by an actionable pending confirmation or a consumed approval.
  const now = new Date();
  const candidates = await prisma.aiAgentRun.findMany({
    where: {
      userId: session.userId,
      organizationId,
      scope: variant === "enterprise" ? "ENTERPRISE_CHAT" : "GLOBAL_CHAT",
      status: { in: ["WAITING_CONFIRMATION", "READY_TO_RESUME"] },
      createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, status: true, pendingConfirmationId: true, conversationId: true, enterpriseConversationId: true },
  });
  const ids = candidates.map((run) => run.pendingConfirmationId).filter((id): id is string => Boolean(id));
  const confirmations = ids.length
    ? await prisma.aiToolConfirmation.findMany({
        where: { id: { in: ids }, userId: session.userId, organizationId },
        select: { id: true, status: true, expiresAt: true },
      })
    : [];
  const confirmed = new Map(confirmations.map((row) => [row.id, row] as const));
  const run = candidates.find((candidate) => {
    const confirmation = candidate.pendingConfirmationId && confirmed.get(candidate.pendingConfirmationId);
    if (!confirmation) return false;
    return candidate.status === "WAITING_CONFIRMATION"
      ? confirmation.status === "PENDING" && confirmation.expiresAt > now
      : confirmation.status === "CONSUMED";
  }) || null;
  return NextResponse.json({
    runId: run?.id || null,
    status: run?.status || null,
    conversationId: (variant === "enterprise" ? run?.enterpriseConversationId : run?.conversationId) || null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
