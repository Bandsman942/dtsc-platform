"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();

  async function markRead(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {notifications.map((notification) => (
        <article key={notification.id} className="dtsc-card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dtsc-soft text-cyan-500">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-black text-dtsc-ink">{notification.title}</h2>
                <span className="rounded-full bg-dtsc-soft px-2.5 py-1 text-xs font-black text-dtsc-blue">{notification.type}</span>
                {!notification.readAt && <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-xs font-black text-[#001736]">Nouveau</span>}
              </div>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{notification.body}</p>
              <p className="mt-2 text-xs text-dtsc-muted">{new Date(notification.createdAt).toLocaleString("fr-FR")}</p>
            </div>
          </div>
          {!notification.readAt && (
            <Button onClick={() => markRead(notification.id)} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <CheckCircle2 className="h-4 w-4" />
              Marquer lu
            </Button>
          )}
        </article>
      ))}
      {!notifications.length && (
        <div className="dtsc-card p-8 text-center text-dtsc-muted">Aucune notification pour le moment.</div>
      )}
    </div>
  );
}
