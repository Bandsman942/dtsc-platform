import type { ReactNode } from "react";
export function ConsoleFilterBar({ action, search, children, hidden }: { action: string; search?: string; children?: ReactNode; hidden?: Record<string, string | undefined> }) {
  return (
    <form action={action} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto]">
      {Object.entries(hidden || {}).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
      <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">Recherche<input name="search" defaultValue={search || ""} maxLength={120} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink" placeholder="Nom, référence, statut…" /></label>
      {children}
      <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">Par page<select name="pageSize" defaultValue={hidden?.pageSize || "25"} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">{[10, 20, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="self-end rounded-xl bg-[#002b5b] px-5 py-3 text-sm font-black text-white hover:bg-[#001736]">Appliquer</button>
    </form>
  );
}

export function ConsoleSelectFilter({ name, label, value, options }: { name: string; label: string; value?: string | null; options: Array<{ value: string; label: string }> }) {
  return <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}<select name={name} defaultValue={value || ""} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink"><option value="">Tous</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
