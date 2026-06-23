"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBar({
  value,
  onChange,
  placeholder = "Rechercher...",
  ariaLabel = "Rechercher",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex h-11 min-w-0 items-center gap-2 rounded-full border border-dtsc-border bg-dtsc-page px-3 text-dtsc-muted transition focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-300/30", className)}>
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-dtsc-ink outline-none placeholder:text-dtsc-muted"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="rounded-full p-1 text-dtsc-muted transition hover:bg-dtsc-soft hover:text-dtsc-ink" aria-label="Effacer la recherche">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}
