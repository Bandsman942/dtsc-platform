"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess, toastInfo } from "@/lib/client-toast";

export function SubscriptionRenewalActions({ scope, expiresAt, status, paidPlan, canManage, paymentAvailable, nowMs, openRequestId }: {
  scope: "PERSONAL" | "ORGANIZATION";
  expiresAt: string | null;
  status: string;
  paidPlan: string | null;
  canManage: boolean;
  paymentAvailable: boolean;
  nowMs: number;
  openRequestId?: string | null;
}) {
  const [requestId, setRequestId] = useState(openRequestId || "");
  const [pending, setPending] = useState(false);
  const until = expiresAt ? new Date(expiresAt).getTime() - nowMs : null;
  const expired = until !== null ? until <= 0 : ["EXPIRED", "PAST_DUE", "SUSPENDED", "CANCELED"].includes(status);
  const days = until === null ? null : Math.max(0, Math.ceil(until / 86_400_000));
  const expiring = days !== null && days <= 30 && days > 0;
  if (!paidPlan) return null;

  async function requestManualRenewal() {
    setPending(true);
    try {
      const response = await fetch("/api/billing/renewal-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      const body = await response.json().catch(() => null) as { ticketId?: string; existing?: boolean; notificationPending?: boolean; message?: string } | null;
      if (!response.ok || !body?.ticketId) { toastError(body?.message || "Impossible de demander le renouvellement."); return; }
      setRequestId(body.ticketId);
      if (body.notificationPending) toastInfo("Demande enregistrée. Une notification interne reste à confirmer.");
      else toastSuccess(body.existing ? "Votre demande de renouvellement est déjà en cours." : "Votre demande a été transmise à DTSC.");
    } catch { toastError("Service temporairement indisponible."); }
    finally { setPending(false); }
  }

  return (
    <div className={`rounded-2xl border p-4 ${expired ? "border-red-400/60 bg-red-400/10" : expiring ? "border-amber-400/60 bg-amber-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
      <div className="flex items-start gap-3">
        {expired ? <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-600" /> : <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-black text-dtsc-ink">{expired ? "Abonnement arrivé à échéance" : expiring ? `Votre abonnement expire dans ${days} jour${days === 1 ? "" : "s"}` : "Suivi du renouvellement de votre abonnement"}</h3>
          <p className="text-sm leading-6 text-dtsc-muted">Offre : {paidPlan}. {expiresAt ? `Fin enregistrée : ${new Date(expiresAt).toLocaleDateString("fr-FR")}.` : "Date d’échéance non renseignée."} {expired ? "Une action est nécessaire pour rétablir les capacités payantes." : "Anticipez votre renouvellement pour éviter une interruption."}</p>
          <p className="text-xs leading-5 text-dtsc-muted">Le renouvellement en ligne est un nouveau paiement ponctuel, disponible uniquement si le fournisseur est configuré. Aucun débit récurrent automatique n’est activé sans mandat vérifié.</p>
          {requestId ? <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><MailCheck className="h-4 w-4" />Demande DTSC en cours · <Link href="/support" className="underline">Suivre dans le support</Link></p> : null}
          {!canManage ? <p className="text-sm font-semibold text-dtsc-muted">Seuls les propriétaires et administrateurs de l’organisation peuvent demander un renouvellement.</p> : null}
          <div className="flex flex-wrap gap-2">
            {canManage && !requestId ? <Button type="button" size="sm" disabled={pending} onClick={() => void requestManualRenewal()}>{pending ? "Transmission…" : "Demander à DTSC le renouvellement manuel"}</Button> : null}
            {paymentAvailable && canManage ? <a href="#offres-renouvellement" className="inline-flex min-h-9 items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink">Choisir un paiement ponctuel en ligne</a> : null}
            <Button asChild type="button" variant="outline" size="sm"><Link href="/support">Contacter DTSC</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
