import { UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, Math.min(5, local.length - visible.length)))}@${domain}`;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-contact-directory:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "RATE_LIMITED", message: "Trop de recherches." }, { status: 429 });

  const query = new URL(req.url).searchParams.get("query")?.trim() || "";
  if (query.length < 3) return NextResponse.json({ users: [] });
  const emailLookup = query.includes("@");
  const [requests, blocks] = await Promise.all([
    prisma.collaborationContactRequest.findMany({
      where: { OR: [{ requesterId: session.userId }, { targetUserId: session.userId }], status: { in: ["PENDING", "ACCEPTED"] } },
      select: { requesterId: true, targetUserId: true },
      take: 2_000,
    }),
    prisma.collaborationUserBlock.findMany({
      where: { revokedAt: null, OR: [{ blockerId: session.userId }, { blockedId: session.userId }] },
      select: { blockerId: true, blockedId: true },
      take: 2_000,
    }),
  ]);
  const excluded = new Set<string>([session.userId]);
  for (const request of requests) excluded.add(request.requesterId === session.userId ? request.targetUserId : request.requesterId);
  for (const block of blocks) excluded.add(block.blockerId === session.userId ? block.blockedId : block.blockerId);

  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [...excluded] },
      status: UserStatus.ACTIVE,
      ...(emailLookup
        ? { email: { equals: query.toLowerCase(), mode: "insensitive" } }
        : {
            publicProfileConsent: true,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { companyName: { contains: query, mode: "insensitive" } },
              { jobTitle: { contains: query, mode: "insensitive" } },
            ],
          }),
    },
    select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, companyName: true },
    orderBy: [{ name: "asc" }],
    take: 20,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { resultCount: users.length, emailLookup } });
  return NextResponse.json({ users: users.map(({ email, ...user }) => ({ ...user, maskedEmail: maskEmail(email) })) });
}
