"use client";

import { ConversationAvatar, type ConversationAvatarType } from "@/components/chat/ConversationAvatar";
import { PresenceIndicator } from "@/components/chat/PresenceIndicator";
import { UnreadBadge } from "@/components/chat/UnreadBadge";
import { cn } from "@/lib/utils";

export type ConversationListItemProps = {
  id: string;
  title: string;
  preview?: string;
  timestamp?: string;
  avatarUrl?: string | null;
  initials?: string;
  unreadCount?: number;
  mentionCount?: number;
  isOnline?: boolean;
  isActive?: boolean;
  type?: ConversationAvatarType;
  statusLabel?: string;
  onClick?: () => void;
};

export function ConversationListItem({
  title,
  preview,
  timestamp,
  avatarUrl,
  initials,
  unreadCount,
  mentionCount,
  isOnline,
  isActive,
  type = "collaborator",
  statusLabel,
  onClick,
}: ConversationListItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300",
        isActive ? "bg-cyan-400/12 text-dtsc-ink" : "hover:bg-dtsc-page"
      )}
    >
      <ConversationAvatar title={title} initials={initials} avatarUrl={avatarUrl} type={type} isOnline={isOnline} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-black text-dtsc-ink">{title}</span>
          {timestamp ? <span className="shrink-0 text-[0.68rem] font-bold text-dtsc-muted">{timestamp}</span> : null}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", unreadCount || mentionCount ? "font-bold text-cyan-700 dark:text-cyan-200" : "text-dtsc-muted")}>
            {preview || statusLabel || "Aucune activite recente."}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <UnreadBadge label={mentionCount ? `@ ${mentionCount}` : undefined} tone="green" />
            <UnreadBadge count={unreadCount} />
          </span>
        </span>
        {statusLabel ? <PresenceIndicator online={isOnline} label={statusLabel} /> : null}
      </span>
    </button>
  );
}
