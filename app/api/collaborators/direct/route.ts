import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { resolveDirectConversation } from "@/lib/standard-collaboration";
import { collaborationDirectConversationSchema } from "@/lib/validators";

const DIRECT_ERROR_STATUS: Record<string, number> = {
  DIRECT_CONVERSATION_SELF: 400,
  DIRECT_CONVERSATION_NOT_ALLOWED: 403,
  DIRECT_CONVERSATION_BLOCKED: 403,
  DIRECT_CONVERSATION_NOT_FOUND: 404,
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "FORBIDDEN", message: "Origine de requête refusée." }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-direct:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de créations de conversation." }, { status: 429 });
  const parsed = collaborationDirectConversationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Collaborateur invalide." }, { status: 400 });

  try {
    const result = await resolveDirectConversation(session, parsed.data.targetUserId);
    await writeAuditLog({
      userId: session.userId,
      action: result.created ? "collaboration.direct.created" : "collaboration.direct.reused",
      entity: "CollaborationGroup",
      entityId: result.group.id,
      request: req,
    });
    await writeApiLog({ request: req, statusCode: result.created ? 201 : 200, userId: session.userId, startedAt });
    return NextResponse.json({ ok: true, group: result.group, created: result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = DIRECT_ERROR_STATUS[code] || 500;
    await writeApiLog({ request: req, statusCode: status, userId: session.userId, startedAt, metadata: { code } });
    return NextResponse.json({ error: code, message: status === 500 ? "Conversation indisponible." : "Cette conversation ne peut pas être créée." }, { status });
  }
}
