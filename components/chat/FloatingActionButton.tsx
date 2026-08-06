"use client";

import { Plus, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";
import { cn } from "@/lib/utils";

export function FloatingActionButton({
  label,
  onClick,
  icon,
  hubIcon = Plus,
  className,
  actionId,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  hubIcon?: LucideIcon;
  className?: string;
  actionId?: string;
}) {
  const generatedId = useId();
  const embedded = className?.split(/\s+/).includes("static") ?? false;

  useFloatingAction(!embedded ? {
    id: actionId || `module-primary-${generatedId.replaceAll(":", "")}`,
    label,
    icon: hubIcon,
    order: 40,
    mobileOnly: true,
    onSelect: onClick,
  } : null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-floating-action-level="module-primary"
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#002b5b] text-white shadow-[0_18px_45px_rgba(0,43,91,0.28)] transition hover:-translate-y-0.5 hover:bg-[#001736] focus:outline-none focus:ring-2 focus:ring-cyan-300",
        embedded ? "static" : "hidden lg:absolute lg:bottom-5 lg:right-5 lg:inline-flex",
        className,
      )}
    >
      {icon || <Plus className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
