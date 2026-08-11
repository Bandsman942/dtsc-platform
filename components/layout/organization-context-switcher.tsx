"use client";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = currentOrganizationId || "";

  async function changeContext(nextOrganizationId: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: nextOrganizationId || null }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(body?.message || "Impossible de changer de contexte.");
        return;
      }

      // A hard reload preserves the current URL while rebuilding every Server Component
      // and client workspace from the newly signed organization context.
      window.location.reload();
    } catch {
      setError("Impossible de changer de contexte. Vérifiez votre connexion puis réessayez.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      <label className="flex min-w-[15rem] max-w-[calc(100vw-2rem)] shrink-0 items-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page/90 px-3 py-2 text-xs font-bold text-dtsc-muted shadow-[0_12px_32px_rgba(0,43,91,0.12)] backdrop-blur-xl">
        <Building2 className="h-4 w-4 shrink-0 text-cyan-500" />
        <select
          value={value}
          disabled={pending}
          onChange={(event) => void changeContext(event.target.value)}
          className="w-full min-w-0 truncate bg-transparent text-xs font-black text-dtsc-ink outline-none"
          aria-label="Changer d'espace DTSC"
          aria-describedby={error ? "organization-context-error" : undefined}
        >
          <option value="">Espace client standard</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.label}{organization.role ? ` · ${organization.role}` : ""}
            </option>
          ))}
        </select>
      </label>
      {error ? <p id="organization-context-error" role="alert" className="mt-1 max-w-[18rem] break-words px-2 text-[0.68rem] font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}
