"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { useAppLocale } from "@/components/i18n/locale-provider";

const STACK_KEY = "dtsc:module-navigation:v2";
const SCROLL_KEY = "dtsc:module-navigation-scroll:v2";
const RESTORE_KEY = "dtsc:module-navigation-restore:v2";
const MAX_ROUTES = 24;

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    // Store only non-secret navigation context, never invitation, OAuth or one-time tokens.
    if ([...url.searchParams.keys()].some((key) => /token|secret|auth|code|key|password|verification/i.test(key))) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

function readStack() {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === "string")
        .map((entry) => safeInternalPath(entry)).filter((entry): entry is string => Boolean(entry)).slice(-MAX_ROUTES)
      : [];
  } catch {
    return [];
  }
}

function saveStack(stack: string[]) {
  try { sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_ROUTES))); }
  catch { /* session storage may be unavailable */ }
}

function recordRoute() {
  const route = safeInternalPath(window.location.pathname + window.location.search + window.location.hash);
  if (!route) return;
  const stack = readStack();
  if (!stack.length) {
    saveStack([route]);
    return;
  }
  const last = stack[stack.length - 1];
  if (last === route) return;
  // Search/filter updates within one module replace the top entry, not another history step.
  if (new URL(last, window.location.origin).pathname === new URL(route, window.location.origin).pathname) {
    stack[stack.length - 1] = route;
    saveStack(stack);
    return;
  }
  // Browser Back/Forward may already have reached an earlier module.
  const existing = stack.lastIndexOf(route);
  saveStack(existing >= 0 ? stack.slice(0, existing + 1) : [...stack, route]);
}

function saveScroll() {
  try {
    const route = safeInternalPath(window.location.pathname + window.location.search + window.location.hash);
    if (!route) return;
    const raw: Record<string, number> = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
    const scroll: Record<string, number> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    delete scroll[route];
    scroll[route] = window.scrollY;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(Object.fromEntries(Object.entries(scroll).slice(-MAX_ROUTES))));
  } catch { /* storage optional */ }
}

/** Local-tab, tenant-agnostic navigation contains safe routes only. Access is always revalidated server-side. */
export function ContextualBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const english = useAppLocale() === "en";
  const editedForms = useRef(new Set<HTMLFormElement>());
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    if (!pathname) return;
    recordRoute();
    setNavigating(false);
    try {
      const current = safeInternalPath(window.location.pathname + window.location.search + window.location.hash);
      if (current && sessionStorage.getItem(RESTORE_KEY) === current) {
        sessionStorage.removeItem(RESTORE_KEY);
        const raw = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
        const top = typeof raw?.[current] === "number" ? raw[current] : 0;
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" })));
      }
    } catch { /* browser security settings may disable storage */ }
  }, [pathname]);

  useEffect(() => {
    const forms = editedForms.current;
    const track = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const form = event.target.closest("form");
      // Filters and searches change the view; they are not unsaved business records.
      if (form && !form.matches('[role="search"], [data-navigation-filter-form]') &&
        !form.querySelector('[data-form-no-unsaved-warning]')) {
        const target = event.target;
        if (target instanceof HTMLInputElement && ["search", "hidden"].includes(target.type)) return;
        editedForms.current.add(form);
      }
    };
    const markSaved = (event: Event) => {
      if (event.target instanceof HTMLFormElement) editedForms.current.delete(event.target);
    };
    const rememberLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!link) return;
      const target = link.getAttribute("href");
      if (!target || !safeInternalPath(target)) return;
      recordRoute();
      saveScroll();
    };
    document.addEventListener("input", track, true);
    document.addEventListener("change", track, true);
    document.addEventListener("reset", markSaved, true);
    document.addEventListener("dtsc:form-saved", markSaved, true);
    document.addEventListener("click", rememberLink, true);
    return () => {
      document.removeEventListener("input", track, true);
      document.removeEventListener("change", track, true);
      document.removeEventListener("reset", markSaved, true);
      document.removeEventListener("dtsc:form-saved", markSaved, true);
      document.removeEventListener("click", rememberLink, true);
      forms.clear();
    };
  }, []);

  async function goBack() {
    if (navigating) return;
    const dirtyForm = [...editedForms.current].some((form) => form.isConnected);
    if (dirtyForm) {
      const confirmation = await confirmSensitiveAction({
        title: english ? "Leave without saving?" : "Quitter sans enregistrer ?",
        description: english
          ? "You have changes in a form on this screen. Going back may discard them."
          : "Un formulaire contient des modifications non enregistrées. Le retour risque de les perdre.",
        confirmLabel: english ? "Leave screen" : "Quitter la page",
        cancelLabel: english ? "Stay" : "Rester",
        tone: "warning",
      });
      if (!confirmation.confirmed) return;
    }
    setNavigating(true);
    recordRoute();
    saveScroll();
    const current = safeInternalPath(window.location.pathname + window.location.search + window.location.hash);
    const requested = safeInternalPath(new URLSearchParams(window.location.search).get("returnTo"));
    const stack = readStack();
    const previous = stack.length > 1 ? stack[stack.length - 2] : null;
    const fallback = pathname.startsWith("/admin") ? "/admin" :
      pathname.startsWith("/enterprise-") || pathname.startsWith("/enterprise-modules") ? "/enterprise-admin" :
      pathname.startsWith("/support") ? "/support" : "/modules";
    const target = requested && requested !== current ? requested
      : previous && previous !== current ? previous
      : fallback !== current ? fallback : "/dashboard";
    const index = stack.lastIndexOf(target);
    saveStack(index >= 0 ? stack.slice(0, index + 1) : [target]);
    try { sessionStorage.setItem(RESTORE_KEY, target); } catch { /* storage optional */ }
    router.push(target, { scroll: false });
    // Same-path query navigation may not remount this component.
    window.setTimeout(() => setNavigating(false), 1200);
  }

  return (
    <button type="button" onClick={() => void goBack()} disabled={navigating}
      data-contextual-module-back
      aria-label={english ? "Return to the previous page" : "Revenir à la page précédente"}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{english ? "Back" : "Retour"}</span>
    </button>
  );
}
