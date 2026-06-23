"use client";

import { MessageSquare } from "lucide-react";

export function ConversationEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-600">
        <MessageSquare className="h-5 w-5" />
      </span>
      <p className="mt-4 text-xl font-black text-dtsc-ink sm:text-2xl">{title}</p>
      <p className="mt-2 text-sm leading-6 text-dtsc-muted">{description}</p>
    </div>
  );
}
