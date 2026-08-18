import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import {
  COLLABORATION_CLIENT_TYPES,
  markCollaborationPresenceOffline,
  markCollaborationPresenceOnline,
} from "@/lib/collaboration-presence-sessions";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

const presenceSchema = z.object({
  status: z.enum(["online", "offline"]).default("online"),
  clientSessionId: z.string().trim().min(8).max(160).optional(),
  clientType: z.enum(COLLABORATION_CLIENT_TYPES).optional(),
  reason: z.enum(["HIDDEN", "PAGE_HIDE", "CLIENT_OFFLINE", "SIGN_OUT"]).optional(),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "collaboration_presence_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(getRateLimitKey(req, `collaboration-presence:${session.userId}`), 600, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await req.text().catch(() => "");
  const parsedBody = rawBody ? safeJsonParse(rawBody) : {};
  const parsed = presenceSchema.safeParse(parsedBody);
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid presence" }, { status: 400 });
  }

  let successMetadata: Record<string, string | boolean> | null = null;
  if (parsed.data.status === "offline") {
    await markCollaborationPresenceOffline({
      userId: session.userId,
      clientSessionId: parsed.data.clientSessionId,
      reason: parsed.data.reason,
    });
    successMetadata = { presenceMode: "OFFLINE", dbTouched: true };
  } else {
    const presence = await markCollaborationPresenceOnline({
      userId: session.userId,
      clientSessionId: parsed.data.clientSessionId,
      clientType: parsed.data.clientType || inferClientType(req.headers.get("user-agent")),
    });
    if (presence.mode === "FALLBACK" || presence.checkpointed) {
      successMetadata = {
        presenceMode: presence.mode,
        dbCheckpoint: presence.checkpointed,
        ...(presence.mode === "FALLBACK" ? { fallbackReason: presence.reason } : {}),
      };
    }
  }

  if (successMetadata) {
    await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: successMetadata });
  }
  return NextResponse.json({ ok: true });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function inferClientType(userAgent: string | null): "MOBILE" | "TABLET" | "DESKTOP" | "UNKNOWN" {
  const value = (userAgent || "").toLowerCase();
  if (!value) return "UNKNOWN";
  if (/ipad|tablet|kindle|silk/.test(value)) return "TABLET";
  if (/android|iphone|ipod|mobile/.test(value)) return "MOBILE";
  return "DESKTOP";
}
