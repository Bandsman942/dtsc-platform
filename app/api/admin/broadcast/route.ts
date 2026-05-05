import { NextResponse } from "next/server";
import { UserRole, UserStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { broadcastSchema } from "@/lib/validators";
import { sendZohoMailWebhook } from "@/lib/zoho-mail";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = broadcastSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid broadcast" }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    select: { id: true, email: true },
  });

  await notifyUsers({
    userIds: users.map((user) => user.id),
    title: body.data.title,
    body: body.data.body,
    type: body.data.type,
    targetUrl: "/notifications",
  });

  const zoho = await sendZohoMailWebhook({
    subject: body.data.title,
    message: [
      body.data.body,
      "",
      `Diffusion admin DTSC vers ${users.length} utilisateur(s) actif(s).`,
      `Adresses: ${users.map((user) => user.email).join(", ")}`,
    ].join("\n"),
    source: "admin-broadcast",
  }).catch((error) => ({ sent: false, reason: error instanceof Error ? error.message : "Zoho webhook failed" }));

  return NextResponse.json({ ok: true, emails: users.map((user) => user.email), zoho });
}
