import { Bell, Bot, MessageSquare, Ticket } from "lucide-react";

type ProfileActivityItem = {
  id: string;
  type: "notification" | "conversation" | "ticket" | "group_message";
  title: string;
  detail: string;
  createdAt: string;
};

const icons = {
  notification: Bell,
  conversation: Bot,
  ticket: Ticket,
  group_message: MessageSquare,
} as const;

export function ProfileActivityHistory({
  items,
  retentionDays,
}: {
  items: ProfileActivityItem[];
  retentionDays: number;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-6 text-dtsc-muted">
        Historique limité aux activités récentes affichables pour votre compte. Les notifications suivent une rétention de {retentionDays} jours et les listes sont bornées pour préserver les performances mobiles.
      </div>
      <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => {
          const Icon = icons[item.type];
          return (
            <article key={`${item.type}-${item.id}`} className="flex gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-dtsc-ink">{item.title}</p>
                <p className="line-clamp-2 text-xs leading-5 text-dtsc-muted">{item.detail}</p>
                <p className="mt-1 text-[0.68rem] font-bold text-cyan-600">{new Date(item.createdAt).toLocaleString("fr-FR")}</p>
              </div>
            </article>
          );
        })}
        {!items.length && (
          <p className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">
            Aucun événement récent à afficher.
          </p>
        )}
      </div>
    </div>
  );
}

export type { ProfileActivityItem };
