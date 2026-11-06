import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, LifeBuoy, ShieldCheck } from "lucide-react";
import { AdminFloatingNav } from "@/components/admin/admin-floating-nav";
import { ModuleContent, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getConsoleSectionHref } from "@/lib/console/console-routes";
import { buildUrlForHostType, getSupportUrl } from "@/lib/domains";
import { translate } from "@/lib/i18n";

type ConsoleWorkspaceSection = {
  id: string;
  label: string;
  description: string;
  href: string;
};

export function ConsoleWorkspaceShell({
  activeSection,
  locale,
  sections,
  children,
}: {
  activeSection: string;
  locale: "fr" | "en";
  sections: ConsoleWorkspaceSection[];
  children: ReactNode;
}) {
  const canViewAccess = sections.some((section) => section.id === "access");
  const compactInternal = ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto"].includes(activeSection);
  const footerLinkClass =
    "inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold text-dtsc-blue transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60";

  return (
    <ModuleWorkspace className={compactInternal ? "space-y-3" : "space-y-5"}>
      <AdminFloatingNav activeSection={activeSection} locale={locale} sections={sections} />
      <ModuleContent className={compactInternal ? "min-w-0 space-y-3" : "min-w-0 space-y-5"}>{children}</ModuleContent>
      <footer
        aria-label={translate(locale, "console.workspace.resources")}
        className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-dtsc-border pt-4"
      >
        <Link href={buildUrlForHostType("app", "/help/standard")} className={footerLinkClass}>
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          {translate(locale, "console.workspace.guide")}
        </Link>
        <Link href={getSupportUrl()} className={footerLinkClass}>
          <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden="true" />
          {translate(locale, "console.workspace.support")}
        </Link>
        {canViewAccess ? (
          <Link href={getConsoleSectionHref("access")} className={footerLinkClass}>
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {translate(locale, "console.workspace.access")}
          </Link>
        ) : null}
      </footer>
    </ModuleWorkspace>
  );
}
