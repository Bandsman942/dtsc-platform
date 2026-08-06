"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchResult = { title: string; description: string; href: string; category: string };

export function PublicSiteSearch({ embedded = false, onNavigate }: { embedded?: boolean; onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/public/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal });
        if (!response.ok) { setResults([]); return; }
        const data = await response.json() as { results?: SearchResult[] };
        setResults((data.results || []).slice(0, 12));
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [query]);

  useEffect(() => {
    if (embedded) return;
    function handleClickOutside(event: MouseEvent) { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [embedded]);

  return (
    <div ref={containerRef} className="relative z-[110] w-full min-w-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dtsc-blue" />
        <Input autoFocus={embedded} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => query.trim().length >= 2 && setOpen(true)} placeholder="Rechercher un service, une solution, un secteur, un article…" autoComplete="off" className="h-12 w-full rounded-xl border-dtsc-border bg-dtsc-surface pl-12 pr-11 text-sm font-semibold text-dtsc-ink shadow-sm focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/20" aria-label="Rechercher sur les pages publiques DTSC" aria-controls="public-search-results" />
        {query ? <button type="button" onClick={() => { setQuery(""); setResults([]); setOpen(false); }} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-blue" aria-label="Effacer la recherche"><X className="h-4 w-4" /></button> : null}
      </div>
      {(open || loading) && query.trim().length >= 2 ? (
        <div id="public-search-results" className={`${embedded ? "mt-3" : "absolute left-0 right-0 top-[calc(100%+0.55rem)]"} z-[135] max-h-[min(62dvh,27rem)] overflow-y-auto rounded-[var(--dtsc-panel-radius)] border border-dtsc-border bg-dtsc-surface p-2 shadow-[var(--dtsc-shadow-lg)]`} aria-live="polite">
          {loading ? <p className="rounded-xl bg-dtsc-page px-4 py-5 text-sm text-dtsc-muted">Recherche en cours…</p> : results.length ? results.map((result) => (
            <Link key={`${result.href}-${result.title}`} href={result.href} onClick={() => { setOpen(false); onNavigate?.(); }} className="group block rounded-xl px-4 py-3 transition hover:bg-dtsc-soft">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="dtsc-label text-dtsc-blue">{result.category}</p><p className="mt-1 font-semibold text-dtsc-ink">{result.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-dtsc-muted">{result.description}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:translate-x-0.5" /></div>
            </Link>
          )) : <p className="rounded-xl bg-dtsc-page px-4 py-5 text-sm text-dtsc-muted">Aucun résultat publié. Essayez un levier, un secteur ou un thème data/IA.</p>}
        </div>
      ) : null}
    </div>
  );
}
