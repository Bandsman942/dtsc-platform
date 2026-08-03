import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { getAuthorizedCollaborators } from "@/lib/standard-collaboration";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-directory:${session.userId}`), 120, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de recherches. Réessayez plus tard." }, { status: 429 });

  const url = new URL(req.url);
  const query = url.searchParams.get("query") || "";
  const users = await getAuthorizedCollaborators(session, { query, limit: 80 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { resultCount: users.length } });
  return NextResponse.json({ users });
}
