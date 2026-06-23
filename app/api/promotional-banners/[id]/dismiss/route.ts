import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now();
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "promotional_banner_dismiss_origin_denied" } });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(getRateLimitKey(req, `promotional-banner-dismiss:${session.userId}`), 80, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { id } = await params;
  const banner = await prisma.promotionalBanner.findFirst({
    where: { id, archivedAt: null },
    select: { id: true },
  });
  if (!banner) {
    await writeApiLog({ request: req, statusCode: 404, userId: session.userId, startedAt, metadata: { bannerId: id } });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.promotionalBannerDismissal.createMany({
    data: [{ bannerId: banner.id, userId: session.userId }],
    skipDuplicates: true,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: session.userId, startedAt, metadata: { bannerId: banner.id } });
  return NextResponse.json({ ok: true });
}
