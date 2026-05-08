"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import { formatEnumLabel } from "@/lib/labels";

export function UserRoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const router = useRouter();
  const [value, setValue] = useState(role);

  async function updateRole(nextRole: string) {
    setValue(nextRole as UserRole);
    const response = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });

    if (!response.ok) {
      setValue(role);
      return;
    }

    router.refresh();
  }

  return (
    <select
      value={value}
      onChange={(event) => updateRole(event.target.value)}
      className="h-8 rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-xs font-bold text-dtsc-ink"
    >
      <option value="ADMIN">{formatEnumLabel("ADMIN")}</option>
      <option value="MANAGER">{formatEnumLabel("MANAGER")}</option>
      <option value="CLIENT">{formatEnumLabel("CLIENT")}</option>
      <option value="SUPPORT">{formatEnumLabel("SUPPORT")}</option>
    </select>
  );
}
