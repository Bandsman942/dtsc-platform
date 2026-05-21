"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Code2,
  Crown,
  FileText,
  FolderKanban,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  PackageCheck,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminFloatingNavSection = {
  id: string;
  label: string;
  description: string;
  href: string;
};

const iconMap = {
  overview: BarChart3,
  access: ShieldCheck,
  settings: Settings,
  publications: FileText,
  users: Users,
  hrCfo: BriefcaseBusiness,
  sco: PackageCheck,
  coo: BarChart3,
  ceo: Crown,
  mpo: FolderKanban,
  cto: Code2,
  la: Scale,
  visits: BarChart3,
  activity: MessageSquare,
  audits: Megaphone,
} as const;

export function AdminFloatingNav({
  sections,
  activeSection,
}: {
  sections: AdminFloatingNavSection[];
  activeSection: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/50 bg-[#001736]/95 text-white shadow-[0_18px_45px_rgba(0,23,54,0.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#002b5b] lg:hidden"
        aria-label="Ouvrir les sections Administration"
      >
        <MoreHorizontal className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-[#001736]/55 p-3 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="dtsc-glass-card ml-auto flex h-[min(88dvh,42rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_72%,transparent)] px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">Administration</p>
                <h2 className="text-lg font-black text-dtsc-ink">Sections autorisées</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-blue"
                aria-label="Fermer le menu Administration"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {sections.map((section) => {
                const Icon = iconMap[section.id as keyof typeof iconMap] || BarChart3;
                const active = activeSection === section.id;
                return (
                  <Link
                    key={section.id}
                    href={section.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5",
                      active
                        ? "dtsc-glass-list-item-active"
                        : "dtsc-glass-list-item text-dtsc-muted"
                    )}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#001736] text-cyan-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-sm font-black", active ? "text-white" : "text-dtsc-ink")}>{section.label}</span>
                      <span className={cn("line-clamp-1 text-xs font-semibold", active ? "text-slate-200" : "text-dtsc-muted")}>{section.description}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
