"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserStatus } from "@prisma/client";

export function UserStatusSelect({
  userId,
  status,
}: {
  userId: string;
  status: UserStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);

  async function updateStatus(nextStatus: string) {
    setValue(nextStatus as UserStatus);
    const response = await fetch(`/api/admin/users/${userId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      setValue(status);
      return;
    }

    router.refresh();
  }

  return (
    <select
      value={value}
      onChange={(event) => updateStatus(event.target.value)}
      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
    >
      <option value="ACTIVE">ACTIVE</option>
      <option value="SUSPENDED">SUSPENDED</option>
      <option value="PENDING">PENDING</option>
    </select>
  );
}
