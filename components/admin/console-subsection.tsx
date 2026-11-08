import type { ReactNode } from "react";

type JumpLink = { id: string; label: string };

/** Accessible in-page links. All targets must be mounted in the current section. */
import { ConsoleSubsectionCards } from "@/components/admin/console-subsection-cards";

/** Canonical subsection navigation: cards replace ambiguous anchor-only jumps.
 * URL query focus is bookmarkable, and browser back restores the previous depth.
 */
export function ConsoleJumpLinks({ items, label }: { items: JumpLink[]; label: string }) {
  return <ConsoleSubsectionCards items={items} label={label} />;
}

/** Inline semantic section; never overlays content or hides forms. */
export function ConsoleSubsection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} data-console-subsection aria-labelledby={`${id}-title`} className="min-w-0 max-w-full scroll-mt-24 space-y-4 border-t border-dtsc-border pt-5">
      <div className="min-w-0 border-l-[3px] border-cyan-500 pl-4">
        <h2 id={`${id}-title`} className="break-words text-lg font-black text-dtsc-ink sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 break-words text-sm text-dtsc-muted">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-full">{children}</div>
    </section>
  );
}
