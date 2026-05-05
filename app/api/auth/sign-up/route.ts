import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signUpSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/security";
import { setSessionCookie } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const body = signUpSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid registration data" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: body.data.email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const role =
    process.env.ADMIN_EMAIL?.toLowerCase() === body.data.email
      ? UserRole.ADMIN
      : UserRole.CLIENT;

  const settings = await getAppSettings();
  const user = await prisma.user.create({
    data: {
      name: body.data.name,
      email: body.data.email,
      passwordHash: hashPassword(body.data.password),
      companyName: body.data.companyName || null,
      phone: body.data.phone || null,
      role,
      dailyMessageLimit: settings.defaultDailyMessageLimit,
      dailyTokenLimit: settings.defaultDailyTokenLimit,
    },
  });

  await setSessionCookie(user);

  return NextResponse.json({ ok: true });
}
