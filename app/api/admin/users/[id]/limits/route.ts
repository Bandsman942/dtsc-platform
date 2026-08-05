import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminUsageLimitSchema } from "@/lib/validators";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.USERS_MANAGE);
  if (access.response) return access.response;
  const body = adminUsageLimitSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid usage limits", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const before = await prisma.user.findUnique({ where: { id }, select: { dailyMessageLimit: true, dailyTokenLimit: true } });
  if (!before) return NextResponse.json({ error: "User not found", reasonCode: "NOT_FOUND" }, { status: 404 });
  const updated = await prisma.user.update({ where: { id }, data: { dailyMessageLimit: body.data.dailyMessageLimit, dailyTokenLimit: body.data.dailyTokenLimit }, select: { id: true, dailyMessageLimit: true, dailyTokenLimit: true } });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_USER_LIMITS_UPDATED", entity: "User", entityId: id, before, after: updated, reasonCode: access.reasonCode, riskLevel: "MEDIUM", request: req });
  return NextResponse.json({ ok: true, user: updated, reasonCode: access.reasonCode });
}
