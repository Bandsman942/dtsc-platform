"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import { MessageCircle, Megaphone, Pencil, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";
import { hasHtmlMarkup, sanitizeRichHtml } from "@/lib/rich-content";

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: UserRole; avatarUrl?: string | null; jobTitle?: string | null };
  comments: Array<{ id: string; content: string; createdAt: string; user: { id: string; name: string; role: UserRole; avatarUrl?: string | null } }>;
  reactions: Array<{ value: number }>;
};

type AnnouncementCommentItem = Announcement["comments"][number];

function canPublish(role: UserRole, allowClientAnnouncements: boolean) {
  return allowClientAnnouncements || role === "ADMIN" || role === "MANAGER" || role === "SUPPORT";
}

function isInsideEditWindow(createdAt: string, windowMinutes: number) {
  return Date.now() <= new Date(createdAt).getTime() + windowMinutes * 60 * 1000;
}

export function AnnouncementWall({
  announcements,
  currentUserId,
  role,
  allowClientAnnouncements,
  commentEditWindowMinutes,
}: {
  announcements: Announcement[];
  currentUserId: string;
  role: UserRole;
  allowClientAnnouncements: boolean;
  commentEditWindowMinutes: number;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [editingComment, setEditingComment] = useState<AnnouncementCommentItem | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<Announcement | null>(null);
  const [deletingComment, setDeletingComment] = useState<AnnouncementCommentItem | null>(null);
  const canPost = canPublish(role, allowClientAnnouncements);
  const isAdmin = role === "ADMIN";
  const announcementList = useSmartList({
    items: announcements,
    pageSize: 6,
    getSearchText: (announcement) =>
      `${announcement.title} ${announcement.content} ${announcement.author.name} ${announcement.author.role} ${announcement.comments.map((commentItem) => `${commentItem.content} ${commentItem.user.name}`).join(" ")}`,
  });

  async function createAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setFeedback(response.ok ? "Annonce publiée." : "Publication non autorisée ou invalide.");
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function comment(event: React.FormEvent<HTMLFormElement>, announcementId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`/api/announcements/${announcementId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      form.reset();
      router.refresh();
    } else {
      setFeedback("Impossible de publier ce commentaire.");
    }
  }

  async function react(announcementId: string, value: 1 | -1) {
    const response = await fetch(`/api/announcements/${announcementId}/reactions`, {
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

  async function updateAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAnnouncement) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/announcements/${editingAnnouncement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setFeedback("Annonce modifiée.");
      setEditingAnnouncement(null);
      router.refresh();
    } else {
      setFeedback("Seul l'administrateur peut modifier une annonce.");
    }
  }

  async function updateComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingComment) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/announcements/comments/${editingComment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setFeedback("Commentaire modifié.");
      setEditingComment(null);
      router.refresh();
    } else {
      setFeedback("La période de modification de ce commentaire est terminée.");
    }
  }

  async function deleteAnnouncement() {
    if (!deletingAnnouncement) {
      return;
    }
    const response = await fetch(`/api/announcements/${deletingAnnouncement.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setFeedback("Annonce supprimée.");
      setDeletingAnnouncement(null);
      router.refresh();
    } else {
      setFeedback("Seul l'administrateur peut supprimer une annonce.");
    }
  }

  async function deleteComment() {
    if (!deletingComment) {
      return;
    }
    const response = await fetch(`/api/announcements/comments/${deletingComment.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setFeedback("Commentaire supprimé.");
      setDeletingComment(null);
      router.refresh();
    } else {
      setFeedback("Seul l'administrateur peut supprimer un commentaire.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <section className="dtsc-card p-6">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="font-black text-dtsc-ink">Publication</h2>
              <p className="text-sm text-dtsc-muted">
                {canPost ? "Votre rôle permet de publier sur le mur DTSC." : "Les clients peuvent lire, commenter et réagir aux annonces."}
              </p>
            </div>
          </div>
          {canPost && (
            <form onSubmit={createAnnouncement} className="mt-5 space-y-3">
              <Input name="title" placeholder="Titre de l'annonce" required />
              <RichTextEditor
                textName="content"
                htmlName="contentHtml"
                placeholder="Contenu de l'annonce. Vous pouvez utiliser la mise en forme ou coller un texte déjà décoré."
                minHeightClassName="min-h-40"
              />
              <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Publier</Button>
            </form>
          )}
        </section>
      </aside>

      <section className="space-y-5">
        {announcements.length > 0 && (
          <ListControls
            query={announcementList.query}
            onQueryChange={announcementList.setQuery}
            page={announcementList.page}
            pageCount={announcementList.pageCount}
            totalCount={announcementList.totalCount}
            filteredCount={announcementList.filteredCount}
            placeholder="Rechercher dans les annonces, auteurs et commentaires..."
            onPageChange={announcementList.setPage}
          />
        )}
        {announcementList.paginatedItems.map((announcement) => {
          const likes = announcement.reactions.filter((reaction) => reaction.value === 1).length;
          const dislikes = announcement.reactions.filter((reaction) => reaction.value === -1).length;
          return (
            <article key={announcement.id} className="dtsc-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <AuthorAvatar name={announcement.author.name} avatarUrl={announcement.author.avatarUrl} />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted">
                        {announcement.author.name} · {formatEnumLabel(announcement.author.role)} · {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                      </p>
                      {announcement.author.jobTitle && <p className="mt-1 text-xs font-bold text-dtsc-blue">{announcement.author.jobTitle}</p>}
                    </div>
                  </div>
                  <h2 className="mt-2 text-2xl font-black text-dtsc-ink">{announcement.title}</h2>
                  <RichAnnouncementContent content={announcement.content} />
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingAnnouncement(announcement)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                      <Pencil className="h-4 w-4" />
                      Modifier
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => setDeletingAnnouncement(announcement)} className="rounded-xl">
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => react(announcement.id, 1)} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  <ThumbsUp className="h-4 w-4" />
                  {likes}
                </Button>
                <Button onClick={() => react(announcement.id, -1)} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  <ThumbsDown className="h-4 w-4" />
                  {dislikes}
                </Button>
                <span className="inline-flex items-center gap-2 rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-bold text-dtsc-blue">
                  <MessageCircle className="h-4 w-4" />
                  {announcement.comments.length} commentaires
                </span>
              </div>
              <AnnouncementComments
                comments={announcement.comments}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                commentEditWindowMinutes={commentEditWindowMinutes}
                onEdit={setEditingComment}
                onDelete={setDeletingComment}
              />
              <form onSubmit={(event) => comment(event, announcement.id)} className="mt-4 flex gap-2">
                <Input name="content" placeholder="Ajouter un commentaire..." required />
                <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Envoyer</Button>
              </form>
            </article>
          );
        })}
        {!announcementList.filteredCount && (
          <div className="dtsc-card p-8 text-center text-dtsc-muted">
            {announcements.length ? "Aucune annonce ne correspond à votre recherche." : "Aucune annonce publiée."}
          </div>
        )}
      </section>
      <Dialog open={Boolean(editingAnnouncement)} title="Modifier l'annonce" onClose={() => setEditingAnnouncement(null)}>
        {editingAnnouncement && (
          <form onSubmit={updateAnnouncement} className="space-y-3">
            <Input name="title" defaultValue={editingAnnouncement.title} required />
            <RichTextEditor
              textName="content"
              htmlName="contentHtml"
              defaultValue={editingAnnouncement.content}
              placeholder="Contenu de l'annonce"
              minHeightClassName="min-h-48"
            />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Enregistrer</Button>
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
      <Dialog open={Boolean(feedback)} title="Message DTSC" onClose={() => setFeedback("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{feedback}</p>
      </Dialog>
      <Dialog
        open={Boolean(deletingAnnouncement)}
        title="Supprimer l'annonce"
        description="Action réservée à l'administrateur DTSC."
        onClose={() => setDeletingAnnouncement(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeletingAnnouncement(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={deleteAnnouncement} className="rounded-xl">
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression de cette annonce et de ses interactions associées.</p>
      </Dialog>
      <Dialog
        open={Boolean(deletingComment)}
        title="Supprimer le commentaire"
        description="Action réservée à l'administrateur DTSC."
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
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression définitive de ce commentaire.</p>
      </Dialog>
    </div>
  );
}

function AnnouncementComments({
  comments,
  currentUserId,
  isAdmin,
  commentEditWindowMinutes,
  onEdit,
  onDelete,
}: {
  comments: AnnouncementCommentItem[];
  currentUserId: string;
  isAdmin: boolean;
  commentEditWindowMinutes: number;
  onEdit: (comment: AnnouncementCommentItem) => void;
  onDelete: (comment: AnnouncementCommentItem) => void;
}) {
  const commentList = useSmartList({
    items: comments,
    pageSize: 5,
    getSearchText: (commentItem) => `${commentItem.content} ${commentItem.user.name} ${commentItem.user.role} ${commentItem.createdAt}`,
  });

  return (
    <div className="mt-5 space-y-3">
      {comments.length > 5 && (
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
      {commentList.paginatedItems.map((commentItem) => {
        const canEditComment = isAdmin || (commentItem.user.id === currentUserId && isInsideEditWindow(commentItem.createdAt, commentEditWindowMinutes));
        return (
          <div key={commentItem.id} className="rounded-2xl bg-dtsc-page p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-dtsc-blue">{commentItem.user.name} · {formatEnumLabel(commentItem.user.role)}</p>
                <p className="mt-1 text-sm text-dtsc-muted">{commentItem.content}</p>
              </div>
              {canEditComment && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => onEdit(commentItem)} className="rounded-lg px-2 py-1 text-xs font-black text-dtsc-blue underline underline-offset-4 hover:bg-dtsc-soft">
                    Modifier
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => onDelete(commentItem)} className="rounded-lg px-2 py-1 text-xs font-black text-red-600 underline underline-offset-4 hover:bg-red-50">
                      Supprimer
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!commentList.filteredCount && comments.length > 0 && (
        <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Aucun commentaire ne correspond à votre recherche.</p>
      )}
    </div>
  );
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-dtsc-soft text-sm font-black text-dtsc-blue">
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function RichAnnouncementContent({ content }: { content: string }) {
  if (hasHtmlMarkup(content)) {
    return (
      <div
        className="dtsc-publication-content mt-3 text-dtsc-muted"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  return <p className="mt-3 whitespace-pre-wrap leading-7 text-dtsc-muted">{content}</p>;
}
