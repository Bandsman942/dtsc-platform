"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { SupportTicket, User, UserRole } from "@prisma/client";
import { Copy, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type TicketWithUser = SupportTicket & {
  user?: Pick<User, "name" | "email" | "role">;
  messages?: TicketMessageItem[];
};

type TicketMessageItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  user: { id: string; name: string; role: UserRole };
  replyTo?: { id: string; content: string; deletedAt?: string | null; user: { name: string } } | null;
};

export function TicketBoard({ tickets, canManage = false, currentUserId }: { tickets: TicketWithUser[]; canManage?: boolean; currentUserId: string }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState("");
  const ticketList = useSmartList({
    items: tickets,
    pageSize: 6,
    getSearchText: (ticket) =>
      `${ticket.subject} ${ticket.description} ${ticket.status} ${ticket.priority} ${ticket.resolution || ""} ${ticket.user?.name || ""} ${ticket.user?.email || ""} ${(ticket.messages || []).map((message) => `${message.content} ${message.user.name}`).join(" ")}`,
  });

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
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {tickets.length > 0 && (
        <ListControls
          query={ticketList.query}
          onQueryChange={ticketList.setQuery}
          page={ticketList.page}
          pageCount={ticketList.pageCount}
          totalCount={ticketList.totalCount}
          filteredCount={ticketList.filteredCount}
          placeholder="Rechercher par sujet, client, statut, priorité ou message..."
          onPageChange={ticketList.setPage}
        />
      )}
      {ticketList.paginatedItems.map((ticket) => (
        <article key={ticket.id} className="dtsc-glass-list-item min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5">
          <div className="flex min-w-0 flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted [overflow-wrap:anywhere]">
                {ticket.user?.email || "Utilisateur"} · {formatEnumLabel(ticket.priority)}
              </p>
              <h3 className="mt-1 break-words font-black text-dtsc-ink">{ticket.subject}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-muted">{ticket.description}</p>
              {ticket.resolution && (
                <p className="mt-3 break-words rounded-xl bg-dtsc-soft p-3 text-sm font-semibold text-dtsc-blue">
                  Résolution: {ticket.resolution}
                </p>
              )}
            </div>
            <span className="max-w-full shrink-0 self-start break-words rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">{formatEnumLabel(ticket.status)}</span>
          </div>
          <div className="mt-5 flex max-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted">Discussion</p>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <TicketMessages
                ticketId={ticket.id}
                initialMessages={ticket.messages || []}
                currentUserId={currentUserId}
                canManage={canManage}
              />
            </div>
          </div>
          {canManage && (
            <form onSubmit={(event) => resolveTicket(event, ticket.id)} className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
              <select name="status" defaultValue={ticket.status} className="h-10 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                <option value="OPEN">{formatEnumLabel("OPEN")}</option>
                <option value="IN_PROGRESS">{formatEnumLabel("IN_PROGRESS")}</option>
                <option value="RESOLVED">{formatEnumLabel("RESOLVED")}</option>
                <option value="CLOSED">{formatEnumLabel("CLOSED")}</option>
              </select>
              <input name="resolution" defaultValue={ticket.resolution || ""} placeholder="Note de résolution visible par l'utilisateur" className="h-10 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" />
              <Button className="w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] md:w-auto" disabled={activeId === ticket.id}>
                {activeId === ticket.id ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </form>
          )}
        </article>
      ))}
      {!ticketList.filteredCount && (
        <p className="dtsc-card p-6 text-sm text-dtsc-muted">
          {tickets.length ? "Aucun ticket ne correspond à votre recherche." : "Aucun ticket à afficher."}
        </p>
      )}
    </div>
  );
}

function TicketMessages({ ticketId, initialMessages, currentUserId, canManage }: { ticketId: string; initialMessages: TicketMessageItem[]; currentUserId: string; canManage: boolean }) {
  const newestFirst = [...initialMessages];
  const [messages, setMessages] = useState<TicketMessageItem[]>(newestFirst.slice(0, 20).reverse());
  const [cursor, setCursor] = useState<string | null>(newestFirst.length > 20 ? newestFirst[19]?.id || null : null);
  const [hasOlder, setHasOlder] = useState(newestFirst.length > 20);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<TicketMessageItem | null>(null);
  const [editing, setEditing] = useState<TicketMessageItem | null>(null);
  const [deleting, setDeleting] = useState<TicketMessageItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  async function loadMessages(nextCursor?: string | null) {
    setLoading(true);
    const query = new URLSearchParams({ limit: "20" });
    if (nextCursor) query.set("cursor", nextCursor);
    const response = await fetch(`/api/support/tickets/${ticketId}/messages?${query.toString()}`);
    const body = await response.json().catch(() => null) as { messages?: TicketMessageItem[]; nextCursor?: string | null; hasMore?: boolean } | null;
    if (response.ok) {
      setMessages((current) => nextCursor ? [...(body?.messages || []), ...current] : body?.messages || []);
      setCursor(body?.nextCursor || null);
      setHasOlder(Boolean(body?.hasMore));
    }
    setLoading(false);
    return body;
  }

  async function jumpToMessage(messageId: string) {
    let target = threadRef.current?.querySelector<HTMLElement>(`[data-ticket-message-id="${messageId}"]`);
    let nextCursor = cursor;
    let canLoadMore = hasOlder;
    let attempts = 0;
    while (!target && canLoadMore && nextCursor && attempts < 20) {
      const page = await loadMessages(nextCursor);
      nextCursor = page?.nextCursor || null;
      canLoadMore = Boolean(page?.hasMore);
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      target = threadRef.current?.querySelector<HTMLElement>(`[data-ticket-message-id="${messageId}"]`);
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target) {
      setHighlightedId(messageId);
      window.setTimeout(() => setHighlightedId(null), 1800);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
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
      await loadMessages();
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
      await loadMessages();
    }
  }

  async function deleteMessage() {
    if (!deleting) return;
    const response = await fetch(`/api/support/tickets/${ticketId}/messages/${deleting.id}`, { method: "DELETE" });
    if (response.ok) {
      setDeleting(null);
      await loadMessages();
    }
  }

  return (
    <>
      <div ref={threadRef} className="max-h-80 min-h-24 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {hasOlder && <div className="flex justify-center"><Button type="button" size="sm" variant="outline" onClick={() => loadMessages(cursor)} disabled={loading}>{loading ? "Chargement..." : "Charger les précédents"}</Button></div>}
        {!messages.length && <p className="text-sm text-dtsc-muted">Aucun échange pour le moment. Lancez la discussion pour clarifier le besoin.</p>}
        {messages.map((message) => (
          <div key={message.id} data-ticket-message-id={message.id} className={`relative min-w-0 rounded-2xl bg-dtsc-surface p-3 pr-14 transition ${highlightedId === message.id ? "dtsc-message-focus-pulse" : ""}`}>
            <p className="break-words text-xs font-black text-dtsc-blue [overflow-wrap:anywhere]">
              {message.user.name} · {formatEnumLabel(message.user.role)} · {new Date(message.createdAt).toLocaleString("fr-FR")}
              {message.updatedAt && message.updatedAt !== message.createdAt ? " · modifié" : ""}
            </p>
            {message.replyTo && <button type="button" onClick={() => jumpToMessage(message.replyTo!.id)} className="mt-2 block w-full rounded-xl border-l-4 border-cyan-300 bg-dtsc-page p-2 text-left text-xs text-dtsc-muted"><span className="font-black text-dtsc-blue">{message.replyTo.user.name}</span><span className="mt-1 line-clamp-2 block">{message.replyTo.deletedAt ? "Message supprimé" : message.replyTo.content}</span></button>}
            <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${message.deletedAt ? "italic text-dtsc-muted/70" : "text-dtsc-muted"}`}>{message.content}</p>
            <ActionMenu
              className="absolute right-2 top-2"
              label="Actions du message"
              items={[
                { key: "reply", label: "Répondre", icon: MessageCircle, onSelect: () => setReplyingTo(message) },
                { key: "copy", label: "Copier", icon: Copy, onSelect: () => void navigator.clipboard?.writeText(message.content) },
                ...(!message.deletedAt && (canManage || message.user.id === currentUserId) ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => setEditing(message) }, { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setDeleting(message) }] : []),
              ]}
            />
          </div>
        ))}
      </div>
      {replyingTo && <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border-l-4 border-cyan-300 bg-dtsc-surface p-3 text-xs text-dtsc-muted"><span><strong className="text-dtsc-blue">Réponse à {replyingTo.user.name}</strong><span className="mt-1 line-clamp-2 block">{replyingTo.content}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="font-black text-dtsc-blue">Annuler</button></div>}
      <form onSubmit={sendMessage} className="mt-3 grid min-w-0 shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <input value={content} onChange={(event) => setContent(event.target.value)} placeholder="Répondre dans la discussion du ticket..." className="h-10 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" required />
        <Button className="w-full rounded-xl bg-[#002b5b] text-white hover:bg-[#001736] md:w-auto" disabled={loading}>Envoyer</Button>
      </form>
      <Dialog open={Boolean(editing)} title="Modifier le message" onClose={() => setEditing(null)} className="max-w-xl">
        <form onSubmit={saveEdit} className="space-y-4">
          <textarea name="content" defaultValue={editing?.content || ""} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" required />
          <Button className="rounded-xl bg-[#002b5b] text-white">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={Boolean(deleting)} title="Supprimer le message" description="Le contenu sera masqué mais la trace de la discussion sera conservée." onClose={() => setDeleting(null)} className="max-w-xl">
        <Button type="button" onClick={deleteMessage} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Confirmer la suppression</Button>
      </Dialog>
    </>
  );
}
