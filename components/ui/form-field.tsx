"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, hint, error, required = false, children, className }: FormFieldProps) {
  return (
    <label title={hint || label} className={cn("grid min-w-0 max-w-full gap-1.5", className)}>
      <span className="break-words text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="break-words text-sm leading-6 text-dtsc-muted">{hint}</span> : null}
      {error ? <span role="alert" className="break-words text-sm font-semibold leading-6 text-red-600">{error}</span> : null}
    </label>
  );
}
