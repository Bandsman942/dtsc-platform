"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgePercent,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Code2,
  CreditCard,
  Crown,
  FileText,
  FolderKanban,
  HelpCircle,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  PlusCircle,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";

export type ProductSectionIcon =
  | "analytics"
  | "billing"
  | "building"
  | "content"
  | "cto"
  | "executive"
  | "help"
  | "legal"
  | "operations"
  | "projects"
  | "promotions"
  | "rbac"
  | "settings"
  | "support"
  | "tasks"
  | "users"
  | "create";

export type ProductSectionNavigationItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  groupId: string;
  icon?: ProductSectionIcon;
};

export type ProductSectionNavigationGroup = {
  id: string;
  label: string;
  description?: string;
};

const ICONS: Record<ProductSectionIcon, LucideIcon> = {
  analytics: BarChart3,
  billing: CreditCard,
  building: Building2,
  content: FileText,
  cto: Code2,
  executive: Crown,
  help: HelpCircle,
  legal: Scale,
  operations: BriefcaseBusiness,
  projects: FolderKanban,
  promotions: BadgePercent,
  rbac: ShieldCheck,
  settings: Settings,
  support: MessageSquare,
  tasks: ListChecks,
  users: Users,
  create: PlusCircle,
};

export function ProductSectionNavigation({
  productLabel,
  title,
  groups,
  sections,
  activeSection,
  mobileButtonLabel,
  className,
}: {
  productLabel: string;
  title: string;
  groups: ProductSectionNavigationGroup[];
  sections: ProductSectionNavigationItem[];
  activeSection: string;
  mobileButtonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const visibleGroups = groups
    .map((group) => ({ ...group, sections: sections.filter((section) => section.groupId === group.id) }))
    .filter((group) => group.sections.length > 0);

  useFloatingAction({
    id: `product-navigation-${productLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: mobileButtonLabel || `Ouvrir les sections ${productLabel}`,
    icon: MoreHorizontal,
    order: 20,
    mobileOnly: true,
    onSelect: () => setOpen(true),
  });

  return (
    <div className={cn("dtsc-product-section-navigation min-w-0", className)}>
      <nav className="hidden min-w-0 space-y-5 lg:block" aria-label={`${productLabel} — ${title}`}>
        {visibleGroups.map((group) => (
          <section key={group.id} className="min-w-0" aria-labelledby={`product-navigation-${group.id}`}>
            <div className="mb-2 flex min-w-0 items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id={`product-navigation-${group.id}`} className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">
                  {group.label}
                </h2>
                {group.description ? <p className="mt-1 text-xs font-semibold text-dtsc-muted">{group.description}</p> : null}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
              {group.sections.map((section) => (
                <ProductSectionLink key={section.id} section={section} active={activeSection === section.id} />
              ))}
            </div>
          </section>
        ))}
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 bg-[#001736]/55 p-3 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="dtsc-glass-card ml-auto flex h-[min(88dvh,46rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem]"
            role="dialog"
            aria-modal="true"
            aria-label={`${productLabel} — ${title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_72%,transparent)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-dtsc-blue">{productLabel}</p>
                <h2 className="truncate text-lg font-black text-dtsc-ink">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-dtsc-border bg-dtsc-page text-dtsc-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label={`Fermer les sections ${productLabel}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {visibleGroups.map((group) => (
                <section key={group.id} className="space-y-2">
                  <div className="px-1">
                    <h3 className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-600">{group.label}</h3>
                    {group.description ? <p className="mt-1 text-xs font-semibold leading-5 text-dtsc-muted">{group.description}</p> : null}
                  </div>
                  {group.sections.map((section) => (
                    <ProductSectionLink key={section.id} section={section} active={activeSection === section.id} mobile onSelect={() => setOpen(false)} />
                  ))}
                </section>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductSectionLink({
  section,
  active,
  mobile = false,
  onSelect,
}: {
  section: ProductSectionNavigationItem;
  active: boolean;
  mobile?: boolean;
  onSelect?: () => void;
}) {
  const Icon = ICONS[section.icon || "analytics"];
  return (
    <Link
      href={section.href}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-2xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
        mobile ? "min-h-[5.25rem]" : "min-h-[6.5rem]",
        active
          ? "border-cyan-300 bg-[#002b5b] text-white shadow-[0_14px_34px_rgba(0,43,91,0.16)]"
          : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-dtsc-soft"
      )}
    >
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", active ? "bg-white/10 text-cyan-200" : "bg-[#001736] text-cyan-300")}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-black leading-5">{section.label}</span>
        <span className={cn("mt-1 line-clamp-2 block text-xs font-semibold leading-5", active ? "text-slate-200" : "text-dtsc-muted")}>{section.description}</span>
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0 transition group-hover:translate-x-0.5", active ? "text-cyan-200" : "text-dtsc-muted")} aria-hidden="true" />
    </Link>
  );
}
