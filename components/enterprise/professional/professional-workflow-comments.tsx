"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ChevronDown, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { professionalErpDateTime, professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { useToastMessage } from "@/components/ui/use-toast-message";

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

type Props = {
  endpoint: string;
  title?: string;
  description?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function ProfessionalWorkflowComments({ endpoint, title, description, collapsible = false, defaultOpen = false }: Props) {
  const locale = useProfessionalErpLocale();
  const t = useCallback((key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key), [locale]);
  const composerId = useId();
  const titleId = useId();
  const [comments, setComments] = useState<WorkflowComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkflowComment | null>(null);
  const [expanded, setExpanded] = useState(defaultOpen);
  useToastMessage(error, "error");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { comments?: WorkflowComment[]; message?: string } | null;
    if (!response.ok || !body) setError(body?.message || t("workflow.unavailable"));
    else setComments(body.comments || []);
    setLoading(false);
  }, [endpoint, t]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const contentValue = String(data.get("content") || "").trim();
    if (!contentValue) return;
    setBusy(true);
    setError("");
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { commentId: editing.id, content: contentValue } : { content: contentValue }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    if (!response.ok) return setError(body?.message || t("workflow.saveFailed"));
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
    if (!response.ok) return setError(body?.message || t("workflow.deleteFailed"));
    if (editing?.id === comment.id) setEditing(null);
    await load();
  }

  const heading = (
    <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dtsc-blue/10 text-dtsc-blue">
        <MessageCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span id={titleId} className="text-base font-black text-dtsc-ink sm:text-lg">{title ?? t("workflow.title")}</span>
          {!loading ? <span className="rounded-full bg-dtsc-soft px-2 py-0.5 text-xs font-black text-dtsc-muted">{comments.length}</span> : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-dtsc-muted">{description ?? t("workflow.description")}</p>
      </div>
    </div>
  );

  const body = (
    <>
      {error ? <div role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}

      <div className="mt-4 max-h-[min(48dvh,28rem)] space-y-3 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-3" data-no-group-swipe>
        {loading ? <p className="py-4 text-sm text-dtsc-muted">{t("workflow.loading")}</p> : comments.length ? comments.map((comment) => {
          const mine = comment.canEdit || comment.canDelete;
          return (
            <article key={comment.id} className={`flex min-w-0 gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine ? <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dtsc-border bg-dtsc-surface text-xs font-black text-dtsc-blue">{initials(comment.author.name)}</span> : null}
              <div className={`min-w-0 max-w-[88%] rounded-2xl border px-3 py-2.5 sm:max-w-[78%] ${mine ? "border-dtsc-blue/25 bg-dtsc-blue/10" : "border-dtsc-border bg-dtsc-surface"}`}>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="break-words text-sm text-dtsc-ink">{comment.author.name}</strong>
                  <span className="text-[11px] text-dtsc-muted">{professionalErpDateTime(comment.createdAt, locale)}{comment.updatedAt !== comment.createdAt ? t("workflow.edited") : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-ink">{comment.content}</p>
                {comment.canEdit || comment.canDelete ? <div className="mt-2 flex justify-end gap-1 border-t border-dtsc-border/60 pt-2">
                  {comment.canEdit ? <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(comment)} aria-label={t("workflow.editAria")}><Pencil className="h-3.5 w-3.5" /></Button> : null}
                  {comment.canDelete ? <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600" disabled={busy} onClick={() => void remove(comment)} aria-label={t("workflow.deleteAria")}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                </div> : null}
              </div>
              {mine ? <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dtsc-blue text-xs font-black text-white">{initials(comment.author.name)}</span> : null}
            </article>
          );
        }) : <p className="py-5 text-center text-sm leading-6 text-dtsc-muted">{t("workflow.empty")}</p>}
      </div>

      <form key={editing?.id || "new"} onSubmit={submit} className="sticky bottom-0 mt-3 grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm">
        {editing ? <div className="flex items-center justify-between rounded-xl bg-dtsc-soft px-3 py-2 text-xs font-black text-dtsc-ink"><span>{t("workflow.editing")}</span><button type="button" onClick={() => setEditing(null)} aria-label={t("workflow.cancelEditing")} className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue"><X className="h-4 w-4" /></button></div> : null}
        <label htmlFor={composerId} className="sr-only">{t("workflow.placeholder")}</label>
        <textarea
          id={composerId}
          name="content"
          defaultValue={editing?.content || ""}
          maxLength={4000}
          rows={3}
          placeholder={t("workflow.placeholder")}
          required
          disabled={busy}
          className="min-h-24 w-full min-w-0 resize-y rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-base text-dtsc-ink outline-none placeholder:text-dtsc-muted focus-visible:border-dtsc-blue focus-visible:ring-2 focus-visible:ring-dtsc-blue/20 disabled:opacity-60"
        />
        <div className="flex justify-end"><Button type="submit" disabled={busy}><Send className="h-4 w-4" />{busy ? t("workflow.saving") : editing ? t("workflow.saveEdit") : t("workflow.publish")}</Button></div>
      </form>
    </>
  );

  if (!collapsible) {
    return <section className="border-t border-dtsc-border pt-5" aria-labelledby={titleId}>{heading}{body}</section>;
  }

  return (
    <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm" aria-labelledby={titleId}>
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-dtsc-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue/40"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {heading}
        <ChevronDown className={`mt-2 h-5 w-5 shrink-0 text-dtsc-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded ? <div className="border-t border-dtsc-border px-3 pb-3 sm:px-4 sm:pb-4">{body}</div> : null}
    </section>
  );
}
