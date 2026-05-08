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
      jobTitle: body.data.jobTitle || null,
      bio: body.data.bio || null,
      location: body.data.location || null,
      website: body.data.website || null,
      avatarUrl: body.data.avatarUrl || null,
      publicProfileConsent: body.data.publicProfileConsent,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, user: updatedUser });
}
