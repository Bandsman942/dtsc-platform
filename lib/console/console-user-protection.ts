import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getProtectedUserMutation(input: {
  actorUserId: string;
  targetUserId: string;
  nextRole?: UserRole;
  nextStatus?: UserStatus;
}) {
  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!target) return { allowed: false as const, reasonCode: "NOT_FOUND", target: null };

  if (target.id === input.actorUserId) {
    if (input.nextRole && input.nextRole !== UserRole.ADMIN) {
      return { allowed: false as const, reasonCode: "SELF_ROLE_CHANGE_PROTECTED", target };
    }
    if (input.nextStatus && input.nextStatus !== UserStatus.ACTIVE) {
      return { allowed: false as const, reasonCode: "SELF_SUSPENSION_PROTECTED", target };
    }
  }

  const removesActiveAdmin = target.role === UserRole.ADMIN && target.status === UserStatus.ACTIVE && (
    (input.nextRole && input.nextRole !== UserRole.ADMIN) ||
    (input.nextStatus && input.nextStatus !== UserStatus.ACTIVE)
  );
  if (removesActiveAdmin) {
    const activeAdminCount = await prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } });
    if (activeAdminCount <= 1) return { allowed: false as const, reasonCode: "LAST_ADMIN_PROTECTED", target };
  }

  return { allowed: true as const, reasonCode: "ALLOWED", target };
}
