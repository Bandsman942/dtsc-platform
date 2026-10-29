"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";

const OPEN_EVENT = "dtsc:erp-command-open";
// Dialog, shortcuts and search UI are only downloaded after an explicit user gesture.
const EnterpriseCommandDialog = dynamic(
  () => import("@/components/enterprise/enterprise-command-dialog").then((module) => module.EnterpriseCommandDialog),
  { ssr: false },
);

export function EnterpriseCommandTrigger({
  locale,
  variant = "header",
}: {
  locale?: string | null;
  variant?: "header" | "rail";
}) {
  const english = locale === "en";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label={english ? "Find an authorized ERP module" : "Rechercher un module ERP autorisé"}
      aria-keyshortcuts="Control+K Meta+K"
      className={variant === "rail"
        ? "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page/72 px-3 text-xs font-black text-dtsc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-xs font-bold text-dtsc-blue hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span>{english ? "Find a module" : "Modules"}</span>
      {variant === "header" ? <kbd className="hidden rounded border border-dtsc-border px-1.5 py-0.5 text-[0.65rem] font-medium text-dtsc-muted xl:inline">Ctrl K</kbd> : null}
    </button>
  );
}

/** Client-only command palette uses exactly the server-authorized shell navigation. */
export function EnterpriseCommandPalette({
  organizationId,
  userId,
  activeOrganizationRole,
  locale,
  modules,
}: {
  organizationId: string;
  userId: string;
  activeOrganizationRole?: string | null;
  locale?: string | null;
  modules: EnterpriseNavigationModule[];
}) {
  const [open, setOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const available = modules.length > 0;

  useEffect(() => {
    if (!available) return;
    const openFromTouch = () => { setFocusSearch(false); setOpen(true); };
    const openFromKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setFocusSearch(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, openFromTouch);
    window.addEventListener("keydown", openFromKeyboard);
    return () => {
      window.removeEventListener(OPEN_EVENT, openFromTouch);
      window.removeEventListener("keydown", openFromKeyboard);
    };
  }, [available]);

  if (!available) return null;
  return open ? (
    <EnterpriseCommandDialog
      organizationId={organizationId}
      userId={userId}
      activeOrganizationRole={activeOrganizationRole}
      modules={modules}
      locale={locale}
      focusSearch={focusSearch}
      onClose={() => setOpen(false)}
    />
  ) : null;
}
