"use client";
import { useAppLocale } from "@/components/i18n/locale-provider";
import type { HirmsEnvironment } from "@/lib/enterprise/health-insurance-connectors/environments";

export function HirmsEnvironmentSwitch({ value, onChange, disabled = false }: {
  value: HirmsEnvironment; onChange: (next: HirmsEnvironment) => void; disabled?: boolean;
}) {
  const en = useAppLocale() === "en";
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-bold text-dtsc-muted">{en ? "HIRMS destination" : "Destination HIRMS"}</legend>
      <div className="inline-flex max-w-full gap-1 rounded-xl border border-dtsc-border bg-dtsc-surface p-1" role="group" aria-label={en ? "Select HIRMS environment" : "Choisir l'environnement HIRMS"}>
        {(["UAT", "PRODUCTION"] as const).map((environment) => (
          <button
            key={environment} type="button" disabled={disabled}
            aria-pressed={value === environment}
            onClick={() => onChange(environment)}
            className={`min-h-11 rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 sm:text-sm ${value === environment
              ? environment === "PRODUCTION" ? "bg-amber-600 text-white" : "bg-cyan-600 text-white"
              : "text-dtsc-ink hover:bg-dtsc-page"}`}
          >
            {environment === "UAT" ? (en ? "UAT · Test" : "UAT · Test") : (en ? "PRODUCTION · Live" : "PRODUCTION · Réel")}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
