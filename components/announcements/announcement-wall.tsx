"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import { Archive, BarChart3, Copy, Flag, Info, MessageCircle, Megaphone, Pencil, Pin, Send, ThumbsDown, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
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
  status?: string;
  category?: string;
  visibility?: string;
  viewCount?: number;
  shareCount?: number;
  reportCount?: number;
  lastAction?: string | null;
  pinnedAt?: string | null;
  archivedAt?: string | null;
  updatedAt?: string;
  createdAt: string;
  author: { id: string; name: string; role: UserRole; avatarUrl?: string | null; jobTitle?: string | null };
  comments: Array<{ id: string; parentId: string | null; content: string; createdAt: string; user: { id: string; name: string; role: UserRole; avatarUrl?: string | null } }>;
  reactions: Array<{ value: number }>;
  shares?: Array<{ id: string }>;
  reports?: Array<{ id: string; status: string }>;
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
  transferRecipients,
}: {
  announcements: Announcement[];
  currentUserId: string;
  role: UserRole;
  allowClientAnnouncements: boolean;
  commentEditWindowMinutes: number;
  transferRecipients: Array<{ id: string; name: string; email: string; role: UserRole; avatarUrl?: string | null; jobTitle?: string | null; departmentName?: string | null; positionTitle?: string | null }>;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [editingComment, setEditingComment] = useState<AnnouncementCommentItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ announcementId: string; comment: AnnouncementCommentItem } | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<Announcement | null>(null);
  const [deletingComment, setDeletingComment] = useState<AnnouncementCommentItem | null>(null);
  const [infoAnnouncement, setInfoAnnouncement] = useState<Announcement | null>(null);
  const [metricsAnnouncement, setMetricsAnnouncement] = useState<Announcement | null>(null);
  const [transferAnnouncement, setTransferAnnouncement] = useState<Announcement | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [selectedTransferRecipientIds, setSelectedTransferRecipientIds] = useState<string[]>([]);
  const [reportAnnouncement, setReportAnnouncement] = useState<Announcement | null>(null);
  const canPost = canPublish(role, allowClientAnnouncements);
  const isAdmin = role === "ADMIN";
  const filteredTransferRecipients = useMemo(() => {
    const queryTokens = normalizeSearchText(transferSearch).split(/\s+/).filter(Boolean);
    return transferRecipients
      .filter((recipient) => recipient.id !== currentUserId)
      .map((recipient) => ({
        recipient,
        searchable: normalizeSearchText(`${recipient.name} ${recipient.email} ${recipient.role} ${recipient.jobTitle || ""} ${recipient.departmentName || ""} ${recipient.positionTitle || ""}`),
      }))
      .filter(({ recipient, searchable }) => selectedTransferRecipientIds.includes(recipient.id) || !queryTokens.length || queryTokens.every((token) => searchable.includes(token)))
      .sort((left, right) => {
        const leftSelected = selectedTransferRecipientIds.includes(left.recipient.id);
        const rightSelected = selectedTransferRecipientIds.includes(right.recipient.id);
        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1;
        }
        return transferSearchScore(right.searchable, queryTokens) - transferSearchScore(left.searchable, queryTokens);
      })
      .map(({ recipient }) => recipient)
      .slice(0, 100);
  }, [currentUserId, selectedTransferRecipientIds, transferRecipients, transferSearch]);
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

  async function comment(event: React.FormEvent<HTMLFormElement>, announcementId: string, parentId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`/api/announcements/${announcementId}/comments`, {
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

  async function copyAnnouncement(announcement: Announcement) {
    const response = await fetch(`/api/announcements/${announcement.id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titlePrefix: "Copie de" }),
    });
    setFeedback(response.ok ? "Copie créée en brouillon." : "Impossible de copier cette annonce.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function updateAnnouncementStatus(announcement: Announcement, action: "ARCHIVE" | "RESTORE" | "PIN" | "UNPIN") {
    const response = await fetch(`/api/announcements/${announcement.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setFeedback(response.ok ? "Action appliquée." : "Action non autorisée.");
    if (response.ok) {
      router.refresh();
    }
  }

  async function transfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferAnnouncement) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/announcements/${transferAnnouncement.id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientIds: selectedTransferRecipientIds, message: String(formData.get("message") || "") }),
    });
    setFeedback(response.ok ? "Annonce transférée." : "Impossible de transférer cette annonce.");
    if (response.ok) {
      setTransferAnnouncement(null);
      setTransferSearch("");
      setSelectedTransferRecipientIds([]);
      router.refresh();
    }
  }

  function toggleTransferRecipient(userId: string) {
    setSelectedTransferRecipientIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportAnnouncement) {
      return;
    }
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/announcements/${reportAnnouncement.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setFeedback(response.ok ? "Signalement transmis." : "Impossible de transmettre le signalement.");
    if (response.ok) {
      setReportAnnouncement(null);
      router.refresh();
    }
  }

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4">
        <section className="dtsc-card min-w-0 p-4 sm:p-6">
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

      <section className="min-w-0 space-y-5">
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
            <article key={announcement.id} className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
              <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-3">
                    <AuthorAvatar name={announcement.author.name} avatarUrl={announcement.author.avatarUrl} />
                    <div className="min-w-0">
                      <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted sm:tracking-[0.18em]">
                        {announcement.author.name} · {formatEnumLabel(announcement.author.role)} · {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                      </p>
                      {announcement.author.jobTitle && <p className="mt-1 text-xs font-bold text-dtsc-blue">{announcement.author.jobTitle}</p>}
                    </div>
                  </div>
                  <h2 className="mt-3 break-words text-xl font-black leading-tight text-dtsc-ink sm:text-2xl">{announcement.title}</h2>
                  <RichAnnouncementContent content={announcement.content} />
                </div>
                <ActionMenu
                  label="Actions de l'annonce"
                  items={[
                    { key: "info", label: "Infos sur l'annonce", icon: Info, onSelect: () => setInfoAnnouncement(announcement) },
                    ...(isAdmin ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => setEditingAnnouncement(announcement) }] : []),
                    ...(isAdmin ? [{ key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setDeletingAnnouncement(announcement) }] : []),
                    { key: "copy", label: "Copier", icon: Copy, onSelect: () => copyAnnouncement(announcement) },
                    { key: "transfer", label: "Transférer", icon: Send, onSelect: () => setTransferAnnouncement(announcement) },
                    { key: "metrics", label: "Voir les indicateurs", icon: BarChart3, onSelect: () => setMetricsAnnouncement(announcement) },
                    { key: "report", label: "Signaler", icon: Flag, onSelect: () => setReportAnnouncement(announcement) },
                    ...(isAdmin && announcement.status !== "ARCHIVED" ? [{ key: "archive", label: "Archiver", icon: Archive, onSelect: () => updateAnnouncementStatus(announcement, "ARCHIVE") }] : []),
                    ...(isAdmin && announcement.status === "ARCHIVED" ? [{ key: "restore", label: "Restaurer", icon: Undo2, onSelect: () => updateAnnouncementStatus(announcement, "RESTORE") }] : []),
                    ...(isAdmin && !announcement.pinnedAt ? [{ key: "pin", label: "Épingler", icon: Pin, onSelect: () => updateAnnouncementStatus(announcement, "PIN") }] : []),
                    ...(isAdmin && announcement.pinnedAt ? [{ key: "unpin", label: "Désépingler", icon: Pin, onSelect: () => updateAnnouncementStatus(announcement, "UNPIN") }] : []),
                  ]}
                />
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
                announcementId={announcement.id}
                comments={announcement.comments}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                commentEditWindowMinutes={commentEditWindowMinutes}
                onEdit={setEditingComment}
                onDelete={setDeletingComment}
                onReply={(commentItem) => setReplyingTo({ announcementId: announcement.id, comment: commentItem })}
              />
              <form onSubmit={(event) => comment(event, announcement.id)} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
              key={editingAnnouncement.id}
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
      <Dialog open={Boolean(replyingTo)} title="Répondre au commentaire" onClose={() => setReplyingTo(null)}>
        {replyingTo && (
          <form onSubmit={(event) => comment(event, replyingTo.announcementId, replyingTo.comment.id)} className="space-y-3">
            <p className="rounded-xl bg-dtsc-page p-3 text-sm leading-6 text-dtsc-muted">{replyingTo.comment.content}</p>
            <textarea name="content" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" placeholder="Votre réponse..." required />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Répondre</Button>
          </form>
        )}
      </Dialog>
      <Dialog open={Boolean(infoAnnouncement)} title="Infos sur l'annonce" onClose={() => setInfoAnnouncement(null)}>
        {infoAnnouncement && (
          <div className="grid gap-3 text-sm text-dtsc-muted sm:grid-cols-2">
            <InfoLine label="Titre" value={infoAnnouncement.title} />
            <InfoLine label="Auteur" value={infoAnnouncement.author.name} />
            <InfoLine label="Créée le" value={new Date(infoAnnouncement.createdAt).toLocaleString("fr-FR")} />
            <InfoLine label="Modifiée le" value={infoAnnouncement.updatedAt ? new Date(infoAnnouncement.updatedAt).toLocaleString("fr-FR") : "Non renseigné"} />
            <InfoLine label="Statut" value={formatEnumLabel(infoAnnouncement.status || "ACTIVE")} />
            <InfoLine label="Catégorie" value={formatEnumLabel(infoAnnouncement.category || "GENERAL")} />
            <InfoLine label="Visibilité" value={formatEnumLabel(infoAnnouncement.visibility || "INTERNAL")} />
            <InfoLine label="Vues" value={String(infoAnnouncement.viewCount || 0)} />
            <InfoLine label="Partages" value={String(infoAnnouncement.shareCount ?? infoAnnouncement.shares?.length ?? 0)} />
            <InfoLine label="Signalements" value={String(infoAnnouncement.reportCount ?? infoAnnouncement.reports?.length ?? 0)} />
            <InfoLine label="Dernière action" value={infoAnnouncement.lastAction || "Aucune action récente"} />
          </div>
        )}
      </Dialog>
      <Dialog open={Boolean(metricsAnnouncement)} title="Indicateurs de l'annonce" onClose={() => setMetricsAnnouncement(null)}>
        {metricsAnnouncement && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Vues" value={metricsAnnouncement.viewCount || 0} />
            <Metric label="Réactions" value={metricsAnnouncement.reactions.length} />
            <Metric label="Commentaires" value={metricsAnnouncement.comments.length} />
            <Metric label="Partages" value={metricsAnnouncement.shareCount ?? metricsAnnouncement.shares?.length ?? 0} />
            <Metric label="Signalements ouverts" value={metricsAnnouncement.reports?.filter((reportItem) => reportItem.status === "OPEN").length ?? metricsAnnouncement.reportCount ?? 0} />
            <Metric label="Engagement" value={metricsAnnouncement.reactions.length + metricsAnnouncement.comments.length + (metricsAnnouncement.shareCount || 0)} />
          </div>
        )}
      </Dialog>
      <Dialog open={Boolean(transferAnnouncement)} title="Transférer l'annonce" onClose={() => {
        setTransferAnnouncement(null);
        setTransferSearch("");
        setSelectedTransferRecipientIds([]);
      }}>
        {transferAnnouncement && (
          <form onSubmit={transfer} className="space-y-4">
            <p className="text-sm font-semibold text-dtsc-ink">{transferAnnouncement.title}</p>
            <Input
              value={transferSearch}
              onChange={(event) => setTransferSearch(event.target.value)}
              placeholder="Rechercher par nom, email, poste ou département..."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedTransferRecipientIds((current) => [...new Set([...current, ...filteredTransferRecipients.map((recipient) => recipient.id)])])}
                disabled={!filteredTransferRecipients.length}
                className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"
              >
                Tout sélectionner
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedTransferRecipientIds([])}
                disabled={!selectedTransferRecipientIds.length}
                className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"
              >
                Réinitialiser
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
              {filteredTransferRecipients.map((recipient) => (
                <label key={recipient.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-dtsc-surface px-3 py-2 text-sm text-dtsc-muted transition hover:bg-dtsc-soft">
                  <input type="checkbox" checked={selectedTransferRecipientIds.includes(recipient.id)} onChange={() => toggleTransferRecipient(recipient.id)} className="h-4 w-4 shrink-0 accent-cyan-500" />
                  <AuthorAvatar name={recipient.name} avatarUrl={recipient.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-dtsc-ink">{recipient.name}</span>
                    <span className="block truncate text-xs">
                      {recipient.email} · {recipient.positionTitle || recipient.jobTitle || formatEnumLabel(recipient.role)}
                      {recipient.departmentName ? ` · ${recipient.departmentName}` : ""}
                    </span>
                  </span>
                </label>
              ))}
              {!filteredTransferRecipients.length && (
                <p className="rounded-xl bg-dtsc-surface p-3 text-sm text-dtsc-muted">Aucun destinataire ne correspond à cette recherche.</p>
              )}
            </div>
            <p className="text-xs font-bold text-dtsc-blue">{selectedTransferRecipientIds.length} destinataire(s) sélectionné(s).</p>
            <textarea name="message" placeholder="Message optionnel..." className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
            <Button disabled={!selectedTransferRecipientIds.length} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Transférer</Button>
          </form>
        )}
      </Dialog>
      <Dialog open={Boolean(reportAnnouncement)} title="Signaler l'annonce" onClose={() => setReportAnnouncement(null)}>
        {reportAnnouncement && (
          <form onSubmit={report} className="space-y-3">
            <select name="reason" className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
              <option value="ERROR">Information incorrecte</option>
              <option value="CONFIDENTIAL">Information confidentielle</option>
              <option value="SPAM">Spam</option>
              <option value="INAPPROPRIATE">Contenu inapproprié</option>
              <option value="OTHER">Autre</option>
            </select>
            <select name="priority" defaultValue="NORMAL" className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold text-dtsc-ink">
              <option value="LOW">Faible</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Élevée</option>
              <option value="CRITICAL">Critique</option>
            </select>
            <textarea name="description" placeholder="Décrivez le problème..." className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
            <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Envoyer le signalement</Button>
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
  announcementId,
  comments,
  currentUserId,
  isAdmin,
  commentEditWindowMinutes,
  onEdit,
  onDelete,
  onReply,
}: {
  announcementId: string;
  comments: AnnouncementCommentItem[];
  currentUserId: string;
  isAdmin: boolean;
  commentEditWindowMinutes: number;
  onEdit: (comment: AnnouncementCommentItem) => void;
  onDelete: (comment: AnnouncementCommentItem) => void;
  onReply: (comment: AnnouncementCommentItem) => void;
}) {
  const commentsByParent = new Map<string, AnnouncementCommentItem[]>();
  for (const commentItem of comments) {
    const parentKey = commentItem.parentId || "root";
    commentsByParent.set(parentKey, [...(commentsByParent.get(parentKey) || []), commentItem]);
  }
  const rootComments = commentsByParent.get("root") || [];
  const commentList = useSmartList({
    items: rootComments,
    pageSize: 20,
    getSearchText: (commentItem) => {
      const replies = commentsByParent.get(commentItem.id) || [];
      return `${commentItem.content} ${commentItem.user.name} ${commentItem.user.role} ${commentItem.createdAt} ${replies.map((reply) => `${reply.content} ${reply.user.name}`).join(" ")}`;
    },
  });

  function renderComment(commentItem: AnnouncementCommentItem, depth = 0) {
    const canEditComment = isAdmin || (commentItem.user.id === currentUserId && isInsideEditWindow(commentItem.createdAt, commentEditWindowMinutes));
    const replies = commentsByParent.get(commentItem.id) || [];

    return (
      <div key={commentItem.id} className={depth > 0 ? "ml-3 min-w-0 border-l border-dtsc-border pl-3 sm:ml-5 sm:pl-4" : "min-w-0"}>
        <div className="rounded-2xl bg-dtsc-page p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <p className="break-words text-xs font-black text-dtsc-blue">{commentItem.user.name} · {formatEnumLabel(commentItem.user.role)}</p>
              <p className="mt-1 break-words text-sm text-dtsc-muted">{commentItem.content}</p>
            </div>
            <ActionMenu
              label="Actions du commentaire"
              items={[
                { key: "reply", label: "Répondre", icon: MessageCircle, onSelect: () => onReply(commentItem) },
                { key: "copy", label: "Copier le texte", icon: Copy, onSelect: () => copyText(commentItem.content) },
                ...(canEditComment ? [{ key: "edit", label: "Modifier", icon: Pencil, onSelect: () => onEdit(commentItem) }] : []),
                ...(isAdmin ? [{ key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => onDelete(commentItem) }] : []),
              ]}
            />
          </div>
        </div>
        {replies.length > 0 && <div className="mt-3 space-y-3">{replies.map((reply) => renderComment(reply, depth + 1))}</div>}
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {rootComments.length > 20 && (
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
      <span className="sr-only">Fil de commentaires de l&apos;annonce {announcementId}</span>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-surface/40 p-2 pr-1">
        {commentList.paginatedItems.map((commentItem) => renderComment(commentItem))}
        {!commentList.filteredCount && rootComments.length > 0 && (
          <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Aucun commentaire ne correspond à votre recherche.</p>
        )}
        {!rootComments.length && (
          <p className="rounded-xl bg-dtsc-page p-3 text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p>
        )}
      </div>
    </div>
  );
}

function copyText(value: string) {
  const clipboard = typeof globalThis.navigator !== "undefined" ? globalThis.navigator.clipboard : null;
  void clipboard?.writeText(value);
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-dtsc-soft text-sm font-black text-dtsc-blue">
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-1 break-words font-bold text-dtsc-ink">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function transferSearchScore(searchable: string, tokens: string[]) {
  if (!tokens.length) {
    return 0;
  }
  return tokens.reduce((score, token) => {
    if (searchable.startsWith(token)) {
      return score + 3;
    }
    if (searchable.includes(` ${token}`)) {
      return score + 2;
    }
    return searchable.includes(token) ? score + 1 : score;
  }, 0);
}

function RichAnnouncementContent({ content }: { content: string }) {
  if (hasHtmlMarkup(content)) {
    return (
      <div
        className="dtsc-publication-content dtsc-feed-content mt-3 text-dtsc-muted"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  return <p className="dtsc-feed-content mt-3 whitespace-pre-wrap leading-7 text-dtsc-muted">{content}</p>;
}
