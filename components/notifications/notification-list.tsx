"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function fallbackTarget(type: string) {
  if (type === "SUPPORT") {
    return "/support";
  }
  if (type === "ANNOUNCEMENT") {
    return "/announcements";
  }
  return "/notifications";
}

function preview(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 190 ? `${compact.slice(0, 187)}...` : compact;
}

export function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [feedback, setFeedback] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const notificationList = useSmartList({
    items: notifications,
    pageSize: 8,
    getSearchText: (notification) => `${notification.title} ${notification.body} ${notification.type} ${notification.createdAt}`,
  });

  async function markRead(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (response.ok) {
      router.refresh();
    }
  }

  async function openNotification(notification: NotificationItem) {
    setSelected(notification);
    setFeedback("");
    if (!notification.readAt) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      setSelected({ ...notification, readAt: new Date().toISOString() });
      router.refresh();
    }
  }

  async function deleteNotification() {
    if (!selected) {
      return;
    }
    const response = await fetch(`/api/notifications/${selected.id}`, { method: "DELETE" });
    if (response.ok) {
      setSelected(null);
      router.refresh();
    } else {
      setFeedback("Impossible de supprimer cette notification.");
    }
  }

  async function clearNotifications() {
    const response = await fetch("/api/notifications", { method: "DELETE" });
    if (response.ok) {
      setClearOpen(false);
      setSelected(null);
      router.refresh();
    } else {
      setFeedback("Impossible de vider les notifications.");
    }
  }

  return (
    <div className="space-y-4">
      {notifications.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => setClearOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
            <Trash2 className="h-4 w-4" />
            Vider les notifications
          </Button>
        </div>
      )}
      {notifications.length > 0 && (
        <ListControls
          query={notificationList.query}
          onQueryChange={notificationList.setQuery}
          page={notificationList.page}
          pageCount={notificationList.pageCount}
          totalCount={notificationList.totalCount}
          filteredCount={notificationList.filteredCount}
          placeholder="Rechercher par titre, type ou contenu..."
          onPageChange={notificationList.setPage}
        />
      )}
      {notificationList.paginatedItems.map((notification) => {
        const unread = !notification.readAt;

        return (
          <article key={notification.id} className="dtsc-card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dtsc-soft text-cyan-500">
                <Bell className="h-5 w-5" />
              </div>
              <button type="button" onClick={() => openNotification(notification)} className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={unread ? "font-black text-dtsc-ink" : "font-bold text-dtsc-ink"}>{notification.title}</h2>
                  <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">{notification.type}</span>
                  {unread && <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-xs font-black text-[#001736]">Nouveau</span>}
                </div>
                <p className={unread ? "mt-2 text-sm font-bold leading-6 text-dtsc-muted" : "mt-2 text-sm leading-6 text-dtsc-muted"}>
                  {preview(notification.body)}
                </p>
                <p className="mt-2 text-xs text-dtsc-muted">{new Date(notification.createdAt).toLocaleString("fr-FR")}</p>
              </button>
            </div>
            {unread && (
              <Button onClick={() => markRead(notification.id)} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <CheckCircle2 className="h-4 w-4" />
                Marquer lu
              </Button>
            )}
          </article>
        );
      })}
      {!notificationList.filteredCount && (
        <div className="dtsc-card p-8 text-center text-dtsc-muted">
          {notifications.length ? "Aucune notification ne correspond à votre recherche." : "Aucune notification pour le moment."}
        </div>
      )}
      <Dialog
        open={Boolean(selected)}
        title={selected?.title || "Notification"}
        description={selected ? `${selected.type} · ${new Date(selected.createdAt).toLocaleString("fr-FR")}` : undefined}
        onClose={() => setSelected(null)}
        footer={
          selected && (
            <>
              <Button type="button" variant="destructive" onClick={deleteNotification} className="rounded-xl">
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
              <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                <Link href={selected.targetUrl || fallbackTarget(selected.type)}>
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir le module
                </Link>
              </Button>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-dtsc-muted">{selected.body}</p>
            {feedback && <div className="rounded-xl bg-dtsc-soft p-3 text-sm font-bold text-dtsc-blue">{feedback}</div>}
          </div>
        )}
      </Dialog>
      <Dialog
        open={clearOpen}
        title="Vider les notifications"
        description="Cette action supprime uniquement vos notifications personnelles."
        onClose={() => setClearOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setClearOpen(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={clearNotifications} className="rounded-xl">
              Vider
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression de toutes vos notifications. Les annonces, tickets et messages liés ne seront pas supprimés.</p>
      </Dialog>
      <Dialog open={Boolean(feedback) && !selected} title="Notifications DTSC" onClose={() => setFeedback("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{feedback}</p>
      </Dialog>
    </div>
  );
}
