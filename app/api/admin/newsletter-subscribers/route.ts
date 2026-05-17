import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { newsletterSubscriberAdminSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [subscribers, users] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true }, take: 500 }),
  ]);
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt });
  return NextResponse.json({ subscribers, users });
}

export async function PATCH(req: Request) {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN) {
    await writeApiLog({ request: req, statusCode: 403, userId: user.id, startedAt });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = newsletterSubscriberAdminSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid payload", message: "Mise à jour newsletter invalide." }, { status: 400 });
  }

  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { id: parsed.data.id } });
  if (!subscriber) {
    await writeApiLog({ request: req, statusCode: 404, userId: user.id, startedAt });
    return NextResponse.json({ error: "Not found", message: "Inscrit newsletter introuvable." }, { status: 404 });
  }

  const convertedUser = parsed.data.convertedUserId
    ? await prisma.user.findUnique({ where: { id: parsed.data.convertedUserId }, select: { id: true, email: true } })
    : null;
  if (parsed.data.action === "CONVERT_EXISTING" && !convertedUser) {
    await writeApiLog({ request: req, statusCode: 400, userId: user.id, startedAt });
    return NextResponse.json({ error: "Invalid conversion", message: "Sélectionnez un utilisateur existant pour convertir ce prospect." }, { status: 400 });
  }

  const status = parsed.data.action === "ARCHIVE"
    ? "ARCHIVED"
    : parsed.data.action === "UNSUBSCRIBE"
      ? "UNSUBSCRIBED"
      : parsed.data.action === "CONVERT_EXISTING"
        ? "CONVERTED"
        : parsed.data.status;
  const updated = await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: {
      status,
      internalNotes: parsed.data.internalNotes || null,
      convertedToUser: parsed.data.action === "CONVERT_EXISTING" ? true : subscriber.convertedToUser,
      convertedUserId: convertedUser?.id || subscriber.convertedUserId,
      convertedAt: parsed.data.action === "CONVERT_EXISTING" ? new Date() : subscriber.convertedAt,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: parsed.data.action === "UPDATE" ? "NEWSLETTER_SUBSCRIBER_UPDATED" : `NEWSLETTER_SUBSCRIBER_${parsed.data.action}`,
    entity: "NewsletterSubscriber",
    entityId: updated.id,
    request: req,
    metadata: { status, convertedUserId: convertedUser?.id || null },
  });
  await writeApiLog({ request: req, statusCode: 200, userId: user.id, startedAt, metadata: { subscriberId: updated.id, status } });
  return NextResponse.json({ ok: true, subscriber: updated });
}
