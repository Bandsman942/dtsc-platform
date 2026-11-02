"use client";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { requiresPaymentStepUp } from "@/lib/auth/critical-actions";

export function FinanceCriticalStepUpFields({ action, locale = "fr" }: { action: string; locale?: string | null }) {
  if (!requiresPaymentStepUp(action)) return null;
  const en = locale === "en";
  return <section className="min-w-0 space-y-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
    <p className="text-sm font-semibold text-dtsc-ink">{en
      ? "Confirm your identity before this financial decision"
      : "Confirmez votre identité avant cette opération financière"}</p>
    <label className="grid gap-1.5 text-sm font-semibold text-dtsc-ink">
      {en ? "Current DTSC password" : "Mot de passe DTSC actuel"}
      <PasswordInput name="financialStepUpPassword" required autoComplete="current-password" />
    </label>
    <label className="grid gap-1.5 text-sm font-semibold text-dtsc-ink">
      {en ? "TOTP or recovery code, if enabled" : "Code TOTP ou code de récupération, si activé"}
      <Input name="financialStepUpCode" autoComplete="one-time-code" maxLength={30} />
    </label>
    <p className="text-xs leading-5 text-dtsc-muted">{en
      ? "The step-up is valid for five minutes and never overrides your permissions or approval separation."
      : "La vérification est valable cinq minutes et ne contourne jamais vos permissions ni la séparation des validations."}</p>
  </section>;
}

export async function performFinanceCriticalStepUp(form: FormData, action: string): Promise<void> {
  if (!requiresPaymentStepUp(action)) return;
  const password = String(form.get("financialStepUpPassword") || "");
  const code = String(form.get("financialStepUpCode") || "").trim();
  if (!password) throw new Error("Mot de passe requis avant cette opération.");
  const response = await fetch("/api/auth/step-up", {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password, ...(code ? { code } : {}) }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Vérification de sécurité refusée.");
}
