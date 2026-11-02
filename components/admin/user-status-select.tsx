"use client";

import type { UserStatus } from "@prisma/client";
import { CriticalChangeSelect } from "@/components/admin/critical-change-select";
import { formatEnumLabel } from "@/lib/labels";

export function UserStatusSelect({ userId, status }: { userId: string; status: UserStatus }) {
  return (
    <CriticalChangeSelect
      currentValue={status}
      endpoint={`/api/admin/users/${userId}/status`}
      field="status"
      options={["ACTIVE","SUSPENDED","PENDING"].map((value) => ({ value, label: formatEnumLabel(value) }))}
    />
  );
}
