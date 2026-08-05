"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SupportTicket, User, UserRole } from "@prisma/client";
import { Copy, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";
import { ProfessionalMentionActions } from "@/components/people/professional-mention-actions";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { CollapsibleThread } from "@/components/workspace/collapsible-thread";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type TicketWithUser = SupportTicket & {
  user?: Pick<User, "name" | "email" | "role">;
  messages?: TicketCommentItem[];
};

type TicketCommentItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  user: { id: string; name: string; role: UserRole };
  replyTo?: { id: string; content: string; deletedAt?: string | null; user: { name: string } } | null;
};

type MentionCandidate = { id: string; name: string; role?: UserRole };

export function TicketBoard({
  tickets,
  canManage = false,
  currentUserId,
  focusTicketId,
  assignees = [],
}: {
  tickets: TicketWithUser[];
  canManage?: boolean;
  currentUserId: string;
  focusTicketId?: string | null;
  assignees?: Array<{ id: string; name: string; email: string; role: UserRole }>;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState("");
  const ticketList = useSmartList({
    items: tickets,
    pageSize: 6,
    getSearchText: (ticket) =>
      `${ticket.subject} ${ticket.description} ${ticket.status} ${ticket.priority} ${ticket.resolution || ""} ${ticket.user?.name || ""} ${ticket.user?.email || ""} ${(ticket.messages || []).map((comment) => `${comment.content} ${comment.user.name}`).join(" ")}`,
  });
  const setTicketPage = ticketList.setPage;

  useEffect(() => {
    if (!focusTicketId) return;
    const ticketIndex = tickets.findIndex((ticket) => ticket.id === focusTicketId);
    if (ticketIndex < 0) return;
    setTicketPage(Math.floor(ticketIndex / 6) + 1);
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(focusTicketId)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("dtsc-message-focus-pulse");
      if (target) window.setTimeout(() => target.classList.remove("dtsc-message-focus-pulse"), 1800);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusTicketId, setTicketPage, tickets]);

  async function resolveTicket(event: React.FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault();
    setActiveId(ticketId);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setActiveId("");
    if (response.ok) router.refresh();
  }

  return (
    <div className="min-w-0 space-y-4">
      {tickets.length > 0 ? (
        <ListControls
          query={ticketList.query}
          onQueryChange={ticketList.setQuery}
          page={ticketList.page}
          pageCount={ticketList.pageCount}
          totalCount={ticketList.totalCount}
          filteredCount={ticketList.filteredCount}
          placeholder="Rechercher par sujet, client, statut, priorité ou commentaire..."
          onPageChange={ticketList.setPage}
        />
      ) : null}
      {ticketList.paginatedItems.map((ticket) => (
        <article key={ticket.id} data-ticket-id={ticket.id} className="dtsc-glass-list-item min-w-0 overflow-hidden rounded-2xl p-4 transition sm:p-5">
          <div className="flex min-w-0 flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted [overflow-wrap:anywhere]">
                {ticket.user?.email || "Utilisateur"} · {formatEnumLabel(ticket.priority)}
              </p>
              <h3 className="mt-1 break-words font-black text-dtsc-ink">{ticket.subject}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-muted">{ticket.description}</p>
              {ticket.resolution ? (
                <p className="mt-3 break-words rounded-xl bg-dtsc-soft p-3 text-sm font-semibold text-dtsc-blue">Résolution : {ticket.resolution}</p>
              ) : null}
            </div>
            <span className="max-w-full shrink-0 self-start break-words rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">{formatEnumLabel(ticket.status)}</span>
          </div>

          <div className="mt-5 min-w-0 border-t border-dtsc-border pt-4">
            <TicketComments
              ticketId={ticket.id}
              initialComments={ticket.messages || []}
              currentUserId={currentUserId}
              canManage={canManage}
              assignees={assignees}
            />
          </div>

          {canManage ? (
            <form onSubmit={(event) => resolveTicket(event, ticket.id)} className="mt-4 grid min-w-0 gap-3 border-t border-dtsc-border pt-4 lg:grid-cols-2 xl:grid-cols-4">
              <select name="status" defaultValue={ticket.status} className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                <option value="OPEN">{formatEnumLabel("OPEN")}</option><option value="IN_PROGRESS">{formatEnumLabel("IN_PROGRESS")}</option><option value="RESOLVED">{formatEnumLabel("RESOLVED")}</option><option value="CLOSED">{formatEnumLabel("CLOSED")}</option>
              </select>
              <select name="priority" defaultValue={ticket.priority} className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                <option value="LOW">{formatEnumLabel("LOW")}</option><option value="MEDIUM">{formatEnumLabel("MEDIUM")}</option><option value="HIGH">{formatEnumLabel("HIGH")}</option><option value="URGENT">{formatEnumLabel("URGENT")}</option>
              </select>
              <select name="assignedToDtscUserId" defaultValue={ticket.assignedToDtscUserId || ""} className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="">Non assigné</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {formatEnumLabel(assignee.role)}</option>)}</select>
              <input name="reason" required minLength={3} placeholder="Motif de la mise à jour" className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" />
              <textarea name="resolution" defaultValue={ticket.resolution || ""} placeholder="Note de résolution visible par l’utilisateur" className="min-h-24 w-full min-w-0 resize-y rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm leading-6 text-dtsc-ink lg:col-span-2" />
              <textarea name="escalationReason" defaultValue={ticket.escalationReason || ""} placeholder="Motif d’escalade (optionnel)" className="min-h-24 w-full min-w-0 resize-y rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm leading-6 text-dtsc-ink" />
              <label className="flex min-h-11 items-center justify-between rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">Pause SLA<input name="pauseSla" type="checkbox" defaultChecked={Boolean(ticket.slaPausedAt)} /></label>
              <Button className="w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] xl:col-span-4" disabled={activeId === ticket.id}>{activeId === ticket.id ? "Mise à jour..." : "Mettre à jour"}</Button>
            </form>
          ) : null}
        </article>
      ))}
      {!ticketList.filteredCount ? (
        <p className="dtsc-card p-6 text-sm text-dtsc-muted">{tickets.length ? "Aucun ticket ne correspond à votre recherche." : "Aucun ticket à afficher."}</p>
      ) : null}
    </div>
  );
}

function TicketComments({
  ticketId,
  initialComments,
  currentUserId,
  canManage,
  assignees,
}: {
  ticketId: string;
  initialComments: TicketCommentItem[];
  currentUserId: string;
  canManage: boolean;
  assignees: Array<{ id: string; name: string; email: string; role: UserRole }>;
}) {
  const newestFirst = [...initialComments];
  const [comments, setComments] = useState<TicketCommentItem[]>(newestFirst.slice(0, 20).reverse());
  const [cursor, setCursor] = useState<string | null>(newestFirst.length > 20 ? newestFirst[19]?.id || null : null);
  const [hasOlder, setHasOlder] = useState(newestFirst.length > 20);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<TicketCommentItem | null>(null);
  const [editing, setEditing] = useState<TicketCommentItem | null>(null);
  const [deleting, setDeleting] = useState<TicketCommentItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const byId = new Map<string, MentionCandidate>();
    for (const assignee of assignees) byId.set(assignee.id, { id: assignee.id, name: assignee.name, role: assignee.role });
    for (const comment of comments) byId.set(comment.user.id, { id: comment.user.id, name: comment.user.name, role: comment.user.role });
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }, [assignees, comments]);

  const mentionSuggestions = useMemo(() => {
    const match = content.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) return [];
    const query = match[1].trim().toLocaleLowerCase();
    return mentionCandidates.filter((candidate) => !query || candidate.name.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [content, mentionCandidates]);

  function insertMention(candidate: MentionCandidate) {
    setContent((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${candidate.name} `));
  }

  async function loadComments(nextCursor?: string | null) {
    setLoading(true);
    const query = new URLSearchParams({ limit: "20" });
    if (nextCursor) query.set("cursor", nextCursor);
    const response = await fetch(`/api/support/tickets/${ticketId}/messages?${query.toString()}`);
    const body = await response.json().catch(() => null) as { messages?: TicketCommentItem[]; nextCursor?: string | null; hasMore?: boolean } | null;
    if (response.ok) {
      setComments((current) => nextCursor ? [...(body?.messages || []), ...current] : body?.messages || []);
      setCursor(body?.nextCursor || null);
      setHasOlder(Boolean(body?.hasMore));
    }
    setLoading(false);
    return body;
  }

  async function jumpToComment(commentId: string) {
    let target = threadRef.current?.querySelector<HTMLElement>(`[data-ticket-comment-id="${commentId}"]`);
    let nextCursor = cursor;
    let canLoadMore = hasOlder;
    let attempts = 0;
    while (!target && canLoadMore && nextCursor && attempts < 20) {
      const page = await loadComments(nextCursor);
      nextCursor = page?.nextCursor || null;
      canLoadMore = Boolean(page?.hasMore);
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      target = threadRef.current?.querySelector<HTMLElement>(`[data-ticket-comment-id="${commentId}"]`);
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target) {
      setHighlightedId(commentId);
      window.setTimeout(() => setHighlightedId(null), 1800);
    }
  }

  async function sendComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, replyToId: replyingTo?.id || "" }),
    });
    if (response.ok) {
      setContent("");
      setReplyingTo(null);
      await loadComments();
    } else {
      setLoading(false);
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const value = String(new FormData(event.currentTarget).get("content") || "");
    const response = await fetch(`/api/support/tickets/${ticketId}/messages/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value }),
    });
    if (response.ok) {
      setEditing(null);
      await loadComments();
    }
  }

  async function deleteComment() {
    if (!deleting) return;
    const response = await fetch(`/api/support/tickets/${ticketId}/messages/${deleting.id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleting(null);
      await loadComments();
    }
  }

  return (
    <>
      <CollapsibleThread
        count={comments.length}
        label="commentaire(s)"
        defaultOpen={false}
        forceOpen={Boolean(replyingTo || editing || deleting || content)}
      >
        <div ref={threadRef} className="max-h-96 min-h-24 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {hasOlder ? <div className="flex justify-center"><Button type="button" size="sm" variant="outline" onClick={() => loadComments(cursor)} disabled={loading}>{loading ? "Chargement..." : "Charger les précédents"}</Button></div> : null}
          {!comments.length ? <p className="text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p> : null}
          {comments.map((comment) => (
            <article key={comment.id} data-ticket-comment-id={comment.id} className={`relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 pr-14 transition ${highlightedId === comment.id ? "dtsc-message-focus-pulse" : ""}`}>
              <p className="break-words text-xs font-black text-dtsc-blue [overflow-wrap:anywhere]">
                {comment.user.name} · {formatEnumLabel(comment.user.role)} · {new Date(comment.createdAt).toLocaleString("fr-FR")}
                {comment.updatedAt && comment.updatedAt !== comment.createdAt ? " · modifié" : ""}
              </p>
              {comment.replyTo ? <button type="button" onClick={() => jumpToComment(comment.replyTo!.id)} className="mt-2 block w-full rounded-xl border-l-4 border-cyan-300 bg-dtsc-page p-2 text-left text-xs text-dtsc-muted"><span className="font-black text-dtsc-blue">{comment.replyTo.user.name}</span><span className="mt-1 line-clamp-2 block">{comment.replyTo.deletedAt ? "Commentaire supprimé" : comment.replyTo.content}</span></button> : null}
              <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${comment.deletedAt ? "italic text-dtsc-muted/70" : "text-dtsc-muted"}`}>
                <TicketCommentText content={comment.content} candidates={mentionCandidates} />
              </p>
              <ActionMenu
                className="absolute right-2 top-2"
                label="Actions du commentaire"
                items={[
                  { key: "reply", label: "Répondre", icon: MessageCircle, onSelect: () => setReplyingTo(comment) },
                  { key: "copy", label: "Copier", icon: Copy, onSelect: () => void navigator.clipboard?.writeText(comment.content) },
                  ...(!comment.deletedAt && (canManage || comment.user.id === currentUserId) ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => setEditing(comment) }, { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setDeleting(comment) }] : []),
                ]}
              />
            </article>
          ))}
        </div>

        {replyingTo ? <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border-l-4 border-cyan-300 bg-dtsc-page p-3 text-xs text-dtsc-muted"><span><strong className="text-dtsc-blue">Réponse à {replyingTo.user.name}</strong><span className="mt-1 line-clamp-2 block">{replyingTo.content}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="font-black text-dtsc-blue">Annuler</button></div> : null}

        <form onSubmit={sendComment} className="relative mt-3 grid min-w-0 shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          {mentionSuggestions.length ? (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(28rem,100%)] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_18px_60px_rgba(0,23,54,0.18)]">
              {mentionSuggestions.map((candidate) => <button key={candidate.id} type="button" onClick={() => insertMention(candidate)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">@{candidate.name}{candidate.role ? ` · ${formatEnumLabel(candidate.role)}` : ""}</button>)}
            </div>
          ) : null}
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Ajouter un commentaire. Utilisez @ pour mentionner ; Entrée crée une nouvelle ligne."
            className="min-h-24 w-full min-w-0 resize-y rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm leading-6 text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            required
          />
          <Button className="w-full self-end rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] md:w-auto" disabled={loading}><Send className="h-4 w-4" />{loading ? "Envoi..." : "Commenter"}</Button>
          <p className="text-xs font-semibold text-dtsc-muted md:col-span-2">Entrée ajoute une ligne. Utilisez le bouton Commenter pour publier.</p>
        </form>
      </CollapsibleThread>

      <Dialog open={Boolean(editing)} title="Modifier le commentaire" onClose={() => setEditing(null)} className="max-w-xl">
        <form onSubmit={saveEdit} className="space-y-4">
          <textarea name="content" defaultValue={editing?.content || ""} className="min-h-32 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-ink" required />
          <Button className="rounded-xl bg-[#002b5b] text-white">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={Boolean(deleting)} title="Supprimer le commentaire" description="Le contenu sera masqué mais la trace du ticket sera conservée." onClose={() => setDeleting(null)} className="max-w-xl">
        <Button type="button" onClick={deleteComment} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Confirmer la suppression</Button>
      </Dialog>
    </>
  );
}

function TicketCommentText({ content, candidates }: { content: string; candidates: MentionCandidate[] }) {
  const sortedCandidates = [...candidates].sort((left, right) => right.name.length - left.name.length);
  const parts: Array<string | { candidate: MentionCandidate; key: string } | { all: true; key: string }> = [];
  let remaining = content;
  let sequence = 0;

  while (remaining.length > 0) {
    const allMatch = /@(?:tous|all)\b/i.exec(remaining);
    const candidateMatches = sortedCandidates
      .map((candidate) => ({ candidate, index: remaining.toLocaleLowerCase().indexOf(`@${candidate.name.toLocaleLowerCase()}`) }))
      .filter((match) => match.index >= 0)
      .sort((left, right) => left.index - right.index);
    const candidateMatch = candidateMatches[0];
    const nextIndex = Math.min(allMatch?.index ?? Number.POSITIVE_INFINITY, candidateMatch?.index ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextIndex)) {
      parts.push(remaining);
      break;
    }
    if (nextIndex > 0) parts.push(remaining.slice(0, nextIndex));
    if (allMatch && allMatch.index === nextIndex) {
      parts.push({ all: true, key: `all-${sequence++}` });
      remaining = remaining.slice(nextIndex + allMatch[0].length);
    } else if (candidateMatch) {
      parts.push({ candidate: candidateMatch.candidate, key: `user-${candidateMatch.candidate.id}-${sequence++}` });
      remaining = remaining.slice(nextIndex + candidateMatch.candidate.name.length + 1);
    }
  }

  return <>{parts.map((part, index) => typeof part === "string" ? <span key={`text-${index}`}>{part}</span> : "all" in part ? <button key={part.key} type="button" className="font-black text-cyan-600 underline decoration-cyan-300 underline-offset-4" title="Mention collective des participants autorisés au ticket">@tous</button> : <ProfessionalMentionActions key={part.key} userId={part.candidate.id} name={part.candidate.name} />)}</>;
}
