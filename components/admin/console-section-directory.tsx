import Link from "next/link";
import {
  BarChart3, Building2, CreditCard, Users, ShieldCheck, Sparkles,
  Settings2, FileText, MessageCircle, BookOpen, Wrench, Clock3,
  Briefcase, ExternalLink, ChevronRight, FolderKanban, LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import {
  CONSOLE_SECTION_GROUP, CONSOLE_SECTION_GROUPS,
  getConsoleSectionHref, type ConsoleSectionId,
} from "@/lib/console/console-routes";

export type ConsoleDirectoryItem = {
  id: string; label: string; description: string; href: string;
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  governance: BarChart3, customers: Building2, identity: ShieldCheck,
  engagement: Sparkles, platform: Settings2, internal: Briefcase,
};
const SECTION_ICONS: Partial<Record<ConsoleSectionId, LucideIcon>> = {
  overview: LayoutDashboard, "module-maturity": BarChart3, access: ShieldCheck,
  "platform-settings": Settings2, "ai-control-center": Sparkles,
  promotions: Sparkles, content: FileText, users: Users,
  organizations: Building2, subscriptions: CreditCard, support: MessageCircle,
  visits: BarChart3, "security-audit": ShieldCheck, "hr-cfo": CreditCard,
  sco: Wrench, coo: Briefcase, ceo: LayoutDashboard, mpo: FolderKanban,
  cto: Wrench, legal: BookOpen,
};

export function ConsoleSectionDirectory({
  sections, locale, selectedGroup,
}: {
  sections: ConsoleDirectoryItem[];
  locale: "fr" | "en";
  selectedGroup?: string | null;
}) {
  const grouped = CONSOLE_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: sections.filter((section) => CONSOLE_SECTION_GROUP[section.id as ConsoleSectionId] === group.id),
  })).filter(group => group.sections.length > 0);
  const selected = grouped.find(group => group.id === selectedGroup);
  return (
    <section data-console-section-directory aria-label={locale === "en" ? "Console section directory" : "Répertoire des sections de la console"}
      className="min-w-0 max-w-full space-y-4">
      <header className="min-w-0 border-l-[3px] border-cyan-500 pl-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-600">
          {locale === "en" ? "Workspaces" : "Espaces de travail"}
        </p>
        <h2 className="mt-1 text-lg font-black text-dtsc-ink sm:text-xl">
          {selected ? locale === "en" ? selected.labelEn : selected.labelFr
            : locale === "en" ? "Explore DTSC Administration" : "Explorer l'Administration DTSC"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-dtsc-muted">
          {selected ? locale === "en" ? selected.descriptionEn : selected.descriptionFr
            : locale === "en" ? "Select a domain to open the sections authorized for your role."
              : "Choisissez un domaine pour ouvrir uniquement les sections autorisées à votre rôle."}
        </p>
      </header>
      <div data-console-card-grid className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {selected
          ? selected.sections.map((section) => {
              const Icon = SECTION_ICONS[section.id as ConsoleSectionId] || ExternalLink;
              return <Link key={section.id} href={section.href} data-console-section-card={section.id}
                className="group flex min-h-32 min-w-0 flex-col justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><Icon size={19} aria-hidden="true"/></span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-dtsc-muted transition group-hover:translate-x-1"/>
                </div>
                <div className="min-w-0">
                  <strong className="block break-words text-sm font-black text-dtsc-ink">{section.label}</strong>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-dtsc-muted">{section.description}</p>
                </div>
              </Link>;
            })
          : grouped.map((group) => {
              const Icon = GROUP_ICONS[group.id] || Clock3;
              return <Link key={group.id} href={getConsoleSectionHref("overview", { group: group.id })}
                data-console-domain-card={group.id}
                className="group flex min-h-36 min-w-0 flex-col justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><Icon size={20} aria-hidden="true"/></span>
                  <span className="inline-flex shrink-0 rounded-full bg-dtsc-page px-2 py-1 text-[11px] font-bold text-dtsc-muted">{group.sections.length} {locale === "en" ? "sections" : "sections"}</span>
                </div>
                <div className="min-w-0">
                  <strong className="block break-words text-sm font-black text-dtsc-ink">{locale === "en" ? group.labelEn : group.labelFr}</strong>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-dtsc-muted">{locale === "en" ? group.descriptionEn : group.descriptionFr}</p>
                </div>
              </Link>;
            })}
      </div>
    </section>
  );
}
