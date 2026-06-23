"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ConversationAvatar, type ConversationAvatarType } from "@/components/chat/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConversationHeader({
  title,
  subtitle,
  avatarUrl,
  initials,
  type = "collaborator",
  isOnline,
  onBack,
  onTitleClick,
  actions,
  backButtonClassName = "lg:hidden",
  className,
}: {
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials?: string;
  type?: ConversationAvatarType;
  isOnline?: boolean;
  onBack?: () => void;
  onTitleClick?: () => void;
  actions?: ReactNode;
  backButtonClassName?: string;
  className?: string;
}) {
  const content = (
    <span className="flex min-w-0 items-center gap-3">
      <ConversationAvatar title={title} initials={initials} avatarUrl={avatarUrl} type={type} isOnline={isOnline} className="h-10 w-10 sm:h-11 sm:w-11" />
      <span className="min-w-0">
        <span className="block truncate text-base font-black text-dtsc-ink sm:text-lg">{title}</span>
        {subtitle ? <span className="block truncate text-xs font-bold text-dtsc-muted">{subtitle}</span> : null}
      </span>
    </span>
  );

  return (
    <header className={cn("sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-dtsc-border bg-dtsc-surface/95 px-3 backdrop-blur-xl sm:px-4", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack ? (
          <Button type="button" variant="outline" size="icon" onClick={onBack} className={cn("h-10 w-10 shrink-0 rounded-full border-dtsc-border bg-dtsc-surface text-dtsc-blue", backButtonClassName)} aria-label="Retour a la liste">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        {onTitleClick ? (
          <button type="button" onClick={onTitleClick} className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-cyan-300">
            {content}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{content}</div>
        )}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
