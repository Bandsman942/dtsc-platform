"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserLimitsForm({
  userId,
  dailyMessageLimit,
  dailyTokenLimit,
}: {
  userId: string;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/admin/users/${userId}/limits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="flex min-w-[220px] items-center gap-2">
      <input name="dailyMessageLimit" type="number" defaultValue={dailyMessageLimit} className="h-8 w-16 rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-xs text-dtsc-ink" />
      <input name="dailyTokenLimit" type="number" defaultValue={dailyTokenLimit} className="h-8 w-24 rounded-lg border border-dtsc-border bg-dtsc-surface px-2 text-xs text-dtsc-ink" />
      <button className="h-8 rounded-lg bg-dtsc-soft px-2 text-xs font-bold text-dtsc-blue" disabled={saving}>
        {saving ? "..." : "OK"}
      </button>
    </form>
  );
}
