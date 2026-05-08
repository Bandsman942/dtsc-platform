"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import { MessageCircle, Pencil, Reply, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type PublicationComment = {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  user: { id: string; name: string; role: UserRole; avatarUrl?: string | null };
};

type PublicationReaction = {
  value: number;
  userId: string;
};

type CurrentUser = {
  id: string;
  role: UserRole;
  name: string;
} | null;

function isInsideEditWindow(createdAt: string, windowMinutes: number) {
  return Date.now() <= new Date(createdAt).getTime() + windowMinutes * 60 * 1000;
}

export function PublicationEngagement({
  publicationId,
  comments,
  reactions,
  currentUser,
  commentEditWindowMinutes,
}: {
  publicationId: string;
  comments: PublicationComment[];
  reactions: PublicationReaction[];
  currentUser: CurrentUser;
  commentEditWindowMinutes: number;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [replyingTo, setReplyingTo] = useState<PublicationComment | null>(null);
  const [editingComment, setEditingComment] = useState<PublicationComment | null>(null);
  const [deletingComment, setDeletingComment] = useState<PublicationComment | null>(null);
  const isAdmin = currentUser?.role === "ADMIN";
  const likes = reactions.filter((reaction) => reaction.value === 1).length;
  const dislikes = reactions.filter((reaction) => reaction.value === -1).length;
  const currentReaction = currentUser ? reactions.find((reaction) => reaction.userId === currentUser.id)?.value : 0;
  const commentTree = useMemo(() => {
    const byParent = new Map<string, PublicationComment[]>();
    for (const comment of comments) {
      byParent.set(comment.parentId || "root", [...(byParent.get(comment.parentId || "root") || []), comment]);
    }
    return byParent;
  }, [comments]);
  const rootComments = useMemo(() => commentTree.get("root") || [], [commentTree]);
  const commentList = useSmartList({
    items: rootComments,
    pageSize: 6,
    getSearchText: (comment) => {
      const replies = commentTree.get(comment.id) || [];
      return `${comment.content} ${comment.user.name} ${comment.user.role} ${replies.map((reply) => `${reply.content} ${reply.user.name}`).join(" ")}`;
    },
  });

  async function createComment(event: React.FormEvent<HTMLFormElement>, parentId?: string) {
    event.preventDefault();
    if (!currentUser) {
      setFeedback("Connectez-vous pour commenter cette publication.");
      return;
    }

    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`/api/publications/${publicationId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, parentId }),
    });

    if (response.ok) {
      form.reset();
      setReplyingTo(null);
      router.refresh();
    } else {
      setFeedback("Impossible de publier ce commentaire.");
    }
  }

  async function react(value: 1 | -1) {
    if (!currentUser) {
      setFeedback("Connectez-vous pour réagir à cette publication.");
      return;
    }

    const response = await fetch(`/api/publications/${publicationId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

    if (response.ok) {
      router.refresh();
    } else {
      setFeedback("Impossible d'enregistrer cette réaction.");
    }
  }

  async function updateComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingComment) {
      return;
    }

    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/publications/comments/${editingComment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setEditingComment(null);
      router.refresh();
    } else {
      setFeedback("La période de modification de ce commentaire est terminée.");
    }
  }

  async function deleteComment() {
    if (!deletingComment) {
      return;
    }

    const response = await fetch(`/api/publications/comments/${deletingComment.id}`, { method: "DELETE" });
    if (response.ok) {
      setDeletingComment(null);
      router.refresh();
    } else {
      setFeedback("Seul l'administrateur peut supprimer un commentaire.");
    }
  }

  function renderComment(comment: PublicationComment, depth = 0) {
    const replies = commentTree.get(comment.id) || [];
    const canEdit = isAdmin || (currentUser?.id === comment.user.id && isInsideEditWindow(comment.createdAt, commentEditWindowMinutes));

    return (
      <div key={comment.id} className={`${depth > 0 ? "ml-6 border-l border-dtsc-border pl-4" : ""}`}>
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-dtsc-soft text-xs font-black text-dtsc-blue">
                {comment.user.avatarUrl ? <img src={comment.user.avatarUrl} alt="" className="h-full w-full object-cover" /> : comment.user.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-blue">{comment.user.name} · {formatEnumLabel(comment.user.role)}</p>
                <p className="mt-1 text-sm leading-6 text-dtsc-muted">{comment.content}</p>
                <p className="mt-2 text-xs font-bold text-dtsc-muted">{new Date(comment.createdAt).toLocaleString("fr-FR")}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {currentUser && (
                <button type="button" onClick={() => setReplyingTo(comment)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-dtsc-blue underline underline-offset-4 hover:bg-dtsc-soft">
                  <Reply className="h-3.5 w-3.5" />
                  Répondre
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => setEditingComment(comment)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-dtsc-blue underline underline-offset-4 hover:bg-dtsc-soft">
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={() => setDeletingComment(comment)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-red-600 underline underline-offset-4 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
        {replies.length > 0 && <div className="mt-3 space-y-3">{replies.map((reply) => renderComment(reply, depth + 1))}</div>}
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-3xl border border-dtsc-border bg-dtsc-page p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">Échanges lecteurs</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">Réactions et commentaires</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => react(1)} variant="outline" className={`rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft ${currentReaction === 1 ? "ring-2 ring-cyan-400" : ""}`}>
            <ThumbsUp className="h-4 w-4" />
            {likes}
          </Button>
          <Button type="button" onClick={() => react(-1)} variant="outline" className={`rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft ${currentReaction === -1 ? "ring-2 ring-cyan-400" : ""}`}>
            <ThumbsDown className="h-4 w-4" />
            {dislikes}
          </Button>
          <span className="inline-flex items-center gap-2 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-bold text-dtsc-blue">
            <MessageCircle className="h-4 w-4" />
            {comments.length} commentaires
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rootComments.length > 6 && (
          <ListControls
            query={commentList.query}
            onQueryChange={commentList.setQuery}
            page={commentList.page}
            pageCount={commentList.pageCount}
            totalCount={commentList.totalCount}
            filteredCount={commentList.filteredCount}
            placeholder="Rechercher dans les commentaires..."
            onPageChange={commentList.setPage}
          />
        )}
        {commentList.paginatedItems.map((comment) => renderComment(comment))}
        {!commentList.filteredCount && rootComments.length > 0 && (
          <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun commentaire ne correspond à votre recherche.</p>
        )}
        {!comments.length && <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p>}
      </div>

      {currentUser ? (
        <form onSubmit={(event) => createComment(event)} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input name="content" placeholder="Ajouter un commentaire professionnel..." required />
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Commenter</Button>
        </form>
      ) : (
        <p className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm font-bold text-dtsc-muted">
          Connectez-vous à DTSC Platform pour commenter, répondre ou réagir.
        </p>
      )}

      <Dialog open={Boolean(replyingTo)} title="Répondre au commentaire" onClose={() => setReplyingTo(null)}>
        {replyingTo && (
          <form onSubmit={(event) => createComment(event, replyingTo.id)} className="space-y-3">
            <p className="rounded-xl bg-dtsc-page p-3 text-sm leading-6 text-dtsc-muted">{replyingTo.content}</p>
            <textarea name="content" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" placeholder="Votre réponse..." required />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Répondre</Button>
          </form>
        )}
      </Dialog>

      <Dialog open={Boolean(editingComment)} title="Modifier le commentaire" onClose={() => setEditingComment(null)}>
        {editingComment && (
          <form onSubmit={updateComment} className="space-y-3">
            <textarea name="content" defaultValue={editingComment.content} className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" required />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
          </form>
        )}
      </Dialog>

      <Dialog
        open={Boolean(deletingComment)}
        title="Supprimer le commentaire"
        onClose={() => setDeletingComment(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeletingComment(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={deleteComment} className="rounded-xl">
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Cette action est réservée à l&apos;administrateur et supprimera aussi les réponses associées.</p>
      </Dialog>

      <Dialog open={Boolean(feedback)} title="Publication DTSC" onClose={() => setFeedback("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{feedback}</p>
      </Dialog>
    </section>
  );
}
