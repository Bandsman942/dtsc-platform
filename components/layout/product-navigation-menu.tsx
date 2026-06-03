"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  Globe,
  Headphones,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { useState } from "react";

import type { HostType } from "@/lib/domains";
import { cn } from "@/lib/utils";

export type ProductDestination = {
  key: "public" | "app" | "console" | "support" | "account";
  label: string;
  href: string;
  visible: boolean;
};

const destinationIcons = {
  public: Globe,
  app: LayoutDashboard,
  console: ShieldCheck,
  support: Headphones,
  account: UserCircle,
} as const;

export function ProductNavigationMenu({
  activeDestination,
  compact,
  currentHostType,
  destinations,
}: {
  activeDestination: ProductDestination;
  compact: boolean;
  currentHostType: HostType;
  destinations: ProductDestination[];
}) {
  const [open, setOpen] = useState(false);
  const ActiveIcon = destinationIcons[activeDestination.key];

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border border-dtsc-primary/15 bg-white/90 px-3 py-3 text-left shadow-sm transition hover:border-dtsc-primary/35 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:border-dtsc-accent/50",
          compact && "px-2 py-2"
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-dtsc-primary/10 text-dtsc-primary dark:bg-dtsc-accent/15 dark:text-dtsc-accent">
          <ActiveIcon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-dtsc-muted dark:text-slate-400">
            Application
          </span>
          <span className="block truncate text-sm font-semibold text-dtsc-ink dark:text-white">
            {activeDestination.label}
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-dtsc-muted transition", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-72 min-w-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-950"
        >
          {destinations.map((destination) => {
            const Icon = destinationIcons[destination.key];
            const isActive = destination.key === currentHostType;

            return (
              <Link
                key={destination.key}
                href={destination.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-dtsc-ink transition hover:bg-dtsc-primary/10 dark:text-slate-100 dark:hover:bg-slate-800",
                  isActive && "bg-dtsc-primary/10 text-dtsc-primary dark:bg-dtsc-accent/15 dark:text-dtsc-accent"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{destination.label}</span>
                {isActive ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
