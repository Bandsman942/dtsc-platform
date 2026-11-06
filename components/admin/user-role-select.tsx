"use client";

import type { UserRole } from "@prisma/client";
import { CriticalChangeSelect } from "@/components/admin/critical-change-select";
import { formatEnumLabel } from "@/lib/labels";

export function UserRoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  return (
    <CriticalChangeSelect
      currentValue={role}
      endpoint={`/api/admin/users/${userId}/role`}
      field="role"
      options={["ADMIN","MANAGER","CLIENT","SUPPORT"].map((value) => ({ value, label: formatEnumLabel(value) }))}
    />
  );
}
