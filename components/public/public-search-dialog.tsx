"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PublicSiteSearch } from "@/components/public/public-site-search";

export function PublicSearchDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface text-dtsc-blue shadow-sm transition hover:bg-dtsc-soft ${compact ? "h-10 w-10" : "h-10 px-3 text-sm font-semibold"}`}
        aria-label="Rechercher sur le site DTSC"
      >
        <Search className="h-4 w-4" />{compact ? null : <span>Rechercher</span>}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-[rgba(0,23,54,0.88)] p-4 backdrop-blur-xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="public-search-title">
          <div className="mx-auto mt-[8vh] max-w-3xl rounded-[var(--dtsc-modal-radius)] border border-white/15 bg-dtsc-surface p-4 shadow-[var(--dtsc-shadow-floating)] sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="dtsc-label text-dtsc-blue">Recherche DTSC</p><h2 id="public-search-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-dtsc-ink">Trouvez un levier, une solution ou une publication</h2></div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dtsc-border text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue" aria-label="Fermer la recherche"><X className="h-5 w-5" /></button>
            </div>
            <PublicSiteSearch embedded onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
