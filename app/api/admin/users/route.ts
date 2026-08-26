import { NextResponse } from "next/server";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { requireConsoleCapability } from "@/lib/admin-api";
import { writeAuditLog } from "@/lib/audit";
import { ensureBillingPlans, getNextBillingPeriod } from "@/lib/billing";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/request-security";
import { hashPassword } from "@/lib/security";
import { adminCreateUserSchema } from "@/lib/validators";

function validationFieldErrors(issues: Array<{ path: PropertyKey[] }>) {
  return issues.reduce<Record<string, "INVALID_VALUE">>((errors, issue) => {
    const field = issue.path[0];
    if (typeof field === "string") errors[field] = "INVALID_VALUE";
    return errors;
  }, {});
}

async function auditRejectedCreate(input: { userId: string; reasonCode: string; request: Request }) {
  await writeAuditLog({
    userId: input.userId,
    action: "CONSOLE_USER_CREATE_REJECTED",
    entity: "User",
    entityId: "new-account",
    result: "DENIED",
    reasonCode: input.reasonCode,
    riskLevel: "MEDIUM",
    request: input.request,
  }).catch(() => undefined);
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden", reasonCode: "ORIGIN_FORBIDDEN" }, { status: 403 });
  }

  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.USERS_MANAGE);
  if (access.response) return access.response;

  const body = adminCreateUserSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    await auditRejectedCreate({ userId: access.session.userId, reasonCode: "VALIDATION_ERROR", request: req });
    return NextResponse.json(
      {
        error: "Invalid account data",
        reasonCode: "VALIDATION_ERROR",
        fieldErrors: validationFieldErrors(body.error.issues),
      },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: body.data.email },
    select: { id: true },
  });

  if (existing) {
    await auditRejectedCreate({ userId: access.session.userId, reasonCode: "EMAIL_ALREADY_EXISTS", request: req });
    return NextResponse.json(
      { error: "Account already exists", reasonCode: "EMAIL_ALREADY_EXISTS", fieldErrors: { email: "ALREADY_EXISTS" } },
      { status: 409 },
    );
  }

  try {
    const plans = await ensureBillingPlans();
    const freemium = plans.find((plan) => plan.id === "freemium");
    if (!freemium) {
      await auditRejectedCreate({ userId: access.session.userId, reasonCode: "PROVISIONING_UNAVAILABLE", request: req });
      return NextResponse.json(
        { error: "Account provisioning unavailable", reasonCode: "PROVISIONING_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const { start, end } = getNextBillingPeriod();
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
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
        select: { id: true, role: true },
      });

      await tx.subscription.create({
        data: {
          userId: createdUser.id,
          planId: freemium.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: start,
          currentPeriodEnd: end,
        },
      });
      return createdUser;
    });

    await writeAuditLog({
      userId: access.session.userId,
      action: "ADMIN_USER_CREATED",
      entity: "User",
      entityId: user.id,
      after: { role: user.role },
      reasonCode: access.reasonCode,
      riskLevel: "HIGH",
      request: req,
    });

    return NextResponse.json({ ok: true, user: { id: user.id }, reasonCode: "USER_CREATED" }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await auditRejectedCreate({ userId: access.session.userId, reasonCode: "EMAIL_ALREADY_EXISTS", request: req });
      return NextResponse.json(
        { error: "Account already exists", reasonCode: "EMAIL_ALREADY_EXISTS", fieldErrors: { email: "ALREADY_EXISTS" } },
        { status: 409 },
      );
    }

    await auditRejectedCreate({ userId: access.session.userId, reasonCode: "USER_CREATION_FAILED", request: req });
    return NextResponse.json(
      { error: "Account creation failed", reasonCode: "USER_CREATION_FAILED" },
      { status: 500 },
    );
  }
}
