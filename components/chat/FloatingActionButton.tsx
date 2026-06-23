"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FloatingActionButton({
  label,
  onClick,
  icon,
  className,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#002b5b] text-white shadow-[0_18px_45px_rgba(0,43,91,0.28)] transition hover:-translate-y-0.5 hover:bg-[#001736] focus:outline-none focus:ring-2 focus:ring-cyan-300 lg:absolute lg:bottom-5 lg:right-5", className)}
    >
      {icon || <Plus className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
