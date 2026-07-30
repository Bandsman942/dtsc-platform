import { CreditCard } from "lucide-react";
import Link from "next/link";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { BillingPlans } from "@/components/billing/billing-plans";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { ensureBillingPlans } from "@/lib/billing";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { isMaishaPayConfigured } from "@/lib/maishapay";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";

export default async function BillingPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const paymentAvailable = isMaishaPayConfigured();
  const [plans, activeSubscription, recentInvoices, organizationEntitlements, organizationBillingRecords] = await Promise.all([
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
    getOrganizationEntitlements(activeOrganizationId),
    activeOrganizationId ? prisma.billingRecord.findMany({
      where: { organizationId: activeOrganizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }) : [],
  ]);

  const activePlan = activeSubscription?.plan;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Abonnements"
          title="Plans DTSC Chatbot"
          count={activePlan?.name || "Aucun plan actif"}
          description="Choisissez un niveau d’accès selon votre volume de conversations, vos besoins documentaires et votre usage professionnel."
        />
        <ModuleMetrics label="Indicateurs de l’abonnement">
          <ModuleMetric label="Plan courant" value={activePlan?.name || "Aucun"} hint={<span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Abonnement utilisateur</span>} />
          <ModuleMetric label="Messages / jour" value={activePlan?.dailyMessageLimit ?? 0} hint="Limite active" />
          <ModuleMetric label="Tokens / jour" value={activePlan?.dailyTokenLimit ?? 0} hint="Capacité IA" />
          <ModuleMetric label="Documents" value={activePlan?.maxDocuments ?? 0} hint="Capacité privée" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Plans disponibles" description={paymentAvailable ? "Sélectionnez le plan adapté à votre usage." : "Les plans restent visibles; le paiement en ligne est temporairement indisponible."}>
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
          </ModuleSection>

          <Accordion>
            {organizationEntitlements && !organizationEntitlements.isDtscInternal ? (
              <AccordionItem title="Abonnement de votre organisation" defaultOpen>
                <div className="min-w-0 space-y-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-dtsc-border pb-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Espace organisation</p>
                      <h2 className="mt-1 break-words text-xl font-black text-dtsc-ink">Plan {organizationEntitlements.planLabel}</h2>
                      <p className="mt-2 text-sm font-semibold leading-6 text-dtsc-muted">Statut {formatEnumLabel(organizationEntitlements.subscriptionStatus)} · {organizationEntitlements.subscriptionActive ? "accès actif" : "vérification requise"}</p>
                    </div>
                    <StatusBadge tone={organizationEntitlements.subscriptionActive ? "success" : "warning"}>{organizationEntitlements.subscriptionActive ? "Actif" : "Limité"}</StatusBadge>
                  </div>
                  <BusinessList ariaLabel="Limites de l’abonnement organisation">
                    {[
                      ["Modules", `${organizationEntitlements.modules.filter((enterpriseModule) => enterpriseModule.allowed).length}/${organizationEntitlements.modules.length}`],
                      ["Utilisateurs", String(organizationEntitlements.limits.maxUsers)],
                      ["Documents", String(organizationEntitlements.limits.maxDocuments)],
                      ["Stockage", `${organizationEntitlements.limits.maxStorageMb} Mo`],
                      ["Appels", `${organizationEntitlements.limits.maxMonthlyCallMinutes} min/mois`],
                      ["Support", organizationEntitlements.limits.supportLevel],
                      ["Fin", organizationEntitlements.expiresAt ? new Date(organizationEntitlements.expiresAt).toLocaleDateString("fr-FR") : "Non définie"],
                      ["Essai", organizationEntitlements.trialEndsAt ? new Date(organizationEntitlements.trialEndsAt).toLocaleDateString("fr-FR") : "Non défini"],
                    ].map(([label, value]) => <BusinessListItem key={label} title={label} status={<StatusBadge>{value}</StatusBadge>} />)}
                  </BusinessList>
                  {organizationBillingRecords.length ? (
                    <BusinessList ariaLabel="Facturation organisation">
                      {organizationBillingRecords.map((record) => (
                        <BusinessListItem key={record.id} title={record.reference || record.id} description={`${Number(record.amount).toFixed(2)} ${record.currency}`} status={<StatusBadge>{formatEnumLabel(record.status)}</StatusBadge>} />
                      ))}
                    </BusinessList>
                  ) : <EmptyState compact title="Aucune facturation organisation" />}
                </div>
              </AccordionItem>
            ) : null}
            <AccordionItem title="Factures récentes">
              {recentInvoices.length ? (
                <BusinessList ariaLabel="Factures récentes">
                  {recentInvoices.map((invoice) => (
                    <BusinessListItem
                      key={invoice.id}
                      title={invoice.number}
                      description={`${invoice.planName} · ${Number(invoice.amount).toFixed(2)} ${invoice.currency}`}
                      status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>}
                      actions={<Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="inline-flex min-h-11 items-center rounded-xl bg-[#002b5b] px-3 text-xs font-black text-white hover:bg-[#001736]">Télécharger</Link>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune facture" description="Aucune facture n’est disponible pour le moment." />}
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
