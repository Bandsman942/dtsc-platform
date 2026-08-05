import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { userStatusSchema } from "@/lib/validators";
import { requireConsoleCapability } from "@/lib/admin-api";
import { CONSOLE_CAPABILITIES } from "@/lib/console/console-capabilities";
import { getProtectedUserMutation } from "@/lib/console/console-user-protection";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireConsoleCapability(CONSOLE_CAPABILITIES.USERS_MANAGE);
  if (access.response) return access.response;
  const body = userStatusSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid status", reasonCode: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const protection = await getProtectedUserMutation({ actorUserId: access.session.userId, targetUserId: id, nextStatus: body.data.status });
  if (!protection.allowed) {
    await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_USER_STATUS_CHANGE_DENIED", entity: "User", entityId: id, result: "DENIED", reasonCode: protection.reasonCode, riskLevel: "HIGH", request: req });
    return NextResponse.json({ error: "Protected user mutation", reasonCode: protection.reasonCode }, { status: protection.reasonCode === "NOT_FOUND" ? 404 : 409 });
  }

  const updated = await prisma.user.update({ where: { id }, data: { status: body.data.status }, select: { id: true, role: true, status: true } });
  await writeAuditLog({ userId: access.session.userId, action: "CONSOLE_USER_STATUS_UPDATED", entity: "User", entityId: id, before: { status: protection.target.status }, after: { status: updated.status }, reasonCode: access.reasonCode, riskLevel: "HIGH", request: req });
  return NextResponse.json({ ok: true, user: updated, reasonCode: access.reasonCode });
}
