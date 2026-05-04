import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userRoleSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = userRoleSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { id } = await params;
  if (id === session.userId && body.data.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id },
    data: { role: body.data.role },
  });

  return NextResponse.json({ ok: true });
}
