import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRateLimitKey, rateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { collaborationConversationFilterSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-filter-update:${session.userId}`), 90, 60 * 60 * 1000);
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
  const { id } = await params;
  const current = await prisma.collaborationConversationFilter.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const duplicate = await prisma.collaborationConversationFilter.findFirst({
    where: { userId: session.userId, id: { not: id }, name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "A filter with this name already exists" }, { status: 409 });
  const filter = await prisma.collaborationConversationFilter.update({
    where: { id },
    data: {
      name: parsed.data.name,
      position: parsed.data.position,
      criteriaJson: criteria as Prisma.InputJsonValue,
    },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-filters", filterId: id } });
  return NextResponse.json({ filter });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `collaboration-filter-delete:${session.userId}`), 60, 60 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  const deleted = await prisma.collaborationConversationFilter.deleteMany({ where: { id, userId: session.userId } });
  if (!deleted.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { domain: "collaboration-filters", filterId: id } });
  return NextResponse.json({ ok: true });
}
