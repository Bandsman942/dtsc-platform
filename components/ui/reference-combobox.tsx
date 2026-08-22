"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReferenceComboboxOption = { id: string; label: string };

type ReferenceComboboxProps = {
  name: string;
  options: ReferenceComboboxOption[];
  defaultValue?: string | null;
  required?: boolean;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
  customPlaceholder?: string;
  emptyLabel?: string;
  onValueChange?: (value: string) => void;
};

const CUSTOM_VALUE = "__DTSC_CUSTOM_REFERENCE__";

export function ReferenceCombobox({
  name,
  options,
  defaultValue,
  required = false,
  disabled = false,
  allowCustom = true,
  className,
  customPlaceholder,
  emptyLabel,
  onValueChange,
}: ReferenceComboboxProps) {
  const [locale, setLocale] = React.useState<"fr" | "en">("fr");
  const normalizedDefault = String(defaultValue || "").trim();
  const defaultIsKnown = options.some((option) => option.id === normalizedDefault);
  const [selected, setSelected] = React.useState(normalizedDefault && !defaultIsKnown ? CUSTOM_VALUE : normalizedDefault);
  const [customValue, setCustomValue] = React.useState(normalizedDefault && !defaultIsKnown ? normalizedDefault : "");

  React.useEffect(() => {
    setLocale(document.documentElement.lang === "en" ? "en" : "fr");
  }, []);

  const value = selected === CUSTOM_VALUE ? customValue.trim() : selected;
  const addCustomLabel = locale === "en" ? "Add another value…" : "Ajouter une autre valeur…";
  const resolvedEmptyLabel = emptyLabel || (locale === "en" ? "Select…" : "Sélectionner…");
  const resolvedCustomPlaceholder = customPlaceholder || (locale === "en" ? "Enter the new value" : "Saisir la nouvelle valeur");

  return (
    <div className="grid min-w-0 gap-2" data-dtsc-reference-combobox={name}>
      <input type="hidden" name={name} value={value} />
      <select
        value={selected}
        required={required && !allowCustom}
        disabled={disabled}
        onChange={(event) => {
          const nextSelected = event.target.value;
          setSelected(nextSelected);
          if (nextSelected !== CUSTOM_VALUE) {
            setCustomValue("");
            onValueChange?.(nextSelected);
          } else {
            onValueChange?.("");
          }
        }}
        className={cn(
          "h-11 w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60 md:text-sm",
          className,
        )}
      >
        <option value="">{resolvedEmptyLabel}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        {allowCustom ? <option value={CUSTOM_VALUE}>{addCustomLabel}</option> : null}
      </select>
      {selected === CUSTOM_VALUE ? (
        <Input
          value={customValue}
          onChange={(event) => {
            const nextCustomValue = event.target.value;
            setCustomValue(nextCustomValue);
            onValueChange?.(nextCustomValue.trim());
          }}
          placeholder={resolvedCustomPlaceholder}
          required={required}
          disabled={disabled}
          maxLength={160}
          aria-label={resolvedCustomPlaceholder}
        />
      ) : null}
    </div>
  );
}
