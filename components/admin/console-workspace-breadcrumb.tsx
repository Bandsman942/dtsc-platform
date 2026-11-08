import Link from "next/link";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import {
  CONSOLE_SECTION_GROUP, CONSOLE_SECTION_GROUPS, getConsoleSectionHref,
  type ConsoleSectionId,
} from "@/lib/console/console-routes";

type Section = { id: string; label: string; description: string; href: string };

export function ConsoleWorkspaceBreadcrumb({
  section, sections, locale, group, focus, params,
}: {
  section: string; sections: Section[]; locale: "fr" | "en";
  group?: string | null; focus?: string | null;
  params?: Record<string, string | undefined>;
}) {
  const selected = sections.find(item => item.id === section);
  const groupId = section === "overview" ? group : CONSOLE_SECTION_GROUP[section as ConsoleSectionId];
  const sector = CONSOLE_SECTION_GROUPS.find(item => item.id === groupId);
  const overviewHref = getConsoleSectionHref("overview");
  const groupHref = sector ? getConsoleSectionHref("overview", { group: sector.id }) : overviewHref;
  const current = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value && key !== "section" && key !== "focus") current.set(key, value);
  }
  const currentHref = getConsoleSectionHref(section as ConsoleSectionId, current);
  const backHref = focus ? currentHref : section === "overview" ? overviewHref : groupHref;
  const groupLabel = sector && (locale === "en" ? sector.labelEn : sector.labelFr);
  return (
    <nav data-console-breadcrumb aria-label={locale === "en" ? "Breadcrumb" : "Fil d’Ariane"}
      className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-surface px-3 py-2.5 text-xs font-semibold text-dtsc-muted">
      {section !== "overview" || group || focus ? (
        <Link href={backHref} data-console-depth-back aria-label={locale === "en" ? "Back one level" : "Retour au niveau précédent"}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-dtsc-border px-2 font-bold text-dtsc-blue hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <ArrowLeft size={15} aria-hidden="true"/>{locale === "en" ? "Back" : "Retour"}
        </Link>
      ) : null}
      <Link href={overviewHref} className="inline-flex min-h-9 items-center gap-1 text-dtsc-blue hover:underline focus-visible:ring-2" title={locale === "en" ? "Console home" : "Accueil Console"}>
        <Home size={15} aria-hidden="true"/>{locale === "en" ? "Administration" : "Administration DTSC"}
      </Link>
      {sector && groupLabel ? (
        <>
          <ChevronRight size={13} aria-hidden="true"/>
          {section === "overview"
            ? <span aria-current="page" className="break-words text-dtsc-ink">{groupLabel}</span>
            : <Link href={groupHref} className="break-words text-dtsc-blue hover:underline focus-visible:ring-2">{groupLabel}</Link>}
        </>
      ) : null}
      {section !== "overview" && selected ? (
        <>
          <ChevronRight size={13} aria-hidden="true"/>
          {focus
            ? <Link href={currentHref} className="break-words text-dtsc-blue hover:underline focus-visible:ring-2">{selected.label}</Link>
            : <span aria-current="page" className="break-words text-dtsc-ink">{selected.label}</span>}
        </>
      ) : null}
      {focus ? <><ChevronRight size={13} aria-hidden="true"/><span aria-current="page" className="break-words text-dtsc-ink">{focus.replaceAll("-", " ")}</span></> : null}
    </nav>
  );
}
