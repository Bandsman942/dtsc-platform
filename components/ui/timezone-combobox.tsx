"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { supportedTimeZones } from "@/lib/timezones";

export function TimeZoneCombobox({ name, defaultValue = "Africa/Kinshasa", locale = "fr", disabled = false }: {
  name: string;
  defaultValue?: string | null;
  locale?: "fr" | "en";
  disabled?: boolean;
}) {
  const listId = useId();
  const zones = useMemo(() => supportedTimeZones(), []);
  const [selected, setSelected] = useState(defaultValue || "UTC");
  const [query, setQuery] = useState(defaultValue || "UTC");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const options = useMemo(() => zones.filter((zone) => zone.toLowerCase().includes(query.trim().toLowerCase())), [query, zones]);
  const choose = (zone: string) => {
    setSelected(zone);
    setQuery(zone);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "Home" && open) { event.preventDefault(); setHighlighted(0); return; }
    if (event.key === "End" && open) { event.preventDefault(); setHighlighted(Math.max(0, options.length - 1)); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
    }
    if (event.key === "Enter" && open && options[highlighted]) {
      event.preventDefault();
      choose(options[highlighted]);
    }
  };

  return <div className="relative min-w-0 max-w-full" data-dtsc-timezone-combobox>
    <input type="hidden" name={name} value={selected} />
    <div className="relative flex min-w-0 items-center">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-dtsc-muted" />
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && options[highlighted] ? `${listId}-option-${highlighted}` : undefined}
        aria-label={locale === "en" ? "Search for a time zone" : "Rechercher un fuseau horaire"}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setSelected(""); setHighlighted(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(selected); }, 120)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={locale === "en" ? "Search IANA time zones…" : "Rechercher parmi les fuseaux IANA…"}
        className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-dtsc-border bg-dtsc-surface py-2 pl-9 pr-9 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60"
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-dtsc-muted" />
    </div>
    {open ? <div id={listId} role="listbox" className="absolute inset-x-0 z-[1250] mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-dtsc-border bg-dtsc-surface p-1 shadow-xl">
      {options.length ? options.map((zone, index) => <button
        type="button"
        role="option"
        aria-selected={selected === zone}
        id={`${listId}-option-${index}`}
        tabIndex={-1}
        key={zone}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(zone)}
        className={`flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-dtsc-ink hover:bg-dtsc-soft focus-visible:bg-dtsc-soft ${highlighted === index ? "bg-dtsc-soft" : ""}`}
      >{zone}{selected === zone ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}</button>) : <p className="p-3 text-sm text-dtsc-muted">{locale === "en" ? "No matching time zone" : "Aucun fuseau horaire correspondant"}</p>}
    </div> : null}
  </div>;
}
