import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/security";
import { passwordUpdateSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const sessionUser = await requireUser();
  const body = passwordUpdateSchema.safeParse(await req.json());

  if (!body.success) {
    return NextResponse.json({ error: "Mot de passe invalide" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { passwordHash: true },
  });

  if (!user || !verifyPassword(body.data.currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: sessionUser.id },
    data: { passwordHash: hashPassword(body.data.newPassword) },
  });

  return NextResponse.json({ ok: true });
}
