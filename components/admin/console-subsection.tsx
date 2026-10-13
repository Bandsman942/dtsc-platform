import Link from "next/link";
import type { ReactNode } from "react";

type JumpLink = { id: string; label: string };

/** Accessible in-page links. All targets must be mounted in the current section. */
export function ConsoleJumpLinks({ items }: { items: JumpLink[] }) {
  return (
    <nav data-console-jump-links aria-label="Navigation dans la section" className="flex min-w-0 flex-wrap gap-2 py-1">
      {items.map((item) => (
        <Link key={item.id} href={`#${item.id}`} className="inline-flex min-h-11 max-w-full items-center rounded-full border border-dtsc-border bg-dtsc-surface px-4 py-2 text-xs font-bold text-dtsc-blue transition hover:border-cyan-400 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
          <span className="min-w-0 break-words">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
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
