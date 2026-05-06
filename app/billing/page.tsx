import { CreditCard } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { BillingPlans } from "@/components/billing/billing-plans";
import { requireUser } from "@/lib/auth";
import { ensureBillingPlans } from "@/lib/billing";
import { isMaishaPayConfigured } from "@/lib/maishapay";
import { prisma } from "@/lib/prisma";

export default async function BillingPage() {
  const user = await requireUser();
  const paymentAvailable = isMaishaPayConfigured();
  const [plans, activeSubscription, recentInvoices] = await Promise.all([
    ensureBillingPlans(),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Abonnements</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Plans DTSC Chatbot</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Choisissez un niveau d&apos;accès selon votre volume de conversations, vos besoins documentaires et votre usage professionnel.
          </p>
          {activeSubscription && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
              <CreditCard className="h-4 w-4" />
              Plan actif: {activeSubscription.plan.name}
            </div>
          )}
        </section>

        <BillingPlans
          activePlanId={activeSubscription?.planId}
          paymentAvailable={paymentAvailable}
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            priceUsd: Number(plan.priceUsd),
            dailyMessageLimit: plan.dailyMessageLimit,
            dailyTokenLimit: plan.dailyTokenLimit,
            maxDocuments: plan.maxDocuments,
          }))}
        />

        <section className="dtsc-card p-6">
          <h2 className="font-black text-dtsc-ink">Factures récentes</h2>
          <div className="mt-4 divide-y divide-dtsc-border text-sm">
            {recentInvoices.length ? (
              recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold text-dtsc-ink">{invoice.number}</p>
                    <p className="text-dtsc-muted">{invoice.planName}</p>
                  </div>
                  <p className="font-black text-dtsc-ink">
                    {Number(invoice.amount).toFixed(2)} {invoice.currency}
                  </p>
                  <span className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-muted">{invoice.status}</span>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-dtsc-muted">Aucune facture pour le moment.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
