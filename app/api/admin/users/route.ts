import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";
import { adminCreateUserSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = adminCreateUserSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid user data" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email: body.data.email },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name: body.data.name,
      email: body.data.email,
      passwordHash: hashPassword(body.data.password),
      role: body.data.role,
      companyName: body.data.companyName || null,
      phone: body.data.phone || null,
      dailyMessageLimit: body.data.dailyMessageLimit,
      dailyTokenLimit: body.data.dailyTokenLimit,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
}
