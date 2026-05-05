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
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 rounded-xl bg-dtsc-surface pl-10 text-dtsc-ink"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <span className="text-xs font-bold text-dtsc-muted">
          {filteredCount}/{totalCount} élément(s) · page {page}/{pageCount}
        </span>
        <div className="flex items-center gap-2">
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
