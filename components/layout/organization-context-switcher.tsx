"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";

type ContextOption = {
  id: string;
  label: string;
  role?: string | null;
};

export function OrganizationContextSwitcher({
  currentOrganizationId,
  organizations,
}: {
  currentOrganizationId?: string | null;
  organizations: ContextOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const value = currentOrganizationId || "";

  async function changeContext(nextOrganizationId: string) {
    setPending(true);
    await fetch("/api/account/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: nextOrganizationId || null }),
    }).catch(() => null);
    setPending(false);
    router.refresh();
  }

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page/70 px-2 py-1.5 text-xs font-bold text-dtsc-muted">
      <Building2 className="h-4 w-4 shrink-0 text-cyan-500" />
      <select
        value={value}
        disabled={pending}
        onChange={(event) => void changeContext(event.target.value)}
        className="min-w-0 bg-transparent text-xs font-black text-dtsc-ink outline-none"
        aria-label="Changer d'espace DTSC"
      >
        <option value="">Espace client standard</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.label}{organization.role ? ` · ${organization.role}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
