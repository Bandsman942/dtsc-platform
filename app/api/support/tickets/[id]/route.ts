import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supportTicketUpdateSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

function canManageSupport(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.SUPPORT;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || !canManageSupport(session.role)) {
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
      resolvedAt: ["RESOLVED", "CLOSED"].includes(body.data.status) ? new Date() : null,
    },
  });

  return NextResponse.json({ ok: true, ticket });
}
