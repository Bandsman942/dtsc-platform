"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConversationLayout({
  sidebar,
  children,
  sidebarOpen = true,
  className,
}: {
  sidebar?: ReactNode;
  children: ReactNode;
  sidebarOpen?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative grid h-[calc(100dvh-7.25rem)] min-h-0 min-w-0 overflow-hidden bg-dtsc-surface sm:h-[calc(100dvh-8rem)] lg:h-[calc(100vh-7rem)] lg:grid-cols-[320px_minmax(0,1fr)]", className)}>
      {sidebar ? (
        <aside className={cn("min-h-0 min-w-0 border-r border-dtsc-border bg-dtsc-surface", sidebarOpen ? "block" : "hidden lg:block")}>
          {sidebar}
        </aside>
      ) : null}
      <main className="min-h-0 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
