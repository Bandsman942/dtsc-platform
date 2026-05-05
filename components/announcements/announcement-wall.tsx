"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import { MessageCircle, Megaphone, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { name: string; role: UserRole };
  comments: Array<{ id: string; content: string; createdAt: string; user: { name: string; role: UserRole } }>;
  reactions: Array<{ value: number }>;
};

function canPublish(role: UserRole, allowClientAnnouncements: boolean) {
  return allowClientAnnouncements || role === "ADMIN" || role === "MANAGER" || role === "SUPPORT";
}

export function AnnouncementWall({
  announcements,
  role,
  allowClientAnnouncements,
}: {
  announcements: Announcement[];
  role: UserRole;
  allowClientAnnouncements: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const canPost = canPublish(role, allowClientAnnouncements);

  async function createAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMessage(response.ok ? "Annonce publiée." : "Publication non autorisée ou invalide.");
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
              <textarea name="content" placeholder="Contenu de l'annonce" className="min-h-32 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" required />
              <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Publier</Button>
              {message && <p className="text-sm font-bold text-dtsc-blue">{message}</p>}
            </form>
          )}
        </section>
      </aside>

      <section className="space-y-5">
        {announcements.map((announcement) => {
          const likes = announcement.reactions.filter((reaction) => reaction.value === 1).length;
          const dislikes = announcement.reactions.filter((reaction) => reaction.value === -1).length;
          return (
            <article key={announcement.id} className="dtsc-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted">
                    {announcement.author.name} · {announcement.author.role} · {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-dtsc-ink">{announcement.title}</h2>
                  <p className="mt-3 whitespace-pre-wrap leading-7 text-dtsc-muted">{announcement.content}</p>
                </div>
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
              <div className="mt-5 space-y-3">
                {announcement.comments.map((commentItem) => (
                  <div key={commentItem.id} className="rounded-2xl bg-dtsc-page p-3">
                    <p className="text-xs font-black text-dtsc-blue">{commentItem.user.name} · {commentItem.user.role}</p>
                    <p className="mt-1 text-sm text-dtsc-muted">{commentItem.content}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={(event) => comment(event, announcement.id)} className="mt-4 flex gap-2">
                <Input name="content" placeholder="Ajouter un commentaire..." required />
                <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">Envoyer</Button>
              </form>
            </article>
          );
        })}
        {!announcements.length && <div className="dtsc-card p-8 text-center text-dtsc-muted">Aucune annonce publiée.</div>}
      </section>
    </div>
  );
}
