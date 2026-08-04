"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import type { OperationalObjectType } from "@/lib/operational-access";

type ChecklistItem = {
  id: string;
  label: string;
  position: number;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
};

type ChecklistState = {
  items: ChecklistItem[];
  completed: number;
  total: number;
  progress: number;
  canManage: boolean;
};

export function OperationalChecklistPanel({
  objectType,
  objectId,
  title = "Checklist de réalisation",
  onProgressChange,
}: {
  objectType: OperationalObjectType;
  objectId: string;
  title?: string;
  onProgressChange?: (progress: number) => void;
}) {
  const [state, setState] = useState<ChecklistState>({ items: [], completed: 0, total: 0, progress: 0, canManage: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useToastMessage(message);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ objectType, objectId });
    const response = await fetch(`/api/operations/checklists?${query.toString()}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as ChecklistState & { message?: string } | null;
    if (response.ok && body) {
      setState(body);
      onProgressChange?.(body.progress);
    } else {
      setMessage(body?.message || "Chargement de la checklist impossible.");
    }
    setLoading(false);
  }, [objectId, objectType, onProgressChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(() => [...state.items].sort((a, b) => a.position - b.position), [state.items]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") || "").trim();
    if (!label) return;
    setSaving(true);
    const response = await fetch("/api/operations/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectType, objectId, label }),
    });
    const body = (await response.json().catch(() => null)) as ChecklistState & { message?: string } | null;
    if (response.ok && body) {
      setState((current) => ({ ...body, canManage: current.canManage }));
      onProgressChange?.(body.progress);
      event.currentTarget.reset();
      setMessage("Élément ajouté.");
    } else {
      setMessage(body?.message || "Ajout impossible.");
    }
    setSaving(false);
  }

  async function toggle(item: ChecklistItem) {
    if (!state.canManage) return;
    setSaving(true);
    const response = await fetch("/api/operations/checklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, completed: !item.completed }),
    });
    const body = (await response.json().catch(() => null)) as ChecklistState & { message?: string } | null;
    if (response.ok && body) {
      setState((current) => ({ ...body, canManage: current.canManage }));
      onProgressChange?.(body.progress);
    } else {
      setMessage(body?.message || "Mise à jour impossible.");
    }
    setSaving(false);
  }

  async function remove(item: ChecklistItem) {
    if (!state.canManage) return;
    setSaving(true);
    const response = await fetch("/api/operations/checklists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    const body = (await response.json().catch(() => null)) as ChecklistState & { message?: string } | null;
    if (response.ok && body) {
      setState((current) => ({ ...body, canManage: current.canManage }));
      onProgressChange?.(body.progress);
      setMessage("Élément retiré.");
    } else {
      setMessage(body?.message || "Suppression impossible.");
    }
    setSaving(false);
  }

  return (
    <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-cyan-600" />
            <h4 className="font-black text-dtsc-ink">{title}</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-dtsc-muted">La progression est calculée automatiquement : {state.completed}/{state.total} élément(s) réalisé(s).</p>
        </div>
        <span className="shrink-0 rounded-full bg-cyan-400/15 px-3 py-1.5 text-sm font-black text-cyan-700">{state.progress}%</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-dtsc-surface" aria-label={`Progression ${state.progress}%`}>
        <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${state.progress}%` }} />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-dtsc-muted">Chargement de la checklist…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {sortedItems.map((item) => (
            <div key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
              <button
                type="button"
                onClick={() => void toggle(item)}
                disabled={!state.canManage || saving}
                className="mt-0.5 shrink-0 text-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={item.completed ? `Marquer ${item.label} comme non réalisé` : `Marquer ${item.label} comme réalisé`}
              >
                {item.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`break-words text-sm font-bold ${item.completed ? "text-dtsc-muted line-through" : "text-dtsc-ink"}`}>{item.label}</p>
                {item.completedAt ? <p className="mt-1 text-xs text-dtsc-muted">Réalisé le {new Date(item.completedAt).toLocaleString("fr-FR")}</p> : null}
              </div>
              {state.canManage ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => void remove(item)} disabled={saving} className="shrink-0 rounded-xl text-red-600" aria-label={`Supprimer ${item.label}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {!sortedItems.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-4 text-center text-sm text-dtsc-muted">Aucun élément. Ajoutez les résultats concrets à réaliser.</p> : null}
        </div>
      )}

      {state.canManage ? (
        <form onSubmit={addItem} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input name="label" required minLength={2} maxLength={300} placeholder="Ajouter une chose à réaliser…" className="h-11 min-w-0 rounded-xl bg-dtsc-surface" />
          <Button type="submit" disabled={saving} className="h-11 shrink-0 rounded-xl bg-dtsc-blue text-white">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-xs font-bold text-dtsc-muted">Lecture seule : seul le responsable ou le destinataire explicite peut modifier cette checklist.</p>
      )}
    </section>
  );
}
