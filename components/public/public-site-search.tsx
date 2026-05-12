"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchResult = {
  title: string;
  description: string;
  href: string;
  category: string;
};

export function PublicSiteSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/public/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { results?: SearchResult[] };
        setResults(data.results || []);
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative z-[110] w-full">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dtsc-blue" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        placeholder="Rechercher un service, une solution, un secteur, un article..."
        autoComplete="off"
        className="h-12 rounded-[1rem] border-dtsc-border bg-dtsc-surface pl-12 pr-11 text-sm font-semibold text-dtsc-ink shadow-sm outline-none transition placeholder:text-dtsc-muted focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/20"
        aria-label="Rechercher sur les pages publiques DTSC"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults([]);
            setOpen(false);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-blue"
          aria-label="Effacer la recherche"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[130] overflow-hidden rounded-[1.25rem] border border-dtsc-border bg-dtsc-surface/95 shadow-[0_28px_80px_rgba(0,23,54,0.24)] backdrop-blur-xl">
          <div className="max-h-[min(70dvh,25rem)] overflow-y-auto p-2 sm:p-3">
            {results.length > 0 ? (
              results.map((result) => (
                <Link
                  key={`${result.href}-${result.title}`}
                  href={result.href}
                  onClick={() => setOpen(false)}
                  className="group block rounded-xl px-3 py-3 transition hover:bg-dtsc-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">
                        {result.category}
                      </p>
                      <p className="mt-1 text-sm font-black text-dtsc-ink">{result.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-dtsc-muted">{result.description}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-dtsc-blue transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-xl bg-dtsc-page px-3 py-4 text-sm text-dtsc-muted">
                Aucun résultat trouvé. Essayez avec un service, une solution, un secteur ou un sujet data/IA.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
