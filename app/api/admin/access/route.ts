import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { adminBlocks } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";
import { adminAccessSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = adminAccessSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid admin access settings" }, { status: 400 });
  }

  const adminRoleAccess = {
    ADMIN: adminBlocks.map((block) => block.id),
    MANAGER: body.data.MANAGER,
    SUPPORT: body.data.SUPPORT,
  };

  const settings = await prisma.appSetting.upsert({
    where: { id: "global" },
    update: { adminRoleAccess },
    create: { id: "global", adminRoleAccess },
  });

  await writeAuditLog({
    userId: session.userId,
    action: "ADMIN_ACCESS_UPDATED",
    entity: "AppSetting",
    entityId: settings.id,
    metadata: adminRoleAccess,
    request: req,
  });

  return NextResponse.json({ ok: true, adminRoleAccess });
}
