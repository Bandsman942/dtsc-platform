import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { touchUserPresence } from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

const presenceSchema = z.object({
  status: z.enum(["online", "offline"]).default("online"),
});

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.text().catch(() => "");
  const parsedBody = rawBody ? safeJsonParse(rawBody) : {};
  const parsed = presenceSchema.safeParse(parsedBody);
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid presence" }, { status: 400 });
  }

  if (parsed.data.status === "offline") {
    await prisma.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date(0) } }).catch(() => null);
  } else {
    await touchUserPresence(session.userId);
  }

  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt });
  return NextResponse.json({ ok: true });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
