"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CollapsibleThread } from "@/components/workspace/collapsible-thread";
import { translateSharedWork, type SharedWorkKey } from "@/lib/i18n";
import { formatUserDateTime } from "@/lib/user-format";

type EntityComment = {
  id: string;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  author: { id: string; name: string; role: string };
  replyTo?: { id: string; content: string; deletedAt: string | null; author: { name: string } } | null;
};

export function EntityCommentsThread({ entityType, entityId, currentUserId, currentUserRole, locale, title }: { entityType: "WORK_ENTRY" | "WORK_SUBMISSION"; entityId: string; currentUserId: string; currentUserRole: string; locale?: string | null; title?: string }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [comments, setComments] = useState<EntityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [replyingTo, setReplyingTo] = useState<EntityComment | null>(null);
  const [editing, setEditing] = useState<EntityComment | null>(null);
  const [deleting, setDeleting] = useState<EntityComment | null>(null);
  const t = useCallback((key: SharedWorkKey) => translateSharedWork(locale, key), [locale]);

  const load = useCallback(async (nextCursor?: string | null) => {
    setLoading(true);
    const beforeHeight = listRef.current?.scrollHeight || 0;
    const beforeTop = listRef.current?.scrollTop || 0;
    const query = new URLSearchParams({ entityType, entityId, limit: "20" });
    if (nextCursor) query.set("cursor", nextCursor);
    const response = await fetch(`/api/activities/comments?${query.toString()}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { comments?: EntityComment[]; nextCursor?: string | null; hasMore?: boolean; message?: string } | null;
    if (response.ok) {
      setComments((current) => nextCursor ? mergeComments(body?.comments || [], current) : body?.comments || []);
      setCursor(body?.nextCursor || null);
      setHasMore(Boolean(body?.hasMore));
      if (nextCursor) requestAnimationFrame(() => { const element = listRef.current; if (element) element.scrollTop = beforeTop + (element.scrollHeight - beforeHeight); });
    } else setFeedback(body?.message || t("comments.loadError"));
    setLoading(false);
  }, [entityId, entityType, t]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    const response = await fetch("/api/activities/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType, entityId, content: message.trim(), mentionedUserIds: [], replyToId: replyingTo?.id || "" }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setFeedback(response.ok ? t("comments.added") : body?.message || t("comments.addError"));
    if (response.ok) { setMessage(""); setReplyingTo(null); await load(); }
  }

  async function mutate(method: "PATCH" | "DELETE", comment: EntityComment, content?: string) {
    const response = await fetch("/api/activities/comments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: comment.id, content }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setFeedback(response.ok ? t("comments.updated") : body?.message || t("comments.actionError"));
    if (response.ok) { setEditing(null); setDeleting(null); await load(); }
  }

  return <>
    <CollapsibleThread count={comments.length} label={t("comments.countLabel")} defaultOpen forceOpen={Boolean(replyingTo || editing || deleting)} className="border-t border-dtsc-border pt-4">
      {title ? <h4 className="mb-3 font-black text-dtsc-ink">{title}</h4> : null}
      {feedback ? <p className="mb-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-dtsc-ink" role="status">{feedback}</p> : null}
      <div ref={listRef} className="max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
        {hasMore ? <div className="flex justify-center"><Button type="button" variant="outline" size="sm" onClick={() => void load(cursor)} disabled={loading} className="rounded-xl">{loading ? t("comments.loading") : t("comments.older")}</Button></div> : null}
        {comments.map((comment) => <article key={comment.id} className="relative min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page p-3 pr-14"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{comment.author.name} · {formatUserDateTime(comment.createdAt, { locale })}</p><ActionMenu label={t("comments.actionsFor").replace("{name}", comment.author.name)} items={[{ key: "reply", label: t("comments.reply"), icon: MessageCircle, onSelect: () => setReplyingTo(comment) }, { key: "copy", label: t("comments.copy"), icon: Copy, onSelect: () => void navigator.clipboard?.writeText(comment.content) }, ...(!comment.deletedAt && (comment.author.id === currentUserId || currentUserRole === "ADMIN") ? [{ key: "edit", label: t("comments.edit"), icon: Pencil, onSelect: () => setEditing(comment) }, { key: "delete", label: t("comments.delete"), icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleting(comment) }] : [])]} /></div>{comment.replyTo ? <div className="mt-2 rounded-xl border-l-4 border-cyan-300 bg-dtsc-surface p-2 text-xs text-dtsc-muted"><strong className="text-dtsc-blue">{comment.replyTo.author.name}</strong><p className="mt-1 line-clamp-2">{comment.replyTo.deletedAt ? t("comments.deleted") : comment.replyTo.content}</p></div> : null}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-muted">{comment.content}</p></article>)}
        {!comments.length ? <p className="py-4 text-center text-sm text-dtsc-muted">{t("comments.empty")}</p> : null}
      </div>
      {replyingTo ? <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border-l-4 border-cyan-300 bg-dtsc-page p-3 text-xs text-dtsc-muted"><span><strong className="text-dtsc-blue">{t("comments.replyTo")} {replyingTo.author.name}</strong><span className="mt-1 line-clamp-2 block">{replyingTo.content}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="font-black text-dtsc-blue">{t("comments.cancel")}</button></div> : null}
      <form onSubmit={submit} className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("comments.placeholder")} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" maxLength={2000} /><Button disabled={!message.trim()} className="self-end rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" />{t("comments.send")}</Button></form>
    </CollapsibleThread>
    <Dialog open={Boolean(editing)} title={t("comments.editTitle")} onClose={() => setEditing(null)} className="max-w-xl"><form onSubmit={(event) => { event.preventDefault(); const content = String(new FormData(event.currentTarget).get("content") || ""); if (editing) void mutate("PATCH", editing, content); }} className="space-y-4"><textarea name="content" defaultValue={editing?.content || ""} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" required maxLength={2000} /><Button className="rounded-xl bg-dtsc-blue text-white">{t("comments.save")}</Button></form></Dialog>
    <Dialog open={Boolean(deleting)} title={t("comments.deleteTitle")} description={t("comments.deleteDescription")} onClose={() => setDeleting(null)} className="max-w-xl"><Button type="button" onClick={() => deleting && void mutate("DELETE", deleting)} className="rounded-xl bg-red-600 text-white">{t("comments.confirmDelete")}</Button></Dialog>
  </>;
}

function mergeComments(older: EntityComment[], current: EntityComment[]) { const map = new Map<string, EntityComment>(); for (const comment of [...older, ...current]) map.set(comment.id, comment); return [...map.values()]; }
