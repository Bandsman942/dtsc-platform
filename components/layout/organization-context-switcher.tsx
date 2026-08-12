"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { getExperienceCopy } from "@/lib/experience-i18n";

type ContextOption = {
  id: string;
  label: string;
  role?: string | null;
};

type ContextSwitcherVariant = "default" | "mobileRail";

export function OrganizationContextSwitcher({
  currentOrganizationId,
  organizations,
  variant = "default",
}: {
  currentOrganizationId?: string | null;
  organizations: ContextOption[];
  variant?: ContextSwitcherVariant;
}) {
  const locale = useAppLocale();
  const copy = getExperienceCopy(locale).mobile;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = currentOrganizationId || "";
  const mobileRail = variant === "mobileRail";

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
        setError(body?.message || copy.workspaceOpenFailed);
        return;
      }

      // A hard reload rebuilds every Server Component from the newly signed
      // organization context while preserving the current URL.
      window.location.reload();
    } catch {
      setError(copy.workspaceConnectionFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={mobileRail
        ? "w-[82vw] min-w-[18rem] max-w-[24rem] shrink-0 snap-start"
        : "w-[82vw] min-w-[18rem] max-w-[24rem] shrink-0 snap-start lg:w-auto lg:min-w-0 lg:max-w-full lg:shrink"}
      data-workspace-context-switcher={mobileRail ? "mobile-rail" : "responsive"}
    >
      <label
        className={mobileRail
          ? "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-cyan-400/35 bg-dtsc-page/95 px-4 py-2.5 text-xs font-bold text-dtsc-muted shadow-[0_12px_32px_rgba(0,43,91,0.14)] backdrop-blur-xl"
          : "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-cyan-400/35 bg-dtsc-page/95 px-4 py-2.5 text-xs font-bold text-dtsc-muted shadow-[0_12px_32px_rgba(0,43,91,0.14)] backdrop-blur-xl lg:min-w-[15rem] lg:border-dtsc-border lg:bg-dtsc-page/90 lg:px-3 lg:py-2"}
      >
        <Building2 className="h-4 w-4 shrink-0 text-cyan-500" />
        <span className="sr-only">{copy.switchWorkspace}</span>
        <select
          value={value}
          disabled={pending}
          onChange={(event) => void changeContext(event.target.value)}
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-black text-dtsc-ink outline-none disabled:opacity-70 lg:text-xs"
          aria-label={copy.switchWorkspace}
          aria-describedby={error ? "organization-context-error" : undefined}
        >
          <option value="">{copy.personalWorkspace}</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <p id="organization-context-error" role="alert" className="mt-1 max-w-[24rem] break-words px-2 text-[0.68rem] font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}
