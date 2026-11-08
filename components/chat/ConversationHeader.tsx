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
  backLabel = "Retour à la liste",
  compact = false,
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
  backLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const content = (
    <span className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-3")}>
      <ConversationAvatar title={title} initials={initials} avatarUrl={avatarUrl} type={type} isOnline={isOnline} className={compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-10 w-10 sm:h-11 sm:w-11"} />
      <span className="min-w-0">
        <span className="block truncate text-base font-extrabold tracking-tight text-dtsc-ink sm:text-lg">{title}</span>
        {subtitle ? <span className="block truncate text-xs font-bold text-dtsc-muted">{subtitle}</span> : null}
      </span>
    </span>
  );

  return (
    <header className={cn("sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-dtsc-border bg-dtsc-surface backdrop-blur-xl", compact ? "h-14 gap-1.5 px-2 sm:h-16 sm:gap-3 sm:px-4" : "h-16 gap-3 px-3 sm:px-4", className)}>
      <div className={cn("flex min-w-0 flex-1 items-center", compact ? "gap-1" : "gap-2")}>
        {onBack ? (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} className={cn("h-9 w-9 shrink-0 rounded-full text-dtsc-blue hover:bg-dtsc-soft sm:h-10 sm:w-10", backButtonClassName)} aria-label={backLabel}>
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
      {actions ? <div className={cn("flex shrink-0 items-center", compact ? "gap-1 sm:gap-2" : "gap-2")}>{actions}</div> : null}
    </header>
  );
}
