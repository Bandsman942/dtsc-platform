"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, hint, children, className }: FormFieldProps) {
  return (
    <label title={hint || label} className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-dtsc-muted">{hint}</span>}
    </label>
  );
}
