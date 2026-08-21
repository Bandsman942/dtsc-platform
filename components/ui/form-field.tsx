"use client";

import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { referenceFieldHelp } from "@/lib/forms/reference-catalog";
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
  const [locale, setLocale] = useState<"fr" | "en">("fr");
  useEffect(() => {
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  const childName = isValidElement(children)
    ? (children.props as { name?: unknown }).name
    : undefined;
  const automaticHint = referenceFieldHelp(typeof childName === "string" ? childName : undefined, locale);
  const effectiveHint = hint || automaticHint;

  return (
    <label title={effectiveHint || label} className={cn("grid min-w-0 max-w-full gap-1.5", className)}>
      <span className="break-words text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
      {effectiveHint ? <span className="break-words text-sm leading-6 text-dtsc-muted">{effectiveHint}</span> : null}
      {error ? <span role="alert" className="break-words text-sm font-semibold leading-6 text-red-600">{error}</span> : null}
    </label>
  );
}
