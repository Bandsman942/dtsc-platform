"use client";

import { AlertTriangle, Check, Link2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseChoice } from "@/components/enterprise/core-v2/erp-v2-ui";

type Coordination = {
  checklist: Array<{ id: string; title: string; isCompleted: boolean; position: number }>;
  dependencies: Array<{ id: string; predecessorId: string; successorId: string; dependencyType: string }>;
  blockers: Array<{ id: string; reason: string; status: string; resolutionComment: string | null; responsibleUserId: string | null; createdAt: string }>;
  progress: number | null;
  openBlockerCount: number;
};

type TaskChoice = { id: string; title: string };

export function TaskCoordinationPanel({ organizationId, taskId, canUpdate, taskChoices, members, locale }: { organizationId: string; taskId: string; canUpdate: boolean; taskChoices: TaskChoice[]; members: EnterpriseChoice[]; locale?: string | null }) {
  const en = locale === "en";
  const [coordination, setCoordination] = useState<Coordination | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/enterprise/${organizationId}/tasks/${taskId}/coordination`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { coordination?: Coordination; message?: string } | null;
    if (!response.ok || !body?.coordination) setMessage(body?.message || (en ? "Unable to load task coordination." : "Impossible de charger la coordination de la tâche."));
    else setCoordination(body.coordination);
    setLoading(false);
  }, [endpoint, en]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(payload: Record<string, unknown>) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as { coordination?: Coordination; message?: string } | null;
    if (!response.ok || !body?.coordination) {
      setMessage(body?.message || (en ? "Action failed." : "L’action a échoué."));
      return false;
    }
    setCoordination(body.coordination);
    setMessage(en ? "Task coordination updated." : "Coordination de la tâche mise à jour.");
    return true;
  }

  async function addChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") || "");
    if (await mutate({ action: "ADD_CHECKLIST", title, position: coordination?.checklist.length || 0 })) form.reset();
  }

  async function addDependency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const predecessorTaskId = String(new FormData(form).get("predecessorTaskId") || "");
    if (predecessorTaskId && await mutate({ action: "ADD_DEPENDENCY", predecessorTaskId, dependencyType: "BLOCKS" })) form.reset();
  }

  async function addBlocker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await mutate({ action: "ADD_BLOCKER", reason: String(data.get("reason") || ""), responsibleUserId: String(data.get("responsibleUserId") || "") || null })) form.reset();
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{en ? "Loading coordination…" : "Chargement de la coordination…"}</p>;
  if (!coordination) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;

  return <div className="grid min-w-0 gap-5">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role="status">{message}</p> : null}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <StatusBadge>{coordination.progress === null ? (en ? "No checklist" : "Aucune checklist") : `${coordination.progress}%`}</StatusBadge>
      <StatusBadge>{coordination.openBlockerCount} {en ? "open blocker(s)" : "blocage(s) ouvert(s)"}</StatusBadge>
      <StatusBadge>{coordination.dependencies.length} {en ? "dependency(ies)" : "dépendance(s)"}</StatusBadge>
    </div>

    <section className="grid gap-3 border-t border-dtsc-border pt-4">
      <h4 className="font-black text-dtsc-ink">Checklist</h4>
      {coordination.checklist.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-3">
        <button type="button" disabled={!canUpdate} onClick={() => void mutate({ action: "TOGGLE_CHECKLIST", checklistItemId: item.id, completed: !item.isCompleted })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dtsc-border disabled:opacity-50" aria-label={item.isCompleted ? (en ? "Reopen item" : "Rouvrir l’élément") : (en ? "Complete item" : "Terminer l’élément")}>{item.isCompleted ? <Check className="h-4 w-4 text-emerald-600" /> : null}</button>
        <span className={`min-w-0 flex-1 break-words text-sm ${item.isCompleted ? "line-through text-dtsc-muted" : "font-bold text-dtsc-ink"}`}>{item.title}</span>
        {canUpdate ? <button type="button" onClick={() => void mutate({ action: "DELETE_CHECKLIST", checklistItemId: item.id })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-red-600 hover:bg-red-50" aria-label={en ? "Delete item" : "Supprimer l’élément"}><Trash2 className="h-4 w-4" /></button> : null}
      </div>)}
      {canUpdate ? <form onSubmit={addChecklist} className="flex min-w-0 flex-col gap-2 sm:flex-row"><Input name="title" required maxLength={240} placeholder={en ? "New checklist item" : "Nouvel élément de checklist"} /><Button type="submit" variant="outline"><Plus className="h-4 w-4" />{en ? "Add" : "Ajouter"}</Button></form> : null}
    </section>

    <section className="grid gap-3 border-t border-dtsc-border pt-4">
      <h4 className="font-black text-dtsc-ink">{en ? "Dependencies" : "Dépendances"}</h4>
      {coordination.dependencies.map((dependency) => {
        const otherId = dependency.predecessorId === taskId ? dependency.successorId : dependency.predecessorId;
        const other = taskChoices.find((task) => task.id === otherId);
        return <div key={dependency.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-3 text-sm"><Link2 className="h-4 w-4 shrink-0 text-cyan-600" /><span className="min-w-0 flex-1 break-words">{dependency.predecessorId === taskId ? (en ? "Blocks" : "Bloque") : (en ? "Depends on" : "Dépend de")} · {other?.title || otherId}</span>{canUpdate ? <button type="button" onClick={() => void mutate({ action: "REMOVE_DEPENDENCY", dependencyId: dependency.id })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-red-600 hover:bg-red-50" aria-label={en ? "Remove dependency" : "Retirer la dépendance"}><Trash2 className="h-4 w-4" /></button> : null}</div>;
      })}
      {canUpdate && taskChoices.some((task) => task.id !== taskId) ? <form onSubmit={addDependency} className="flex min-w-0 flex-col gap-2 sm:flex-row"><select name="predecessorTaskId" required defaultValue="" className="h-11 min-w-0 flex-1 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="" disabled>{en ? "Select predecessor task" : "Sélectionner la tâche préalable"}</option>{taskChoices.filter((task) => task.id !== taskId).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><Button type="submit" variant="outline"><Link2 className="h-4 w-4" />{en ? "Link" : "Lier"}</Button></form> : null}
    </section>

    <section className="grid gap-3 border-t border-dtsc-border pt-4">
      <h4 className="font-black text-dtsc-ink">{en ? "Blockers" : "Blocages"}</h4>
      {coordination.blockers.map((blocker) => <div key={blocker.id} className="grid gap-2 rounded-xl border border-dtsc-border p-3"><div className="flex min-w-0 items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /><span className="min-w-0 flex-1 break-words text-sm font-bold text-dtsc-ink">{blocker.reason}</span><StatusBadge>{blocker.status}</StatusBadge></div>{blocker.resolutionComment ? <p className="text-sm text-dtsc-muted">{blocker.resolutionComment}</p> : null}{canUpdate && blocker.status === "OPEN" ? <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const resolutionComment = String(new FormData(form).get("resolutionComment") || ""); void mutate({ action: "RESOLVE_BLOCKER", blockerId: blocker.id, resolutionComment }).then((ok) => { if (ok) form.reset(); }); }} className="flex min-w-0 flex-col gap-2 sm:flex-row"><Input name="resolutionComment" required minLength={3} maxLength={2000} placeholder={en ? "Resolution comment" : "Commentaire de résolution"} /><Button type="submit" variant="outline">{en ? "Resolve" : "Résoudre"}</Button></form> : null}</div>)}
      {canUpdate ? <form onSubmit={addBlocker} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]"><Input name="reason" required minLength={3} maxLength={2000} placeholder={en ? "Blocking reason" : "Motif du blocage"} /><select name="responsibleUserId" defaultValue="" className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{en ? "No resolver assigned" : "Aucun responsable"}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select><Button type="submit" variant="outline"><AlertTriangle className="h-4 w-4" />{en ? "Block" : "Bloquer"}</Button></form> : null}
    </section>
  </div>;
}
