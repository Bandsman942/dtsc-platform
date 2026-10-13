import Link from "next/link";
import type { ReactNode } from "react";
import { translate } from "@/lib/i18n";

type DepartmentSection = { id: string; titleKey: string; content: ReactNode };

/**
 * One console heading per internal department: the nested business panels keep
 * their real metrics, filters, CRUDs and dialogs, but not a competing module header.
 */
export function InternalDepartmentWorkspace({
  locale,
  sections,
}: {
  locale: string | null | undefined;
  sections: DepartmentSection[];
}) {
  return (
    <div data-console-internal-workspace className="min-w-0 max-w-full space-y-8">
      {sections.length > 1 ? (
        <nav
          aria-label={translate(locale, "console.internalSections.navigation")}
          className="flex max-w-full flex-wrap gap-2"
        >
          {sections.map((item) => (
            <Link
              key={item.id}
              href={`#department-${item.id}`}
              className="inline-flex min-h-11 max-w-full items-center rounded-full border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-bold text-dtsc-blue transition hover:border-cyan-400 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              <span className="min-w-0 break-words">{translate(locale, `console.internalSections.${item.titleKey}`)}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      {sections.map((item) => (
        <section
          key={item.id}
          id={`department-${item.id}`}
          data-console-department-section
          aria-labelledby={`department-${item.id}-title`}
          className="min-w-0 max-w-full scroll-mt-24 space-y-4 border-t border-dtsc-border pt-5"
        >
          <h2
            id={`department-${item.id}-title`}
            className="min-w-0 break-words border-l-[3px] border-cyan-500 pl-4 text-xl font-black text-dtsc-ink"
          >
            {translate(locale, `console.internalSections.${item.titleKey}`)}
          </h2>
          <div className="min-w-0 max-w-full">{item.content}</div>
        </section>
      ))}
    </div>
  );
}
