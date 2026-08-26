"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactNode } from "react";
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

type DescribedControlProps = {
  name?: unknown;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export function FormField({ label, hint, error, required = false, children, className }: FormFieldProps) {
  const [locale, setLocale] = useState<"fr" | "en">("fr");
  const hintId = useId();
  const errorId = useId();
  useEffect(() => {
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  const childElement = isValidElement<DescribedControlProps>(children) ? children : null;
  const childName = childElement?.props.name;
  const automaticHint = referenceFieldHelp(typeof childName === "string" ? childName : undefined, locale);
  const effectiveHint = hint || automaticHint;
  const describedBy = [childElement?.props["aria-describedby"], effectiveHint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const renderedChildren = childElement
    ? cloneElement(childElement, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : childElement.props["aria-invalid"],
      })
    : children;

  return (
    <label title={effectiveHint || label} className={cn("grid min-w-0 max-w-full gap-1.5", className)}>
      <span className="break-words text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-red-500">*</span> : null}
      </span>
      {renderedChildren}
      {effectiveHint ? <span id={hintId} className="break-words text-sm leading-6 text-dtsc-muted">{effectiveHint}</span> : null}
      {error ? <span id={errorId} role="alert" className="break-words text-sm font-semibold leading-6 text-red-600">{error}</span> : null}
    </label>
  );
}
