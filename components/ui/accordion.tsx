import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AccordionProps = {
  children: ReactNode;
  className?: string;
};

type AccordionItemProps = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function Accordion({ children, className }: AccordionProps) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function AccordionItem({ title, children, defaultOpen = false, className }: AccordionItemProps) {
  return (
    <details
      className={cn(
        "dtsc-glass-card group overflow-hidden rounded-[1.35rem] transition open:border-cyan-300/60 lg:overflow-visible",
        className
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left text-base font-black text-dtsc-ink transition hover:bg-[color-mix(in_srgb,var(--dtsc-soft)_72%,transparent)] focus:outline-none focus-visible:bg-[color-mix(in_srgb,var(--dtsc-soft)_72%,transparent)] focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dtsc-border bg-dtsc-page text-dtsc-blue shadow-inner transition group-open:rotate-180 group-open:border-cyan-300 group-open:bg-[#001736] group-open:text-cyan-300 dark:group-open:bg-cyan-400 dark:group-open:text-[#001736]">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="px-4 pb-5 text-sm leading-7 text-dtsc-muted sm:px-5">{children}</div>
    </details>
  );
}
