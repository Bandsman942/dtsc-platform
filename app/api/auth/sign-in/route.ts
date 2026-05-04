import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/security";
import { setSessionCookie } from "@/lib/auth";
import { ensureDefaultAdmin } from "@/lib/default-admin";

export async function POST(req: Request) {
  const body = signInSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  await ensureDefaultAdmin(body.data.email, body.data.password);

  const user = await prisma.user.findUnique({
    where: { email: body.data.email },
  });

  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }

  await setSessionCookie(user);

  return NextResponse.json({ ok: true });
}
