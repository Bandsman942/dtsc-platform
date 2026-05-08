import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadProfileAvatarToSupabase } from "@/lib/supabase-storage";

export const runtime = "nodejs";

const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("avatar");

  if (!(file instanceof File) || !allowedAvatarTypes.has(file.type)) {
    return NextResponse.json({ error: "Format d'image invalide" }, { status: 400 });
  }

  if (file.size > maxAvatarBytes) {
    return NextResponse.json({ error: "Image trop lourde" }, { status: 413 });
  }

  let avatar;
  try {
    avatar = await uploadProfileAvatarToSupabase({ userId: session.userId, file });
    await prisma.user.update({
      where: { id: session.userId },
      data: { avatarUrl: avatar.publicUrl },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'envoyer cette image" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, avatarUrl: avatar.publicUrl });
}
