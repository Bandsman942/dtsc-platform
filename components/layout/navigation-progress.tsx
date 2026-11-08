"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * Feedback for same-product navigation while the next RSC route is loading.
 * Works for every link in AppShell without changing business routes or permissions.
 */
export function NavigationProgress({ locale }: { locale?: string | null }) {
  const pathname = usePathname();
  const english = locale === "en";
  const [target, setTarget] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setTarget(null);
    setSlow(false);
  }, [pathname]);

  useEffect(() => {
    if (!target) return;
    setSlow(false);
    const delay = window.setTimeout(() => setSlow(true), 6000);
    const expiry = window.setTimeout(() => setTarget(null), 30000);
    return () => { window.clearTimeout(delay); window.clearTimeout(expiry); };
  }, [target]);

  useEffect(() => {
    function captureNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setTarget(url.pathname + url.search);
      // Query-only workspaces update in place; do not leave a stale progress indicator.
      if (url.pathname === window.location.pathname) {
        window.setTimeout(() => setTarget((current) => current === url.pathname + url.search ? null : current), 1600);
      }
    }

    document.addEventListener("click", captureNavigation, true);
    return () => document.removeEventListener("click", captureNavigation, true);
  }, []);

  if (!target) return null;

  return (
    <div data-dtsc-navigation-progress className="pointer-events-none fixed inset-x-0 top-0 z-[110]" role="status" aria-live="polite">
      <div className="h-1 w-full overflow-hidden bg-dtsc-soft">
        <div className="h-full w-1/3 animate-pulse rounded-r-full bg-cyan-500" />
      </div>
      <div className="pointer-events-auto mx-auto mt-2 flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs font-semibold text-dtsc-ink shadow-lg">
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-dtsc-blue" aria-hidden="true" />
        <span>{slow
          ? english ? "Loading is taking longer than expected." : "Le chargement prend plus de temps que prévu."
          : english ? "Opening workspace…" : "Ouverture de l’espace de travail…"}</span>
        {slow ? (
          <a href={target} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-dtsc-blue underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {english ? "Retry" : "Réessayer"}
          </a>
        ) : null}
      </div>
    </div>
  );
}
