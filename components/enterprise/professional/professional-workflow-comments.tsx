"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WorkflowComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorUserId: string;
  author: { id: string; name: string; email: string };
  canEdit: boolean;
  canDelete: boolean;
};

export function ProfessionalWorkflowComments({
  endpoint,
  title = "Commentaires de workflow",
  description = "Le demandeur et le validateur peuvent échanger sans modifier silencieusement l’historique.",
}: {
  endpoint: string;
  title?: string;
  description?: string;
}) {
  const [comments, setComments] = useState<WorkflowComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkflowComment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { comments?: WorkflowComment[]; message?: string } | null;
    if (!response.ok || !body) setError(body?.message || "Les commentaires sont indisponibles.");
    else setComments(body.comments || []);
    setLoading(false);
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const content = String(data.get("content") || "").trim();
    if (!content) return;
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { commentId: editing.id, content } : { content }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    if (!response.ok) return setError(body?.message || "Le commentaire n’a pas pu être enregistré.");
    form.reset();
    setEditing(null);
    await load();
  }

  async function remove(comment: WorkflowComment) {
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentId: comment.id }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    if (!response.ok) return setError(body?.message || "Le commentaire n’a pas pu être supprimé.");
    if (editing?.id === comment.id) setEditing(null);
    await load();
  }

  return (
    <section className="border-t border-dtsc-border pt-5" aria-labelledby="workflow-comments-title">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-dtsc-blue" />
        <div className="min-w-0">
          <h3 id="workflow-comments-title" className="font-black text-dtsc-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{description}</p>
        </div>
      </div>

      {error ? <div role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}

      <div className="mt-4 divide-y divide-dtsc-border border-y border-dtsc-border">
        {loading ? <p className="py-4 text-sm text-dtsc-muted">Chargement des commentaires…</p> : comments.length ? comments.map((comment) => (
          <article key={comment.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-sm text-dtsc-ink">{comment.author.name}</strong>
                <span className="text-xs text-dtsc-muted">{new Date(comment.createdAt).toLocaleString("fr-FR")}{comment.updatedAt !== comment.createdAt ? " · modifié" : ""}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-muted">{comment.content}</p>
            </div>
            {comment.canEdit || comment.canDelete ? <div className="flex justify-end gap-1">
              {comment.canEdit ? <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditing(comment)} aria-label="Modifier le commentaire"><Pencil className="h-4 w-4" /></Button> : null}
              {comment.canDelete ? <Button type="button" size="icon" variant="outline" className="h-9 w-9 text-red-600" disabled={busy} onClick={() => void remove(comment)} aria-label="Supprimer le commentaire"><Trash2 className="h-4 w-4" /></Button> : null}
            </div> : null}
          </article>
        )) : <p className="py-4 text-sm text-dtsc-muted">Aucun commentaire. Utilisez ce fil pour motiver une décision ou demander une précision.</p>}
      </div>

      <form key={editing?.id || "new"} onSubmit={submit} className="mt-4 grid gap-2">
        {editing ? <div className="flex items-center justify-between rounded-xl bg-dtsc-soft px-3 py-2 text-xs font-black text-dtsc-ink"><span>Modification de votre commentaire</span><button type="button" onClick={() => setEditing(null)} aria-label="Annuler la modification"><X className="h-4 w-4" /></button></div> : null}
        <Input name="content" defaultValue={editing?.content || ""} maxLength={4000} placeholder="Ajouter une précision, une question ou le motif de la décision…" required />
        <div className="flex justify-end"><Button type="submit" disabled={busy}><Send className="h-4 w-4" />{busy ? "Enregistrement…" : editing ? "Enregistrer la modification" : "Publier le commentaire"}</Button></div>
      </form>
    </section>
  );
}
