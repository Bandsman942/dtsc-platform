import { CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { BillingPlans } from "@/components/billing/billing-plans";
import { OrganizationBillingPlans } from "@/components/billing/organization-billing-plans";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { getPublishedBillingCatalog } from "@/lib/billing/commercial-catalog";
import { resolvePersonalCommercialContext } from "@/lib/billing/commercial-context";
import { getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { formatEnumLabel } from "@/lib/labels";
import { isMaishaPayConfigured } from "@/lib/maishapay";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "Non définie";
  return new Date(value).toLocaleDateString("fr-FR");
}

function storageLabel(maxStorageMb: number) {
  if (maxStorageMb >= 1024) return `${Math.round(maxStorageMb / 1024)} Go`;
  return `${maxStorageMb} Mo`;
}

export default async function BillingPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const paymentAvailable = isMaishaPayConfigured();
  const [catalog, latestSubscription, recentInvoices, recentPayments, organizationEntitlements, personalCommercialContext, organizationBillingRecords, organizationInvoices, organizationMembership, usageToday, knowledgeSourceCount] = await Promise.all([
    getPublishedBillingCatalog(),
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.invoice.findMany({
      where: { userId: user.id, category: "PERSONAL_SUBSCRIPTION" },
      orderBy: { issuedAt: "desc" },
      take: 10,
    }),
    prisma.payment.findMany({
      where: { userId: user.id, organizationId: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reference: true, providerReference: true, provider: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true },
    }),
    getOrganizationEntitlements(activeOrganizationId),
    resolvePersonalCommercialContext(user.id),
    activeOrganizationId ? prisma.billingRecord.findMany({
      where: { organizationId: activeOrganizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }) : [],
    activeOrganizationId ? prisma.invoice.findMany({
      where: { organizationId: activeOrganizationId, category: "ORGANIZATION_SUBSCRIPTION" },
      orderBy: { issuedAt: "desc" },
      take: 10,
    }) : [],
    activeOrganizationId ? prisma.organizationMember.findFirst({
      where: { organizationId: activeOrganizationId, userId: user.id, status: "ACTIVE", removedAt: null },
      select: { role: true },
    }) : null,
    prisma.usageLog.aggregate({
      where: {
        userId: user.id,
        organizationId: activeOrganizationId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    prisma.knowledgeDocument.count({ where: { userId: user.id, organizationId: activeOrganizationId } }),
  ]);

  const personalPlans = catalog.offers.filter((offer) => offer.audience === "PERSONAL");
  const organizationPlans = catalog.offers.filter((offer) => offer.audience === "ORGANIZATION");
  const canManageOrganizationSubscription = organizationMembership?.role === "OWNER" || organizationMembership?.role === "ADMIN";
  const hasClientOrganizationContext = Boolean(organizationEntitlements && !organizationEntitlements.isDtscInternal);
  const contextualOfferLabel = hasClientOrganizationContext
    ? organizationEntitlements?.offerName || "Aucune offre organisation active"
    : personalCommercialContext.offer?.name || "Accès personnel";
  const contextualCapabilityLabel = hasClientOrganizationContext
    ? organizationEntitlements?.capabilityLabel || "Essentiel"
    : personalCommercialContext.capabilityLabel;
  const contextualStatus = hasClientOrganizationContext
    ? organizationEntitlements?.subscriptionStatus || "MISSING"
    : personalCommercialContext.subscriptionStatus;
  const contextualActive = hasClientOrganizationContext
    ? Boolean(organizationEntitlements?.subscriptionActive)
    : personalCommercialContext.subscriptionActive;
  const contextualDailyMessageLimit = hasClientOrganizationContext
    ? organizationEntitlements?.dailyMessageLimit || 0
    : personalCommercialContext.dailyMessageLimit;
  const contextualDailyTokenLimit = hasClientOrganizationContext
    ? organizationEntitlements?.dailyTokenLimit || 0
    : personalCommercialContext.dailyTokenLimit;
  const contextualMaxKnowledgeSources = hasClientOrganizationContext
    ? organizationEntitlements?.maxDocuments || 0
    : personalCommercialContext.maxDocuments;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Abonnement SaaS"
          title="Offres, capacités et facturation DTSC"
          count={`Offre ${contextualOfferLabel}`}
          description="Cette page utilise le même catalogue commercial publié que le site public, la Console DTSC et les résolveurs backend. Elle distingue l’offre souscrite, les sources de connaissance IA, les documents métier ERP et le stockage."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=billing">Guide de l’Abonnement</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Indicateurs de l’abonnement">
          <ModuleMetric label="Offre appliquée" value={contextualOfferLabel} hint={hasClientOrganizationContext ? "Organisation active" : "Compte personnel"} />
          <ModuleMetric label="Niveau de capacité" value={contextualCapabilityLabel} hint="Essentiel · Professionnel · Entreprise" />
          <ModuleMetric label="Statut" value={formatEnumLabel(contextualStatus)} hint={contextualActive ? "Capacités actives" : "Intervention requise"} />
          <ModuleMetric label="Messages aujourd’hui" value={usageToday._count._all} hint={`Limite ${contextualDailyMessageLimit}`} />
          <ModuleMetric label="Tokens aujourd’hui" value={usageToday._sum.totalTokens || 0} hint={`Limite ${contextualDailyTokenLimit}`} />
          <ModuleMetric label="Sources IA" value={knowledgeSourceCount} hint={`Limite ${contextualMaxKnowledgeSources}`} />
          <ModuleMetric label="Factures SaaS" value={recentInvoices.length + organizationInvoices.length} hint="Historique récent" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Source de vérité commerciale" description={`Catalogue publié ${catalog.releaseId}. Les offres, prix et quotas affichés proviennent du même resolver commercial que le site public et l’IA DTSC.`}>
            <BusinessList ariaLabel="Résumé commercial">
              <BusinessListItem leading={<CreditCard className="h-5 w-5 text-cyan-600" />} title="Offre, niveau et statut" description={`Offre ${contextualOfferLabel} · Niveau ${contextualCapabilityLabel} · ${formatEnumLabel(contextualStatus)}`} status={<StatusBadge tone={contextualActive ? "success" : "warning"}>{contextualActive ? "Actif" : "À vérifier"}</StatusBadge>} />
              <BusinessListItem leading={<ShieldCheck className="h-5 w-5 text-cyan-600" />} title="Autorité serveur" description="Une offre fixe les plafonds commerciaux; les accès réels restent soumis au tenant, au rôle, aux permissions, aux modules et au secteur." status={<StatusBadge>Entitlements canoniques</StatusBadge>} />
              <BusinessListItem leading={<ReceiptText className="h-5 w-5 text-cyan-600" />} title="Trois limites distinctes" description="Sources de connaissance IA, documents métier ERP et stockage sont comptés séparément et ne se remplacent jamais mutuellement." status={<StatusBadge>Contrat clarifié</StatusBadge>} />
            </BusinessList>
          </ModuleSection>

          <ModuleSection title="Offres individuelles disponibles" description={paymentAvailable ? "Sélectionnez une offre uniquement lorsque le changement est réellement supporté par le fournisseur de paiement." : "Le catalogue reste consultable; aucune action de paiement fictive n’est présentée lorsque le fournisseur n’est pas configuré."}>
            <BillingPlans
              activePlanId={personalCommercialContext.offer?.id}
              paymentAvailable={paymentAvailable}
              plans={personalPlans.map((plan) => ({
                id: plan.id,
                name: plan.name,
                description: plan.positioningFr,
                priceUsd: plan.priceUsd,
                dailyMessageLimit: plan.dailyMessageLimit,
                dailyTokenLimit: plan.dailyTokenLimit,
                maxDocuments: plan.maxKnowledgeSources,
              }))}
            />
          </ModuleSection>

          <Accordion>
            <AccordionItem title="Abonnement personnel" defaultOpen>
              {latestSubscription ? (
                <BusinessList ariaLabel="Détails de l’abonnement personnel">
                  <BusinessListItem title="Offre" description={latestSubscription.plan.name} status={<StatusBadge>{formatEnumLabel(latestSubscription.status)}</StatusBadge>} />
                  <BusinessListItem title="Niveau de capacité appliqué" description={personalCommercialContext.capabilityLabel} />
                  <BusinessListItem title="Début de période" description={dateLabel(latestSubscription.currentPeriodStart)} />
                  <BusinessListItem title="Fin de période" description={dateLabel(latestSubscription.currentPeriodEnd)} />
                  <BusinessListItem title="Renouvellement" description={latestSubscription.cancelAtPeriodEnd ? "Annulation programmée en fin de période" : "Aucune annulation programmée"} status={<StatusBadge tone={latestSubscription.cancelAtPeriodEnd ? "warning" : "success"}>{latestSubscription.cancelAtPeriodEnd ? "Fin de période" : "Maintenu"}</StatusBadge>} />
                </BusinessList>
              ) : <EmptyState compact title={`Offre appliquée : ${personalCommercialContext.offer?.name || "Découverte"}`} description="Aucun abonnement personnel payant n’est enregistré. Les capacités gratuites appliquées par le serveur restent disponibles." />}
            </AccordionItem>

            {organizationEntitlements && !organizationEntitlements.isDtscInternal ? (
              <AccordionItem title="Abonnement de l’organisation active">
                <div className="min-w-0 space-y-6">
                  <OrganizationBillingPlans
                    activePlanId={organizationEntitlements.offerId || undefined}
                    canManage={canManageOrganizationSubscription}
                    paymentAvailable={paymentAvailable}
                    plans={organizationPlans.map((plan) => ({
                      id: plan.id,
                      name: plan.name,
                      description: plan.positioningFr,
                      priceUsd: plan.priceUsd,
                      dailyMessageLimit: plan.dailyMessageLimit,
                      dailyTokenLimit: plan.dailyTokenLimit,
                      maxDocuments: plan.maxKnowledgeSources,
                    }))}
                  />
                  <BusinessList ariaLabel="Limites de l’abonnement organisation">
                    {[
                      ["Offre", organizationEntitlements.offerName || "Aucune offre organisation active"],
                      ["Niveau de capacité", organizationEntitlements.capabilityLabel],
                      ["Statut", formatEnumLabel(organizationEntitlements.subscriptionStatus)],
                      ["Modules autorisés", `${organizationEntitlements.modules.filter((enterpriseModule) => enterpriseModule.allowed).length}/${organizationEntitlements.modules.length}`],
                      ["Utilisateurs", String(organizationEntitlements.limits.maxUsers)],
                      ["Sources de connaissance IA", String(organizationEntitlements.maxDocuments)],
                      ["Documents métier", String(organizationEntitlements.limits.maxDocuments)],
                      ["Stockage", storageLabel(organizationEntitlements.limits.maxStorageMb)],
                      ["Appels", `${organizationEntitlements.limits.maxMonthlyCallMinutes} min/mois`],
                      ["Support", organizationEntitlements.limits.supportLevel],
                      ["Expiration", dateLabel(organizationEntitlements.expiresAt)],
                      ["Fin d’essai", dateLabel(organizationEntitlements.trialEndsAt)],
                    ].map(([label, value]) => <BusinessListItem key={label} title={label} status={<StatusBadge>{value}</StatusBadge>} />)}
                  </BusinessList>
                  {organizationInvoices.length ? (
                    <BusinessList ariaLabel="Factures SaaS de l’organisation">
                      {organizationInvoices.map((invoice) => (
                        <BusinessListItem
                          key={invoice.id}
                          title={invoice.number}
                          description={`${invoice.planName} · ${Number(invoice.amount).toFixed(2)} ${invoice.currency}`}
                          meta={`Émise le ${invoice.issuedAt.toLocaleDateString("fr-FR")}${invoice.emailSentAt ? " · E-mail envoyé" : " · Envoi e-mail à vérifier"}`}
                          status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>}
                          actions={<Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="inline-flex min-h-11 items-center rounded-xl bg-[#002b5b] px-3 text-xs font-black text-white hover:bg-[#001736]">Télécharger</Link>}
                        />
                      ))}
                    </BusinessList>
                  ) : <EmptyState compact title="Aucune facture entreprise" />}
                  {organizationBillingRecords.length ? (
                    <BusinessList ariaLabel="Paiements SaaS de l’organisation">
                      {organizationBillingRecords.map((record) => (
                        <BusinessListItem
                          key={record.id}
                          title={record.reference || `Facturation ${record.id.slice(-8)}`}
                          description={`${Number(record.amount).toFixed(2)} ${record.currency} · ${record.paymentMethod || "Moyen non renseigné"}`}
                          meta={record.createdAt.toLocaleDateString("fr-FR")}
                          status={<StatusBadge>{formatEnumLabel(record.status)}</StatusBadge>}
                          actions={record.invoiceUrl ? <Link href={record.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Ouvrir le document</Link> : undefined}
                        />
                      ))}
                    </BusinessList>
                  ) : <EmptyState compact title="Aucune facturation organisation" />}
                </div>
              </AccordionItem>
            ) : null}

            <AccordionItem title="Factures personnelles récentes">
              {recentInvoices.length ? (
                <BusinessList ariaLabel="Factures SaaS personnelles récentes">
                  {recentInvoices.map((invoice) => (
                    <BusinessListItem
                      key={invoice.id}
                      title={invoice.number}
                      description={`${invoice.planName} · ${Number(invoice.amount).toFixed(2)} ${invoice.currency}`}
                      meta={`Émise le ${invoice.issuedAt.toLocaleDateString("fr-FR")}${invoice.dueAt ? ` · Échéance ${invoice.dueAt.toLocaleDateString("fr-FR")}` : ""}`}
                      status={<StatusBadge>{formatEnumLabel(invoice.status)}</StatusBadge>}
                      actions={<Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="inline-flex min-h-11 items-center rounded-xl bg-[#002b5b] px-3 text-xs font-black text-white hover:bg-[#001736]">Télécharger</Link>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune facture personnelle" description="Aucune facture SaaS n’est disponible pour le moment." />}
            </AccordionItem>

            <AccordionItem title="Paiements récents">
              {recentPayments.length ? (
                <BusinessList ariaLabel="Paiements SaaS récents">
                  {recentPayments.map((payment) => (
                    <BusinessListItem
                      key={payment.id}
                      title={payment.reference}
                      description={`${Number(payment.amount).toFixed(2)} ${payment.currency} · ${payment.provider}`}
                      meta={`${payment.providerReference || "Référence fournisseur non disponible"} · ${dateLabel(payment.paidAt || payment.createdAt)}`}
                      status={<StatusBadge>{formatEnumLabel(payment.status)}</StatusBadge>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucun paiement récent" />}
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
