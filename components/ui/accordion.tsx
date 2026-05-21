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
        "group overflow-hidden rounded-[1.35rem] border border-white/60 bg-white/85 shadow-[0_14px_40px_rgba(0,43,91,0.08)] backdrop-blur-xl transition open:border-cyan-300/60 open:bg-white",
        className
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left text-base font-black text-dtsc-ink transition hover:bg-cyan-50/70 focus:outline-none focus-visible:bg-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dtsc-page text-dtsc-blue shadow-inner transition group-open:rotate-180 group-open:bg-cyan-400 group-open:text-[#001736]">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="px-4 pb-5 text-sm leading-7 text-dtsc-muted sm:px-5">{children}</div>
    </details>
  );
}
