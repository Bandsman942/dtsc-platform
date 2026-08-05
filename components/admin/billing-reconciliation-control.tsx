"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BillingReconciliationControl({ canReconcile, locale = "fr" }: { canReconcile: boolean; locale?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    const reason = window.prompt(locale === "en" ? "Reason for billing reconciliation" : "Motif de la réconciliation de facturation");
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(locale === "en" ? "Run a bounded, idempotent reconciliation now?" : "Lancer maintenant une réconciliation bornée et idempotente ?")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/billing/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, limit: 100 }) });
    const body = await response.json().catch(() => null); setBusy(false);
    setMessage(response.ok ? `${body.result?.applied || 0} transaction(s) appliquée(s), ${body.result?.scanned || 0} analysée(s).` : body?.reasonCode || body?.error || "Erreur");
    if (response.ok) router.refresh();
  }
  return <div className="dtsc-card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-600">Réconciliation explicite</p><p className="mt-1 text-sm text-dtsc-muted">Aucune correction financière n’est exécutée pendant le rendu. Cette action est bornée, idempotente et auditée.</p>{message ? <p role="status" className="mt-2 text-sm font-bold text-dtsc-blue">{message}</p> : null}</div><Button disabled={!canReconcile || busy} onClick={run} className="rounded-xl bg-[#002b5b] text-white">{busy ? "Traitement…" : "Réconcilier"}</Button></div>;
}
