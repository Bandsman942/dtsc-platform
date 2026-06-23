"use client";

import { Bot, Building2, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversationAvatarType = "collaborator" | "group" | "assistant" | "organization" | "system";

export function ConversationAvatar({
  title,
  initials,
  avatarUrl,
  type = "collaborator",
  isOnline = false,
  className,
}: {
  title: string;
  initials?: string;
  avatarUrl?: string | null;
  type?: ConversationAvatarType;
  isOnline?: boolean;
  className?: string;
}) {
  const label = initials || buildInitials(title);
  const Icon = type === "assistant" || type === "system" ? Bot : type === "group" ? Users : type === "organization" ? Building2 : UserRound;

  return (
    <span className={cn("relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#002b5b] text-sm font-black text-white shadow-[0_8px_24px_rgba(0,43,91,0.18)] sm:h-11 sm:w-11", className)}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={title} className="h-full w-full object-cover" />
      ) : type === "collaborator" ? (
        <span>{label}</span>
      ) : (
        <Icon className="h-5 w-5" aria-hidden="true" />
      )}
      {isOnline && (
        <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-dtsc-surface bg-emerald-500" aria-label="En ligne" />
      )}
    </span>
  );
}

function buildInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "DT";
}
