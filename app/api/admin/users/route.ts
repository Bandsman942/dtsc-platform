import { NextResponse } from "next/server";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { ensureBillingPlans, getNextBillingPeriod } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security";
import { adminCreateUserSchema } from "@/lib/validators";
import { writeAuditLog } from "@/lib/audit";

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

  const plans = await ensureBillingPlans();
  const freemium = plans.find((plan) => plan.id === "freemium");
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

  if (freemium) {
    const { start, end } = getNextBillingPeriod();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: freemium.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
  }

  await writeAuditLog({
    userId: session.userId,
    action: "ADMIN_USER_CREATED",
    entity: "User",
    entityId: user.id,
    metadata: { role: body.data.role, email: body.data.email },
    request: req,
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
}
