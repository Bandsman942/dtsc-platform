"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  controlledReferenceChoices,
  type ControlledReferenceKind,
} from "@/lib/forms/reference-catalog";

type ReferenceSelectProps = {
  kind: ControlledReferenceKind;
  name?: string;
  value?: string | readonly string[] | number;
  defaultValue?: string | readonly string[] | number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export function ReferenceSelect({
  kind,
  name,
  value,
  defaultValue,
  required,
  disabled,
  className,
  title,
  ariaLabel,
  onChange,
}: ReferenceSelectProps) {
  const [locale, setLocale] = React.useState<"fr" | "en">("fr");

  React.useEffect(() => {
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  const choices = controlledReferenceChoices(kind, locale);
  const controlledValue = typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  const uncontrolledDefault = typeof defaultValue === "string" || typeof defaultValue === "number" ? String(defaultValue) : undefined;
  const currentValue = controlledValue ?? uncontrolledDefault ?? "";
  const historicalValue = currentValue && !choices.some((item) => item.id === currentValue) ? currentValue : "";
  const historicalLabel = locale === "en" ? "Existing value" : "Valeur existante";

  return (
    <select
      data-slot="input"
      data-dtsc-controlled-reference={kind}
      name={name}
      value={controlledValue}
      defaultValue={controlledValue === undefined ? uncontrolledDefault : undefined}
      required={required}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onChange={onChange ? (event) => onChange(event as unknown as React.ChangeEvent<HTMLInputElement>) : undefined}
      className={cn(
        "border-input dark:bg-input/30 flex h-11 w-full min-w-0 max-w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
    >
      <option value="">—</option>
      {historicalValue ? <option value={historicalValue}>{historicalValue} · {historicalLabel}</option> : null}
      {choices.map((item) => (
        <option key={item.id} value={item.id}>{item.label}</option>
      ))}
    </select>
  );
}
