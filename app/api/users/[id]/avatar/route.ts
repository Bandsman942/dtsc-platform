import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canReadUserAvatar } from "@/lib/avatar-access";
import { prisma } from "@/lib/prisma";
import { downloadProfileAvatarFromSupabase } from "@/lib/supabase-storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const requestUrl = new URL(req.url);
  const session = await getSession();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      avatarStoragePath: true,
      publicProfileConsent: true,
    },
  });

  if (!user?.avatarStoragePath) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  const canRead = await canReadUserAvatar({
    viewerUserId: session?.userId,
    targetUserId: id,
    publicProfileConsent: user.publicProfileConsent,
  });
  if (!canRead) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  try {
    const avatar = await downloadProfileAvatarFromSupabase(user.avatarStoragePath);
    return new Response(avatar, {
      headers: {
        "Content-Type": avatar.type || "image/webp",
        "Cache-Control": user.publicProfileConsent ? "public, max-age=3600" : "private, max-age=300",
        "X-DTSC-Avatar-Version": requestUrl.searchParams.get("v") || "current",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar unavailable" }, { status: 404 });
  }
}
