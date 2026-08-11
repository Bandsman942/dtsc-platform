"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { toastError, toastSuccess } from "@/lib/client-toast";

export function BillingReconciliationControl({ canReconcile, locale = "fr" }: { canReconcile: boolean; locale?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    const confirmation = await confirmSensitiveAction({
      title: locale === "en" ? "Confirm billing reconciliation" : "Confirmer la réconciliation de facturation",
      description: locale === "en" ? "DTSC will review the eligible billing records and apply only the corrections allowed by the reconciliation rules." : "DTSC va examiner les éléments de facturation concernés et appliquer uniquement les corrections autorisées par les règles de réconciliation.",
      confirmLabel: locale === "en" ? "Run reconciliation" : "Lancer la réconciliation",
      tone: "warning",
      reason: {
        label: locale === "en" ? "Reason" : "Motif",
        placeholder: locale === "en" ? "Explain why this reconciliation is needed" : "Expliquez pourquoi cette réconciliation est nécessaire",
        minLength: 3,
      },
    });
    if (!confirmation.confirmed || !confirmation.reason) return;

    setBusy(true);
    const response = await fetch("/api/admin/billing/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: confirmation.reason, limit: 100 }) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      toastError(body?.reasonCode || body?.error || (locale === "en" ? "Billing reconciliation could not be completed." : "La réconciliation de facturation n’a pas pu être terminée."));
      return;
    }
    toastSuccess(locale === "en"
      ? `${body.result?.applied || 0} transaction(s) updated after reviewing ${body.result?.scanned || 0}.`
      : `${body.result?.applied || 0} transaction(s) mise(s) à jour après examen de ${body.result?.scanned || 0}.`);
    router.refresh();
  }

  return <div className="dtsc-card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-600">Réconciliation de facturation</p><p className="mt-1 text-sm text-dtsc-muted">Contrôlez et corrigez les éléments de facturation éligibles avec une trace d’audit de l’action.</p></div><Button disabled={!canReconcile || busy} onClick={run} className="rounded-xl bg-[#002b5b] text-white">{busy ? "Traitement…" : "Réconcilier"}</Button></div>;
}
