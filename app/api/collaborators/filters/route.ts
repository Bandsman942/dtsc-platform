import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationConversationFilterSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const filters = await prisma.collaborationConversationFilter.findMany({
    where: { userId: session.userId },
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
    take: 20,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-filters", count: filters.length } });
  return NextResponse.json({ filters });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-filter:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = collaborationConversationFilterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const selectedGroupIds = [...new Set(parsed.data.criteria.selectedGroupIds)];
  if (selectedGroupIds.length) {
    const allowedCount = await prisma.collaborationGroup.count({
      where: { id: { in: selectedGroupIds }, status: "ACTIVE", members: { some: { userId: session.userId, status: "ACTIVE" } } },
    });
    if (allowedCount !== selectedGroupIds.length) return NextResponse.json({ error: "Invalid conversation selection" }, { status: 400 });
  }
  const criteria = { ...parsed.data.criteria, selectedGroupIds };
  const count = await prisma.collaborationConversationFilter.count({ where: { userId: session.userId } });
  if (count >= 20) return NextResponse.json({ error: "Filter limit reached" }, { status: 409 });
  const existing = await prisma.collaborationConversationFilter.findFirst({
    where: { userId: session.userId, name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "A filter with this name already exists" }, { status: 409 });
  const filter = await prisma.collaborationConversationFilter.create({
    data: {
      userId: session.userId,
      name: parsed.data.name,
      position: parsed.data.position,
      criteriaJson: criteria as Prisma.InputJsonValue,
    },
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt, metadata: { domain: "collaboration-filters", filterId: filter.id } });
  return NextResponse.json({ filter }, { status: 201 });
}
