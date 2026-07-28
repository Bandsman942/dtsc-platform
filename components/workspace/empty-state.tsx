import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 border-y border-dashed border-dtsc-border text-center", compact ? "py-5" : "py-8 sm:py-10", className)}>
      {Icon ? <Icon className="mx-auto h-6 w-6 text-dtsc-muted" aria-hidden="true" /> : null}
      <div className={cn("font-black text-dtsc-ink", Icon ? "mt-2" : "")}>{title}</div>
      {description ? <div className="mx-auto mt-1 max-w-xl text-sm leading-6 text-dtsc-muted">{description}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
