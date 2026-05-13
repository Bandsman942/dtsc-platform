"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ListControls({
  query,
  onQueryChange,
  page,
  pageCount,
  totalCount,
  filteredCount,
  placeholder = "Rechercher...",
  onPageChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  pageCount: number;
  totalCount: number;
  filteredCount: number;
  placeholder?: string;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mb-4 grid w-full max-w-full min-w-0 gap-3 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="relative w-full min-w-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full min-w-0 truncate rounded-xl bg-dtsc-surface pl-10 pr-3 text-dtsc-ink"
        />
      </div>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 md:w-auto md:justify-end">
        <span className="min-w-0 flex-1 truncate text-[0.7rem] font-bold text-dtsc-muted md:flex-none md:text-xs">
          {filteredCount}/{totalCount} élément(s) · page {page}/{pageCount}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
            className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
