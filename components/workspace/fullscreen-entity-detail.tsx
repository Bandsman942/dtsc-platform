"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { cn } from "@/lib/utils";

export function FullscreenEntityDetail({
  open,
  onClose,
  title,
  description,
  children,
  actions = [],
  actionLabel = "Actions",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: BusinessContextAction[];
  actionLabel?: string;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      presentation="editor"
      className={cn(
        "h-[100dvh] w-screen max-w-none rounded-none sm:h-[96dvh] sm:w-auto sm:max-w-6xl sm:rounded-3xl",
        className,
      )}
    >
      <div
        data-dtsc-fullscreen-detail
        className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5"
      >
        {actions.length ? (
          <div className="sticky top-0 z-[3] flex min-w-0 justify-end border-b border-dtsc-border bg-dtsc-surface/95 pb-2 backdrop-blur">
            <ContextActions label={actionLabel} actions={actions} />
          </div>
        ) : null}
        {children}
      </div>
    </Dialog>
  );
}
