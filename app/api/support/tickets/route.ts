import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { supportTicketSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = supportTicketSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid ticket data" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: session.userId,
      subject: body.data.subject,
      description: body.data.description,
      priority: body.data.priority,
    },
  });

  return NextResponse.json({ ticket });
}
