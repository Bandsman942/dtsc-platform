"use client";

import { BookmarkCheck, BookmarkPlus, RotateCcw, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SavedView = { name: string; query: string };
const MAX_VIEWS = 8;
const SAFE_KEYS = new Set(["search","status","role","source","priority","published","paymentStatus",
  "organizationId","planId","assignedTo","overdue","provider","result","userId","requestId",
  "pageSize","category","sectorId","focus","sort","date","period"]);

export function ConsoleSavedFilterViews({ locale = "fr", userId }: { locale?: "fr" | "en"; userId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = useSearchParams();
  const en = locale === "en";
  const storageKey = useMemo(() => `dtsc:console-filters:v1:${userId || "account"}:${pathname}`, [userId, pathname]);
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as SavedView[];
      setSaved(Array.isArray(stored) ? stored.filter(row => row && typeof row.name === "string" && typeof row.query === "string").slice(0, MAX_VIEWS) : []);
    } catch { setSaved([]); }
  }, [storageKey]);

  const store = (value: SavedView[]) => {
    setSaved(value);
    try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch {
      // Save views remain optional if browser storage is restricted.
    }
  };
  const sanitizedQuery = () => {
    const params = new URLSearchParams();
    current.forEach((v, k) => {
      if (SAFE_KEYS.has(k) && v.length <= 120 && v) params.set(k, v);
    });
    params.delete("page");
    return params.toString();
  };
  const save = () => {
    const label = name.trim().slice(0, 60);
    if (!label) return;
    const next = [{ name: label, query: sanitizedQuery() }, ...saved.filter(view => view.name !== label)].slice(0, MAX_VIEWS);
    store(next);
    setName("");
    setEditing(false);
  };
  return (
    <div data-console-saved-filter-views className="min-w-0 max-w-full space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing(v => !v)}
          aria-expanded={editing}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-blue hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <BookmarkPlus size={16} aria-hidden="true"/>{en ? "Save this filter view" : "Enregistrer cette vue"}
        </button>
        <button type="button" onClick={() => router.push(pathname)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-blue hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <RotateCcw size={15} aria-hidden="true"/>{en ? "Reset filters" : "Réinitialiser"}
        </button>
      </div>
      {editing ? <div className="flex min-w-0 flex-wrap gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <label className="min-w-48 flex-1 text-xs font-bold text-dtsc-muted">
          {en ? "View name" : "Nom de la vue"}
          <input maxLength={60} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if(event.key === "Enter") {event.preventDefault(); save();} }}
            className="mt-1 h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink focus-visible:ring-2" placeholder={en ? "Example: Active clients" : "Ex. : clients actifs"}/>
        </label>
        <button type="button" onClick={save} disabled={!name.trim()} className="self-end rounded-xl bg-dtsc-blue px-3 py-3 text-xs font-bold text-white disabled:opacity-50">
          {en ? "Save" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => setEditing(false)} aria-label={en ? "Cancel" : "Annuler"} className="self-end rounded-xl p-3 text-dtsc-muted hover:bg-dtsc-soft"><X size={16}/></button>
      </div> : null}
      {saved.length ? <nav aria-label={en ? "Saved filter views" : "Vues filtrées enregistrées"} className="flex min-w-0 flex-wrap gap-2">
        {saved.map(view => <span key={view.name} className="inline-flex min-w-0 items-center rounded-full border border-dtsc-border bg-dtsc-surface">
          <button type="button" onClick={() => router.push(`${pathname}${view.query ? `?${view.query}` : ""}`)}
            className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-l-full px-3 text-xs font-bold text-dtsc-blue hover:bg-dtsc-soft focus-visible:ring-2">
            <BookmarkCheck size={14} className="shrink-0" aria-hidden="true"/><span className="max-w-40 truncate">{view.name}</span>
          </button>
          <button type="button" onClick={() => store(saved.filter(entry=>entry.name!==view.name))}
            title={en ? "Delete view" : "Supprimer la vue"}
            aria-label={en ? `Delete view ${view.name}` : `Supprimer la vue ${view.name}`}
            className="flex min-h-9 w-9 shrink-0 items-center justify-center rounded-r-full text-dtsc-muted hover:bg-rose-500/10 hover:text-rose-600 focus-visible:ring-2">
            <Trash2 size={13} aria-hidden="true"/>
          </button>
        </span>)}
      </nav> : null}
    </div>
  );
}
