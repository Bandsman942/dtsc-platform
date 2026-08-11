"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function ModuleRefreshButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const router = useRouter();
  const locale = useAppLocale();
  const [pending, startTransition] = useTransition();
  const label = locale === "en" ? "Refresh" : "Actualiser";
  const pendingLabel = locale === "en" ? "Refreshing…" : "Actualisation…";

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-blue transition hover:bg-dtsc-soft disabled:cursor-wait disabled:opacity-60",
        compact && "min-w-11 px-2.5",
        className,
      )}
    >
      <RefreshCw className={cn("h-4 w-4 shrink-0", pending && "animate-spin")} aria-hidden="true" />
      {compact ? (
        <span className="hidden min-[390px]:inline">{pending ? pendingLabel : label}</span>
      ) : (
        <span>{pending ? pendingLabel : label}</span>
      )}
      {compact ? <span className="sr-only min-[390px]:hidden">{pending ? pendingLabel : label}</span> : null}
    </button>
  );
}
