"use client";

import type { ReactNode } from "react";
import { professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";

export type EnterpriseIdentityLinkChoiceValue =
  | "MANUAL_ONLY"
  | "INVITE_EXISTING_ACCOUNT"
  | "INVITE_ACCOUNT_CREATION"
  | "LINK_LATER";

export function EnterpriseIdentityLinkChoice({
  value,
  onChange,
  name = "identityLinkChoice",
  disabled = false,
  status,
  helper,
}: {
  value: EnterpriseIdentityLinkChoiceValue;
  onChange: (value: EnterpriseIdentityLinkChoiceValue) => void;
  name?: string;
  disabled?: boolean;
  status?: "LINKED" | "PENDING" | "REFUSED" | "REVOKED" | null;
  helper?: ReactNode;
}) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1]) => professionalErpT(locale, key);
  const options: Array<{ value: EnterpriseIdentityLinkChoiceValue; title: string; description: string }> = [
    { value: "MANUAL_ONLY", title: t("identityChoice.manualTitle"), description: t("identityChoice.manualDescription") },
    { value: "INVITE_EXISTING_ACCOUNT", title: t("identityChoice.existingTitle"), description: t("identityChoice.existingDescription") },
    { value: "INVITE_ACCOUNT_CREATION", title: t("identityChoice.createTitle"), description: t("identityChoice.createDescription") },
    { value: "LINK_LATER", title: t("identityChoice.laterTitle"), description: t("identityChoice.laterDescription") },
  ];
  const statusLabel = status === "LINKED" ? t("identityChoice.linked") : status === "PENDING" ? t("identityChoice.pending") : status === "REFUSED" ? t("identityChoice.refused") : status === "REVOKED" ? t("identityChoice.revoked") : null;

  return (
    <fieldset className="min-w-0 max-w-full space-y-3" disabled={disabled}>
      <legend className="text-sm font-black text-dtsc-ink">{t("identityChoice.legend")}</legend>
      <p className="break-words text-sm leading-6 text-dtsc-muted">{t("identityChoice.description")}</p>
      <input type="hidden" name={name} value={value} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-w-0 max-w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                selected
                  ? "border-cyan-400 bg-cyan-400/10"
                  : "border-dtsc-border bg-dtsc-surface hover:border-cyan-300"
              }`}
            >
              <span className="block break-words text-sm font-black text-dtsc-ink">{option.title}</span>
              <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{option.description}</span>
            </button>
          );
        })}
      </div>
      {statusLabel ? <div className="rounded-xl border border-dtsc-border bg-dtsc-soft px-3 py-2 text-sm text-dtsc-ink">{statusLabel}</div> : null}
      {helper ? <div className="text-xs leading-5 text-dtsc-muted">{helper}</div> : null}
    </fieldset>
  );
}