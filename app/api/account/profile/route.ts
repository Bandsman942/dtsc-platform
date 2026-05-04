import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileUpdateSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const user = await requireUser();
  const body = profileUpdateSchema.safeParse(await req.json());

  if (!body.success) {
    return NextResponse.json({ error: "Données de profil invalides" }, { status: 400 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.data.name,
      companyName: body.data.companyName || null,
      phone: body.data.phone || null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, user: updatedUser });
}
