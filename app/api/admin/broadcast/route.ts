import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeApiLog } from "@/lib/audit";
import { enqueueAdminBroadcast } from "@/lib/mail/admin-broadcast-queue";
import { prisma } from "@/lib/prisma";
import { broadcastSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const startedAt = Date.now();
  let sessionUserId: string | null = null;

  try {
    const session = await getSession();
    sessionUserId = session?.userId || null;
    if (!session || session.role !== UserRole.ADMIN) {
      await writeApiLog({ request: req, statusCode: 403, userId: sessionUserId, startedAt });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = broadcastSchema.safeParse(await req.json());
    if (!body.success) {
      await writeApiLog({
        request: req,
        statusCode: 400,
        userId: session.userId,
        startedAt,
        metadata: { reason: "invalid_broadcast_payload", issues: body.error.issues.map((issue) => issue.path.join(".")) },
      });
      return NextResponse.json(
        {
          error: "Invalid broadcast",
          message: "Vérifiez le titre et le contenu de la diffusion. Le titre et le message doivent contenir au moins 3 caractères.",
        },
        { status: 400 },
      );
    }

    const users = await prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, email: true, name: true, notifyBroadcastEnabled: true },
    });

    const queued = await enqueueAdminBroadcast({
      recipients: users,
      title: body.data.title,
      body: body.data.body,
      bodyHtml: body.data.bodyHtml || undefined,
      type: body.data.type,
    });

    await writeApiLog({
      request: req,
      statusCode: 202,
      userId: session.userId,
      startedAt,
      metadata: {
        broadcastId: queued.broadcastId,
        recipients: queued.recipients,
        notificationsQueued: queued.notificationsQueued,
        pushJobsQueued: queued.pushJobsQueued,
        emailJobsQueued: queued.emailJobsQueued,
        personalized: queued.personalized,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        broadcastId: queued.broadcastId,
        recipientCount: queued.recipients,
        notificationCount: queued.notificationsQueued,
        emailJobCount: queued.emailJobsQueued,
        zoho: { sent: true, queued: true, personalized: queued.personalized },
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected broadcast queue failure";
    console.error("Admin broadcast queue failed", error);
    await writeApiLog({
      request: req,
      statusCode: 500,
      userId: sessionUserId,
      startedAt,
      metadata: { reason: message.slice(0, 240) },
    });

    return NextResponse.json(
      {
        error: "Broadcast queue failed",
        message: "La diffusion n'a pas pu être mise en file durable. Vérifiez les logs Vercel et la base de données.",
        details: message,
      },
      { status: 500 },
    );
  }
}
