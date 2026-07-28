"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, Download, Eye, FileText, MessageCircle, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { formatEnumLabel } from "@/lib/labels";
import type { ActivityAttachment, ActivityComment, ActivityItem, CollaboratorOption } from "./activity-types";

export function ActivityDetail({
  item,
  collaborators,
  currentUserId,
  currentUserRole,
  onChanged,
}: {
  item: ActivityItem;
  collaborators: CollaboratorOption[];
  currentUserId: string;
  currentUserRole: string;
  onChanged?: () => void;
}) {
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [hasOlderComments, setHasOlderComments] = useState(false);
  const [isLoadingOlderComments, setIsLoadingOlderComments] = useState(false);
  const [message, setMessage] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [requestResponse, setRequestResponse] = useState("");
  const [visibleRequestResponse, setVisibleRequestResponse] = useState(item.requestResponse || "");
  const [statusMessage, setStatusMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<ActivityComment | null>(null);
  const [editingComment, setEditingComment] = useState<ActivityComment | null>(null);
  const [deletingComment, setDeletingComment] = useState<ActivityComment | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const commentsThreadRef = useRef<HTMLDivElement>(null);
  useToastMessage(statusMessage);

  useEffect(() => {
    setRequestResponse("");
    setVisibleRequestResponse(item.requestResponse || "");
    setReplyingTo(null);
    setEditingComment(null);
    setDeletingComment(null);
    setHighlightedCommentId(null);
  }, [item.id, item.requestResponse]);

  const loadComments = useCallback(async (cursor?: string | null) => {
    if (cursor) {
      setIsLoadingOlderComments(true);
    }
    const query = new URLSearchParams({ entityType: item.entityType, entityId: item.id, limit: "20" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await fetch(`/api/activities/comments?${query.toString()}`);
    const body = (await response.json().catch(() => null)) as { comments?: ActivityComment[]; nextCursor?: string | null; hasMore?: boolean } | null;
    const nextComments = body?.comments || [];
    setComments((current) => (cursor ? [...nextComments, ...current] : nextComments));
    setCommentsCursor(body?.nextCursor || null);
    setHasOlderComments(Boolean(body?.hasMore));
    setIsLoadingOlderComments(false);
    return body;
  }, [item.entityType, item.id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      return;
    }
    const response = await fetch("/api/activities/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: item.entityType, entityId: item.id, content: message, mentionedUserIds, replyToId: replyingTo?.id || "" }),
    });
    setStatusMessage(response.ok ? "Commentaire ajouté." : "Impossible d'ajouter le commentaire.");
    if (response.ok) {
      setMessage("");
      setMentionedUserIds([]);
      setReplyingTo(null);
      await loadComments();
    }
  }

  async function mutateComment(method: "PATCH" | "DELETE", comment: ActivityComment, content?: string) {
    const response = await fetch("/api/activities/comments", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: comment.id, content }),
    });
    setStatusMessage(response.ok ? "Commentaire mis à jour." : "Action impossible sur ce commentaire.");
    if (response.ok) {
      setEditingComment(null);
      setDeletingComment(null);
      await loadComments();
    }
  }

  async function jumpToComment(commentId: string) {
    let target = commentsThreadRef.current?.querySelector<HTMLElement>(`[data-activity-comment-id="${commentId}"]`);
    let nextCursor = commentsCursor;
    let canLoadMore = hasOlderComments;
    let attempts = 0;
    while (!target && canLoadMore && nextCursor && attempts < 20) {
      const page = await loadComments(nextCursor);
      nextCursor = page?.nextCursor || null;
      canLoadMore = Boolean(page?.hasMore);
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      target = commentsThreadRef.current?.querySelector<HTMLElement>(`[data-activity-comment-id="${commentId}"]`);
    }
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target) {
      setHighlightedCommentId(commentId);
      window.setTimeout(() => setHighlightedCommentId(null), 1800);
    }
  }

  const mentionSuggestions = useMemo(() => {
    const match = message.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) {
      return [];
    }
    const query = match[1].toLowerCase();
    return collaborators.filter((collaborator) => collaborator.label.toLowerCase().includes(query)).slice(0, 6);
  }, [collaborators, message]);

  function insertMention(collaborator: CollaboratorOption) {
    const name = collaborator.label.split(" · ")[0] || collaborator.label;
    setMessage((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${name} `));
    if (collaborator.userId) {
      setMentionedUserIds((current) => [...new Set([...current, collaborator.userId as string])]);
    }
  }

  async function updateTask(status: "IN_PROGRESS" | "COMPLETED") {
    const response = await fetch(`/api/activities/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress: status === "IN_PROGRESS" ? item.progress || 10 : 100 }),
    });
    setStatusMessage(response.ok ? "Tâche mise à jour." : "Mise à jour impossible.");
    if (response.ok) {
      onChanged?.();
    }
  }

  async function updateCollaboratorRequest(status: string) {
    const response = await fetch(`/api/activities/requests/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, response: requestResponse }),
    });
    setStatusMessage(response.ok ? "Demande mise à jour." : "Mise à jour de la demande impossible.");
    if (response.ok) {
      if (requestResponse.trim()) {
        setVisibleRequestResponse(requestResponse);
      }
      setRequestResponse("");
      onChanged?.();
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{formatEnumLabel(item.entityType)} · {formatEnumLabel(item.status)}</p>
        <h3 className="mt-2 break-words text-2xl font-black text-dtsc-ink">{item.title}</h3>
        <p className="mt-2 text-sm text-dtsc-muted">{item.detail}</p>
        {item.entityType === "COLLAB_REQUEST" ? (
          <CollaboratorRequestConversation item={item} response={visibleRequestResponse} />
        ) : (
          item.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-dtsc-muted">{item.body}</p>
        )}
        {item.href && (
          <a href={item.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white transition hover:opacity-90">
            {item.hrefLabel || "Ouvrir le document"}
          </a>
        )}
      </div>

      {item.entityType === "TASK" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void updateTask("IN_PROGRESS")} className="rounded-xl bg-dtsc-blue text-white">Marquer en cours</Button>
          <Button type="button" onClick={() => void updateTask("COMPLETED")} className="rounded-xl bg-cyan-500 text-[#001736]">Marquer terminée</Button>
        </div>
      )}

      {item.entityType === "COLLAB_REQUEST" && item.canRespond && (
        <div className="border-y border-dtsc-border py-4">
          <h4 className="font-black text-dtsc-ink">Répondre ou faire avancer la demande</h4>
          <p className="mt-1 text-xs font-bold text-dtsc-muted">Ce bloc est réservé au collaborateur destinataire de la demande.</p>
          <textarea
            value={requestResponse}
            onChange={(event) => setRequestResponse(event.target.value)}
            placeholder="Réponse, précision ou information transmise..."
            className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void updateCollaboratorRequest("IN_PROGRESS")} className="rounded-xl bg-dtsc-blue text-white">Prendre en charge</Button>
            <Button type="button" onClick={() => void updateCollaboratorRequest("ANSWERED")} className="rounded-xl bg-cyan-500 text-[#001736]">Marquer répondue</Button>
            <Button type="button" onClick={() => void updateCollaboratorRequest("TREATED")} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Marquer traitée</Button>
            <Button type="button" onClick={() => void updateCollaboratorRequest("REJECTED")} variant="outline" className="rounded-xl border-red-200 text-red-500">Rejeter</Button>
          </div>
        </div>
      )}

      <div className="border-t border-dtsc-border pt-4">
        <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><MessageSquare className="h-4 w-4 text-cyan-500" /> Commentaires</h4>
        <div ref={commentsThreadRef} className="mt-3 max-h-80 space-y-3 overflow-y-auto overscroll-contain pr-1">
          {hasOlderComments && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadComments(commentsCursor)} disabled={isLoadingOlderComments} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                {isLoadingOlderComments ? "Chargement..." : "Charger les précédents"}
              </Button>
            </div>
          )}
          {comments.map((comment) => (
            <div key={comment.id} data-activity-comment-id={comment.id} className={`relative rounded-xl border border-dtsc-border bg-dtsc-page p-3 pr-14 transition ${highlightedCommentId === comment.id ? "dtsc-message-focus-pulse" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{comment.author.name} · {formatEnumLabel(comment.author.role)} · {new Date(comment.createdAt).toLocaleString("fr-FR")}</p>
                <ActionMenu
                  label={`Actions pour le commentaire de ${comment.author.name}`}
                  items={[
                    { key: "reply", label: "Répondre", icon: MessageCircle, onSelect: () => setReplyingTo(comment) },
                    { key: "copy", label: "Copier le texte", icon: Copy, onSelect: () => copyText(comment.content) },
                    ...(!comment.deletedAt && (comment.author.id === currentUserId || currentUserRole === "ADMIN") ? [
                      { key: "edit", label: "Modifier", icon: Pencil, onSelect: () => setEditingComment(comment) },
                      { key: "delete", label: "Supprimer", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeletingComment(comment) },
                    ] : []),
                  ]}
                />
              </div>
              {comment.replyTo && (
                <button type="button" onClick={() => void jumpToComment(comment.replyTo!.id)} className="mt-2 block w-full rounded-xl border-l-4 border-cyan-300 bg-dtsc-surface p-2 text-left text-xs text-dtsc-muted">
                  <span className="block font-black text-dtsc-blue">{comment.replyTo.author.name}</span>
                  <span className="mt-1 line-clamp-2 block">{comment.replyTo.deletedAt ? "Commentaire supprimé" : comment.replyTo.content}</span>
                </button>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">
                <ActivityMentionText content={comment.content} mentions={comment.mentions?.map((mention) => mention.mentionedUser) || []} />
              </p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p>}
        </div>
        {replyingTo && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border-l-4 border-cyan-300 bg-dtsc-page p-3 text-xs text-dtsc-muted">
            <span><strong className="text-dtsc-blue">Réponse à {replyingTo.author.name}</strong><span className="mt-1 line-clamp-2 block">{replyingTo.content}</span></span>
            <button type="button" onClick={() => setReplyingTo(null)} className="font-black text-dtsc-blue">Annuler</button>
          </div>
        )}
        <form onSubmit={addComment} className="relative mt-3 flex flex-col gap-2 sm:flex-row">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-14 left-0 z-20 w-[min(26rem,100%)] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_18px_60px_rgba(0,23,54,0.18)]">
              {mentionSuggestions.map((collaborator) => (
                <button key={collaborator.id} type="button" onClick={() => insertMention(collaborator)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">
                  @{collaborator.label}
                </button>
              ))}
            </div>
          )}
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ajouter un commentaire..." className="rounded-xl bg-dtsc-page" />
          <Button className="rounded-xl bg-dtsc-blue text-white"><Send className="h-4 w-4" /> Envoyer</Button>
        </form>
      </div>

      <Dialog open={Boolean(editingComment)} title="Modifier le commentaire" onClose={() => setEditingComment(null)} className="max-w-xl">
        <form onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("content") || ""); if (editingComment) void mutateComment("PATCH", editingComment, value); }} className="space-y-4">
          <textarea name="content" defaultValue={editingComment?.content || ""} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink" required />
          <Button className="rounded-xl bg-dtsc-blue text-white">Enregistrer</Button>
        </form>
      </Dialog>
      <Dialog open={Boolean(deletingComment)} title="Supprimer le commentaire" description="Le contenu sera masqué, sans casser les réponses associées." onClose={() => setDeletingComment(null)} className="max-w-xl">
        <Button type="button" onClick={() => deletingComment && void mutateComment("DELETE", deletingComment)} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Confirmer la suppression</Button>
      </Dialog>
    </div>
  );
}

function CollaboratorRequestConversation({ item, response }: { item: ActivityItem; response: string }) {
  const requestMessage = item.requestMessage || item.body || "";
  return (
    <div className="mt-5 space-y-3">
      <div className="border-l-2 border-dtsc-border pl-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-dtsc-muted">Demande de {item.requesterName || "collaborateur"} vers {item.targetName || "destinataire"}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-dtsc-ink">{requestMessage}</p>
        {item.attachments?.length ? <AttachmentList attachments={item.attachments} className="mt-4" /> : null}
      </div>
      {response ? (
        <div className="ml-0 border-l-2 border-cyan-400 pl-4 sm:ml-8">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Réponse de {item.targetName || "collaborateur destinataire"}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-dtsc-ink">{response}</p>
        </div>
      ) : (
        <p className="ml-0 border-l-2 border-dashed border-dtsc-border pl-4 text-xs font-bold text-dtsc-muted sm:ml-8">Aucune réponse enregistrée pour cette demande.</p>
      )}
    </div>
  );
}

function AttachmentList({ attachments, className = "" }: { attachments: ActivityAttachment[]; className?: string }) {
  const [preview, setPreview] = useState<ActivityAttachment | null>(null);
  return (
    <div className={`grid gap-2 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-dtsc-muted">Pièces jointes</p>
      {attachments.map((attachment) => {
        const canPreviewImage = attachment.type?.startsWith("image/") || /\.(png|jpe?g|webp)(\?|$)/i.test(attachment.url);
        const canPreviewPdf = attachment.type === "application/pdf" || /\.pdf(\?|$)/i.test(attachment.url);
        return (
          <div key={`${attachment.url}-${attachment.name}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-dtsc-border py-3 last:border-b-0">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink">
              <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
              <span className="min-w-0 truncate">{attachment.name}</span>
              <span className="shrink-0 text-xs text-dtsc-muted">{formatFileSize(attachment.size)}</span>
            </span>
            <span className="flex flex-wrap gap-2">
              {(canPreviewImage || canPreviewPdf) && (
                <Button type="button" size="sm" variant="outline" onClick={() => setPreview(attachment)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><Eye className="h-4 w-4" /> Aperçu</Button>
              )}
              <a href={attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-3 py-2 text-xs font-black text-white transition hover:opacity-90"><Download className="h-4 w-4" /> Télécharger</a>
            </span>
          </div>
        );
      })}
      <Dialog open={Boolean(preview)} title={preview ? `Aperçu: ${preview.name}` : "Aperçu"} onClose={() => setPreview(null)} className="max-w-5xl">
        {preview && (preview.type?.startsWith("image/") || /\.(png|jpe?g|webp)(\?|$)/i.test(preview.url)) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70vh] max-w-full rounded-2xl border border-dtsc-border object-contain" />
        ) : preview ? (
          <iframe src={preview.url} title={preview.name} className="h-[70vh] w-full rounded-2xl border border-dtsc-border bg-white" />
        ) : null}
      </Dialog>
    </div>
  );
}

function ActivityMentionText({ content, mentions }: { content: string; mentions: Array<{ id: string; name: string }> }) {
  if (!mentions.length) {
    return <>{content}</>;
  }
  const mentionByName = new Map(mentions.map((mention) => [`@${mention.name}`, mention]));
  const pattern = new RegExp(`(${mentions.map((mention) => escapeRegExp(`@${mention.name}`)).join("|")})`, "g");
  return (
    <>
      {content.split(pattern).map((part, index) => {
        const mention = mentionByName.get(part);
        if (!mention) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }
        return (
          <button key={`${mention.id}-${index}`} type="button" onClick={() => copyText(mention.name)} className="font-black text-cyan-600 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-300" title="Copier le nom du collaborateur mentionné">
            @{mention.name}
          </button>
        );
      })}
    </>
  );
}

function copyText(value: string) {
  const clipboard = typeof globalThis.navigator !== "undefined" ? globalThis.navigator.clipboard : null;
  void clipboard?.writeText(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / 1024 / 1024).toFixed(2)} Mo`;
}
