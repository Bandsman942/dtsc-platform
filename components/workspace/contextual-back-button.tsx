"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { useAppLocale } from "@/components/i18n/locale-provider";

const CURRENT_KEY = "dtsc:module-current:v1";
const PREVIOUS_KEY = "dtsc:module-previous:v1";

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.searchParams.has("token")) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Records only user-visible module routes, never identity tokens or external origins. */
export function ContextualBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const english = useAppLocale() === "en";
  const editedForms = useRef(new Set<HTMLFormElement>());
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    const track = (event: Event) => {
      if (event.target instanceof Element) {
        const form = event.target.closest("form");
        if (form) editedForms.current.add(form);
      }
    };
    document.addEventListener("input", track, true);
    document.addEventListener("change", track, true);
    return () => {
      document.removeEventListener("input", track, true);
      document.removeEventListener("change", track, true);
      editedForms.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const current = window.location.pathname + window.location.search;
    // Invitation tokens must not be placed in navigation storage.
    if (window.location.search.includes("token=")) return;
    try {
      const preceding = safeInternalPath(sessionStorage.getItem(CURRENT_KEY));
      if (preceding && preceding !== current) sessionStorage.setItem(PREVIOUS_KEY, preceding);
      sessionStorage.setItem(CURRENT_KEY, current);
    } catch {
      // Private browsing and restricted storage must not break navigation.
    }
  }, [pathname]);

  async function goBack() {
    if (navigating) return;
    const dirtyForm = [...editedForms.current].some((form) => form.isConnected);
    if (dirtyForm) {
      const confirmed = await confirmSensitiveAction({
        title: english ? "Leave without saving?" : "Quitter sans enregistrer ?",
        description: english
          ? "You have changes in a form on this screen. Going back may discard them."
          : "Un formulaire contient des modifications non enregistrées. Le retour risque de les perdre.",
        confirmLabel: english ? "Leave screen" : "Quitter la page",
        cancelLabel: english ? "Stay" : "Rester",
        tone: "warning",
      });
      if (!confirmed.confirmed) return;
    }
    setNavigating(true);
    const current = window.location.pathname + window.location.search;
    const requested = safeInternalPath(new URLSearchParams(window.location.search).get("returnTo"));
    if (requested && requested !== current) {
      try { sessionStorage.removeItem(PREVIOUS_KEY); sessionStorage.setItem(CURRENT_KEY, requested); } catch { /* storage optional */ }
      router.push(requested);
      return;
    }
    let previous: string | null = null;
    try {
      previous = safeInternalPath(sessionStorage.getItem(PREVIOUS_KEY));
    } catch {
      // Fall back to an authorized product landing page.
    }
    if (previous && previous !== current) {
      try { sessionStorage.removeItem(PREVIOUS_KEY); sessionStorage.setItem(CURRENT_KEY, previous); } catch { /* storage optional */ }
      router.push(previous);
      return;
    }
    const fallback = pathname.startsWith("/admin") ? "/admin" :
      pathname.startsWith("/enterprise-") || pathname.startsWith("/enterprise-modules") ? "/enterprise-admin" :
      pathname.startsWith("/support") ? "/support" : "/modules";
    if (fallback !== current && fallback !== pathname) router.push(fallback);
    else router.push("/dashboard");
  }

  return (
    <button
      type="button"
      onClick={() => void goBack()}
      disabled={navigating}
      data-contextual-module-back
      aria-label={english ? "Return to the previous page" : "Revenir à la page précédente"}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{english ? "Back" : "Retour"}</span>
    </button>
  );
}
