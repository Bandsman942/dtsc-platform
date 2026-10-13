import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/organizations";
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

  const run = await prisma.aiAgentRun.findFirst({
    where: {
      userId: session.userId,
      organizationId,
      scope: variant === "enterprise" ? "ENTERPRISE_CHAT" : "GLOBAL_CHAT",
      status: { in: ["WAITING_CONFIRMATION", "READY_TO_RESUME"] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, conversationId: true, enterpriseConversationId: true },
  });
  return NextResponse.json({
    runId: run?.id || null,
    status: run?.status || null,
    conversationId: (variant === "enterprise" ? run?.enterpriseConversationId : run?.conversationId) || null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
