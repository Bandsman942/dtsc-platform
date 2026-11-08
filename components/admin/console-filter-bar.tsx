import type { ReactNode } from "react";
import { ConsoleSavedFilterViews } from "@/components/admin/console-saved-filter-views";

export function ConsoleFilterBar({
  action, search, children, hidden, locale = "fr", userId,
}: {
  action: string; search?: string; children?: ReactNode;
  hidden?: Record<string, string | undefined>;
  locale?: "fr" | "en"; userId?: string;
}) {
  const en = locale === "en";
  return (
    <div data-console-smart-filter-bar className="min-w-0 max-w-full space-y-2">
      <form action={action} role="search" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto]">
        {Object.entries(hidden || {}).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
        <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
          {en ? "Search" : "Recherche"}
          <input type="search" name="search" defaultValue={search || ""} maxLength={120} enterKeyHint="search"
            autoComplete="off" className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            placeholder={en ? "Name, reference, status…" : "Nom, référence, statut…"} />
        </label>
        {children}
        <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
          {en ? "Per page" : "Par page"}
          <select name="pageSize" defaultValue={hidden?.pageSize || "25"}
            className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            {[10,20,25,50,100].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-11 self-end rounded-xl bg-[#002b5b] px-5 py-3 text-sm font-black text-white hover:bg-[#001736] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          {en ? "Apply" : "Appliquer"}
        </button>
      </form>
      <ConsoleSavedFilterViews locale={locale} userId={userId}/>
    </div>
  );
}

export function ConsoleSelectFilter({ name, label, value, options, locale = "fr" }: {
  name: string; label: string; value?: string | null;
  options: Array<{ value: string; label: string }>; locale?: "fr" | "en";
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
      {label}
      <select name={name} defaultValue={value || ""}
        className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <option value="">{locale === "en" ? "All" : "Tous"}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
