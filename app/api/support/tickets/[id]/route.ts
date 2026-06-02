import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";
import { canManageSupportRole } from "@/lib/support-access";
import { supportTicketUpdateSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

function closesTicket(status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
  return status === "RESOLVED" || status === "CLOSED";
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || !isDtscInternalSession(session) || !canManageSupportRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = supportTicketUpdateSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid ticket update" }, { status: 400 });
  }

  const { id } = await params;
  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: body.data.status,
      priority: body.data.priority,
      resolution: body.data.resolution || null,
      resolvedAt: closesTicket(body.data.status) ? new Date() : null,
    },
  });

  await notifyUser({
    userId: ticket.userId,
    title: "Ticket support mis à jour",
    body: `${ticket.subject} · ${ticket.status}`,
    type: "SUPPORT",
    targetUrl: "/support",
    organizationId: ticket.organizationId,
  });

  return NextResponse.json({ ok: true, ticket });
}
