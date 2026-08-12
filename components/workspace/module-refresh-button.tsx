"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { getExperienceCopy } from "@/lib/experience-i18n";
import { cn } from "@/lib/utils";

export function ModuleRefreshButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const router = useRouter();
  const locale = useAppLocale();
  const copy = getExperienceCopy(locale).workspace;
  const [pending, startTransition] = useTransition();
  const label = copy.refresh;
  const pendingLabel = copy.refreshing;

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label={pending ? pendingLabel : label}
      title={pending ? pendingLabel : label}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue transition-all duration-150 hover:-translate-y-0.5 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:translate-y-px active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0",
        compact && "px-2.5",
        className,
      )}
    >
      <RefreshCw className={cn("h-4 w-4 shrink-0", pending && "animate-spin")} aria-hidden="true" />
      {compact ? (
        <span className="hidden lg:inline">{pending ? pendingLabel : label}</span>
      ) : (
        <span>{pending ? pendingLabel : label}</span>
      )}
    </button>
  );
}
