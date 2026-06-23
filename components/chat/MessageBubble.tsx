"use client";

import type { ReactNode } from "react";
import { ConversationAvatar } from "@/components/chat/ConversationAvatar";
import { cn } from "@/lib/utils";

export function MessageBubble({
  role,
  author,
  initials,
  meta,
  children,
  actions,
}: {
  role: "user" | "assistant" | "system" | "collaborator";
  author: string;
  initials?: string;
  meta?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const own = role === "user";
  const assistant = role === "assistant" || role === "system";

  return (
    <div className={cn("flex min-w-0 gap-2.5", own ? "justify-end" : "justify-start")}>
      {!own && (
        <ConversationAvatar title={author} initials={initials} type={assistant ? "assistant" : "collaborator"} className="mt-1 h-9 w-9 sm:h-10 sm:w-10" />
      )}
      <div className={cn("group min-w-0 max-w-[88%] rounded-[1.25rem] px-3 py-2.5 text-sm leading-6 shadow-[0_4px_20px_rgba(0,43,91,0.05)] sm:max-w-[78%] sm:px-4", own ? "rounded-br-md bg-[#002b5b] text-white" : assistant ? "rounded-bl-md bg-dtsc-surface text-dtsc-ink" : "rounded-bl-md bg-dtsc-page text-dtsc-ink")}>
        <p className={cn("mb-1 text-xs font-black", own ? "text-cyan-100" : "text-cyan-700 dark:text-cyan-200")}>{author}</p>
        <div className="min-w-0 break-words">{children}</div>
        {meta ? <p className={cn("mt-2 text-[0.68rem] font-semibold", own ? "text-white/70" : "text-dtsc-muted")}>{meta}</p> : null}
        {actions ? <div className={cn("mt-3 border-t pt-2", own ? "border-white/15" : "border-dtsc-border")}>{actions}</div> : null}
      </div>
      {own && (
        <ConversationAvatar title={author} initials={initials || "VO"} type="collaborator" className="mt-1 h-9 w-9 sm:h-10 sm:w-10" />
      )}
    </div>
  );
}
