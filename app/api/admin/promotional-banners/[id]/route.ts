import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { promotionalBannerWriteSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

function optionalDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function requireAdmin(req: Request, startedAt: number) {
  if (!isSameOriginRequest(req)) {
    await writeApiLog({ request: req, statusCode: 403, startedAt, metadata: { action: "promotional_banner_origin_denied" } });
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: session?.userId || null, startedAt });
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const limited = await rateLimit(getRateLimitKey(req, `admin-promotional-banners:${session.userId}`), 40, 60 * 60 * 1000);
  if (!limited.ok) {
    await writeApiLog({ request: req, statusCode: 429, userId: session.userId, startedAt });
    return { response: NextResponse.json({ error: "Too many requests", message: "Trop d'actions sur les bannières promotionnelles." }, { status: 429 }) };
  }
  return { session };
}

export async function PATCH(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req, startedAt);
  if ("response" in auth) return auth.response;

  const parsed = promotionalBannerWriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: auth.session.userId, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Bannière promotionnelle invalide." }, { status: 400 });
  }
  const { id } = await params;
  const data = parsed.data;
  const startsAt = optionalDate(data.startsAt);
  const endsAt = optionalDate(data.endsAt);
  if (startsAt === undefined || endsAt === undefined || (startsAt && endsAt && endsAt < startsAt)) {
    await writeApiLog({ request: req, statusCode: 400, userId: auth.session.userId, startedAt, metadata: { bannerId: id } });
    return NextResponse.json({ error: "Invalid payload", message: "Dates de bannière invalides." }, { status: 400 });
  }
  const banner = await prisma.promotionalBanner.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
      surfacesJson: data.surfaces,
      includeRoles: data.includeRoles,
      excludeRoles: data.excludeRoles,
      ctaLabel: data.ctaLabel || null,
      ctaUrl: data.ctaUrl || null,
      priority: data.priority,
      startsAt,
      endsAt,
      archivedAt: data.status === "ARCHIVED" ? new Date() : null,
    },
  }).catch(() => null);
  if (!banner) {
    await writeApiLog({ request: req, statusCode: 404, userId: auth.session.userId, startedAt, metadata: { bannerId: id } });
    return NextResponse.json({ error: "Not found", message: "Bannière introuvable." }, { status: 404 });
  }
  await writeAuditLog({
    userId: auth.session.userId,
    action: "PROMOTIONAL_BANNER_UPDATED",
    entity: "PromotionalBanner",
    entityId: banner.id,
    request: req,
    metadata: { status: banner.status, surfaces: data.surfaces, includeRoles: data.includeRoles, excludeRoles: data.excludeRoles },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { bannerId: banner.id } });
  return NextResponse.json({ ok: true, banner });
}

export async function DELETE(req: Request, { params }: Params) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req, startedAt);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const banner = await prisma.promotionalBanner.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
    select: { id: true },
  }).catch(() => null);
  if (!banner) {
    await writeApiLog({ request: req, statusCode: 404, userId: auth.session.userId, startedAt, metadata: { bannerId: id } });
    return NextResponse.json({ error: "Not found", message: "Bannière introuvable." }, { status: 404 });
  }
  await writeAuditLog({
    userId: auth.session.userId,
    action: "PROMOTIONAL_BANNER_ARCHIVED",
    entity: "PromotionalBanner",
    entityId: banner.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 200, userId: auth.session.userId, startedAt, metadata: { bannerId: banner.id } });
  return NextResponse.json({ ok: true });
}
