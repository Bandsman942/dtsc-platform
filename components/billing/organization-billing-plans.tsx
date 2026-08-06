"use client";

import { useRef, useState } from "react";
import { Building2, CheckCircle2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastInfo } from "@/lib/client-toast";

type OrganizationPlan = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
};

export function OrganizationBillingPlans({
  plans,
  activePlanId,
  paymentAvailable,
  canManage,
}: {
  plans: OrganizationPlan[];
  activePlanId?: string;
  paymentAvailable: boolean;
  canManage: boolean;
}) {
  const [walletId, setWalletId] = useState("");
  const [provider, setProvider] = useState<"MPESA" | "AIRTEL" | "ORANGE">("MPESA");
  const [pendingPlanId, setPendingPlanId] = useState("");
  const checkoutRequestIdRef = useRef("");

  async function checkout(planId: string) {
    if (!canManage) {
      toastError("Seul un propriétaire ou administrateur actif de l’entreprise peut renouveler cet abonnement.");
      return;
    }
    if (!paymentAvailable) {
      toastInfo("Le paiement automatique est momentanément indisponible. La Console DTSC peut enregistrer un paiement manuel soumis à validation.", "Paiement entreprise");
      return;
    }
    if (!walletId.trim()) {
      toastError("Saisissez le numéro mobile money qui doit confirmer le paiement.");
      return;
    }
    setPendingPlanId(planId);
    if (!checkoutRequestIdRef.current) checkoutRequestIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    try {
      const response = await fetch("/api/billing/organization-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, walletId, provider, requestId: checkoutRequestIdRef.current }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string; paymentReference?: string } | null;
      if (!response.ok) {
        toastError(body?.message || body?.error || "Impossible de lancer le paiement de l’entreprise.");
        return;
      }
      toastInfo(`${body?.message || "Paiement lancé."}${body?.paymentReference ? ` Référence : ${body.paymentReference}.` : ""}`, "Paiement entreprise initié");
      checkoutRequestIdRef.current = "";
    } catch {
      toastError("Le service de paiement est momentanément indisponible.");
    } finally {
      setPendingPlanId("");
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-bold text-dtsc-ink">
          Numéro mobile money de l’entreprise
          <Input value={walletId} onChange={(event) => setWalletId(event.target.value)} inputMode="tel" placeholder="Ex : 2438XXXXXXXX" disabled={!canManage} />
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-bold text-dtsc-ink">
          Plateforme de paiement
          <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)} disabled={!canManage} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink disabled:opacity-60">
            <option value="MPESA">M-Pesa</option>
            <option value="AIRTEL">Airtel Money</option>
            <option value="ORANGE">Orange Money</option>
          </select>
        </label>
        <p className="text-xs leading-5 text-dtsc-muted md:col-span-2">
          L’abonnement, le paiement, la facture entreprise et l’impact sur le chiffre d’affaires sont appliqués une seule fois à partir de la référence de paiement validée.
        </p>
      </div>

      {plans.length ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const active = plan.id === activePlanId;
            return (
              <article key={plan.id} className={`flex min-w-0 flex-col rounded-2xl border p-4 ${active ? "border-cyan-400 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-surface"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300"><Building2 className="h-4 w-4" /> Offre entreprise</p>
                    <h3 className="mt-2 break-words text-lg font-black text-dtsc-ink">{plan.name}</h3>
                  </div>
                  {active ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-dtsc-muted">{plan.description}</p>
                <p className="mt-4 text-2xl font-black text-dtsc-ink">{plan.priceUsd.toFixed(2)} USD <span className="text-xs font-bold text-dtsc-muted">/ mois</span></p>
                <div className="mt-3 grid gap-1 text-xs font-semibold text-dtsc-muted">
                  <span>{plan.dailyMessageLimit.toLocaleString("fr-FR")} messages/jour</span>
                  <span>{plan.dailyTokenLimit.toLocaleString("fr-FR")} tokens/jour</span>
                  <span>{plan.maxDocuments.toLocaleString("fr-FR")} documents</span>
                </div>
                <Button type="button" onClick={() => checkout(plan.id)} disabled={active || !canManage || Boolean(pendingPlanId) || !paymentAvailable} className="mt-5 bg-[#002b5b] text-white hover:bg-[#001736]">
                  <CreditCard className="h-4 w-4" />
                  {active ? "Offre active" : pendingPlanId === plan.id ? "Traitement…" : !canManage ? "Réservé aux administrateurs" : paymentAvailable ? "Payer pour l’entreprise" : "Paiement indisponible"}
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-muted">Aucune offre entreprise active n’est actuellement publiée.</p>
      )}
    </div>
  );
}
