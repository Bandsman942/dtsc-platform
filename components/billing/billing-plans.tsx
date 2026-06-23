"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";

type Plan = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  maxDocuments: number;
};

export function BillingPlans({
  plans,
  activePlanId,
  paymentAvailable,
}: {
  plans: Plan[];
  activePlanId?: string;
  paymentAvailable: boolean;
}) {
  const [walletId, setWalletId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function checkout(planId: string, priceUsd: number) {
    setSelectedPlan(planId);
    if (priceUsd > 0 && !paymentAvailable) {
      toastInfo("Les abonnements payants sont momentanément en préparation. Le plan gratuit Découverte reste opérationnel.", "Abonnements en préparation");
      return;
    }
    if (priceUsd > 0 && !walletId.trim()) {
      toastError("Saisissez votre numéro M-Pesa avant de continuer.");
      return;
    }

    setIsPending(true);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, walletId, provider: "MPESA" }),
    });
    const body = await response.json().catch(() => null);
    setIsPending(false);

    if (!response.ok) {
      toastError(body?.error || "Impossible de lancer le paiement.");
      return;
    }

    if (body.free) {
      toastSuccess("Plan gratuit activé.");
    } else {
      toastInfo(`Paiement initié. Référence: ${body.paymentReference}. Confirmez la demande sur votre téléphone.`, "Paiement initié");
    }
  }

  return (
    <div className="space-y-5">
      <div className="dtsc-glass-card overflow-hidden rounded-[1.6rem] p-5">
        {!paymentAvailable && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300/45 bg-amber-300/10 p-4 text-sm leading-6 text-dtsc-ink backdrop-blur-xl">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-300" />
            <div>
              <p className="font-black">Abonnements payants en préparation</p>
              <p className="text-dtsc-muted">
                Les offres payantes seront ouvertes dès que le paiement en ligne sera finalisé. Le plan Découverte gratuit reste disponible pour tester DTSC Chatbot.
              </p>
            </div>
          </div>
        )}
        <label className="grid gap-2 text-sm font-bold text-dtsc-ink">
          Numéro mobile money
          <Input value={walletId} onChange={(event) => setWalletId(event.target.value)} placeholder="Ex: 2438XXXXXXXX" inputMode="tel" />
        </label>
        <p className="mt-2 text-xs leading-5 text-dtsc-muted">
          Le plan gratuit ne demande pas de paiement. Pour les plans payants, la validation se fera sur le numéro mobile money renseigné.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const active = activePlanId === plan.id;
          return (
            <article
              key={plan.id}
              className={`relative flex min-h-full flex-col overflow-hidden rounded-[1.6rem] border p-5 shadow-[0_18px_55px_rgba(0,43,91,0.10)] transition hover:-translate-y-1 ${
                active
                  ? "border-cyan-300 bg-[#001736] text-white"
                  : "dtsc-glass-card text-dtsc-ink"
              }`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${active ? "bg-cyan-300" : "bg-gradient-to-r from-cyan-300 via-[#002b5b] to-emerald-300"}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] ${active ? "bg-white/10 text-cyan-200" : "bg-dtsc-soft text-dtsc-blue"}`}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {active ? "Plan actif" : "Offre DTSC"}
                  </span>
                  <h2 className={`mt-3 text-xl font-black ${active ? "text-white" : "text-dtsc-ink"}`}>{plan.name}</h2>
                  <p className={`mt-2 text-sm leading-6 ${active ? "text-slate-300" : "text-dtsc-muted"}`}>{plan.description}</p>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 text-cyan-400" />}
              </div>
              <p className={`mt-5 text-3xl font-black ${active ? "text-white" : "text-dtsc-ink"}`}>
                {plan.priceUsd === 0 ? "Gratuit" : `${plan.priceUsd}$`}
                {plan.priceUsd > 0 && <span className={`text-sm font-semibold ${active ? "text-slate-300" : "text-dtsc-muted"}`}> / mois</span>}
              </p>
              <ul className={`mt-5 space-y-2 text-sm ${active ? "text-slate-300" : "text-dtsc-muted"}`}>
                <li>{plan.dailyMessageLimit} messages / jour</li>
                <li>{plan.dailyTokenLimit.toLocaleString("fr-FR")} tokens / jour</li>
                <li>{plan.maxDocuments} document(s) autorisé(s)</li>
              </ul>
              <Button
                className={`mt-auto rounded-xl ${active ? "bg-cyan-300 text-[#001736] hover:bg-cyan-200" : "bg-[#002b5b] text-white hover:bg-[#001736]"}`}
                disabled={isPending || active || (plan.priceUsd > 0 && !paymentAvailable)}
                onClick={() => checkout(plan.id, plan.priceUsd)}
              >
                <CreditCard className="h-4 w-4" />
                {active
                  ? "Plan actif"
                  : selectedPlan === plan.id && isPending
                    ? "Traitement..."
                    : plan.priceUsd === 0
                      ? "Activer"
                      : paymentAvailable
                        ? "Payer en ligne"
                        : "Indisponible temporairement"}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
