import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminUsageLimitSchema } from "@/lib/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = adminUsageLimitSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid usage limits" }, { status: 400 });
  }

  const { id } = await params;
  await prisma.user.update({
    where: { id },
    data: {
      dailyMessageLimit: body.data.dailyMessageLimit,
      dailyTokenLimit: body.data.dailyTokenLimit,
    },
  });

  return NextResponse.json({ ok: true });
}
