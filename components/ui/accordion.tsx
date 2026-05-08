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
  return <div className={cn("divide-y divide-dtsc-border", className)}>{children}</div>;
}

export function AccordionItem({ title, children, defaultOpen = false, className }: AccordionItemProps) {
  return (
    <details className={cn("group", className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left text-base font-black text-dtsc-ink transition hover:bg-dtsc-page focus:outline-none focus-visible:bg-dtsc-page focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dtsc-page text-dtsc-blue transition group-open:rotate-180 group-open:bg-cyan-400 group-open:text-[#001736]">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="px-5 pb-6 pr-16 text-sm leading-7 text-dtsc-muted sm:px-6">{children}</div>
    </details>
  );
}
