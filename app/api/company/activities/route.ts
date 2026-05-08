import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeApiLog, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { companyActivitySchema } from "@/lib/validators";

function normalizeEmptyStrings<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value])) as T;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session) {
    await writeApiLog({ request: req, statusCode: 401, startedAt });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = companyActivitySchema.safeParse(await req.json());
  if (!body.success) {
    await writeApiLog({ request: req, statusCode: 400, userId: session.userId, startedAt });
    return NextResponse.json({ error: "Invalid company activity" }, { status: 400 });
  }

  const activity = await prisma.companyActivity.create({
    data: { ...normalizeEmptyStrings(body.data), userId: session.userId },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "COMPANY_ACTIVITY_CREATED",
    entity: "CompanyActivity",
    entityId: activity.id,
    request: req,
  });
  await writeApiLog({ request: req, statusCode: 201, userId: session.userId, startedAt });

  return NextResponse.json({ ok: true, activity }, { status: 201 });
}
