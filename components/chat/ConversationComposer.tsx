"use client";

import { Send } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ConversationComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Ecrire un message...",
  disabled = false,
  sending = false,
  helper,
  before,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  helper?: ReactNode;
  before?: ReactNode;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={cn("shrink-0 border-t border-dtsc-border bg-dtsc-surface px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4", className)}>
      {before}
      {helper ? <div className="mb-2 hidden text-center text-[0.72rem] font-semibold text-dtsc-muted sm:block">{helper}</div> : null}
      <div className="flex min-w-0 items-center gap-2 rounded-[1.35rem] border border-dtsc-border bg-dtsc-page p-1.5 shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 min-w-0 border-0 bg-transparent text-dtsc-ink focus-visible:ring-0"
          disabled={disabled}
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full bg-[#002b5b] text-white hover:bg-[#001736]" disabled={disabled || sending || !value.trim()} aria-label="Envoyer">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
