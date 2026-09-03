import Link from "next/link";
import { ArrowRight, Bot, Building2, CheckCircle2, Database, HardDrive, MessageSquareText, PhoneCall, Users } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { getPublishedBillingCatalog } from "@/lib/billing/commercial-catalog";
import { getSignInUrl } from "@/lib/domains";

export const dynamic = "force-dynamic";

function storageLabel(maxStorageMb: number) {
  if (maxStorageMb >= 1024) return `${Math.round(maxStorageMb / 1024)} Go`;
  return `${maxStorageMb} Mo`;
}

function priceLabel(priceUsd: number) {
  return priceUsd === 0 ? "Gratuit" : `${priceUsd.toFixed(0)} USD`;
}

export default async function PricingPage() {
  const catalog = await getPublishedBillingCatalog();
  const personal = catalog.offers.filter((offer) => offer.audience === "PERSONAL");
  const organizations = catalog.offers.filter((offer) => offer.audience === "ORGANIZATION");

  return (
    <main className="min-h-screen overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <section className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <p className="dtsc-label text-dtsc-blue">DTSC Platform · Tarifs</p>
          <h1 className="dtsc-display mt-5 max-w-5xl">Une offre lisible, avec les mêmes prix et limites partout.</h1>
          <p className="dtsc-body-lg mt-6 max-w-3xl text-dtsc-muted">
            Le catalogue affiché ici est le même contrat commercial que celui utilisé par l’espace Abonnement, la Console DTSC et les résolveurs backend de DTSC Platform.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold text-dtsc-muted">
            <span className="rounded-full border border-dtsc-border bg-dtsc-page px-3 py-2">Release {catalog.release}</span>
            <span className="rounded-full border border-dtsc-border bg-dtsc-page px-3 py-2">Révision {catalog.revision}</span>
            <span className="rounded-full border border-dtsc-border bg-dtsc-page px-3 py-2">Facturation mensuelle en USD</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <p className="dtsc-label text-cyan-600">Comptes personnels</p>
          <h2 className="dtsc-h2 mt-4">Choisir le volume IA adapté à son usage individuel.</h2>
          <p className="mt-4 leading-7 text-dtsc-muted">Les offres personnelles augmentent principalement les volumes de messages, de tokens et de sources de connaissance IA.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {personal.map((offer) => (
            <article key={offer.id} className="dtsc-card flex min-h-full flex-col p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{offer.name}</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-black tracking-[-0.04em]">{priceLabel(offer.priceUsd)}</span>
                {offer.priceUsd > 0 ? <span className="pb-1 text-sm font-bold text-dtsc-muted">/ mois</span> : null}
              </div>
              <p className="mt-4 text-sm leading-6 text-dtsc-muted">{offer.positioningFr}</p>
              <div className="mt-5 grid gap-2 text-sm font-semibold text-dtsc-ink">
                <span className="flex gap-2"><MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />{offer.dailyMessageLimit.toLocaleString("fr-FR")} messages IA/jour</span>
                <span className="flex gap-2"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />{offer.dailyTokenLimit.toLocaleString("fr-FR")} tokens/jour</span>
                <span className="flex gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />{offer.maxKnowledgeSources.toLocaleString("fr-FR")} sources de connaissance IA</span>
              </div>
              <div className="mt-5 border-t border-dtsc-border pt-4">
                {offer.highlightsFr.map((highlight) => <p key={highlight} className="mt-2 flex gap-2 text-sm text-dtsc-muted"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{highlight}</p>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto max-w-[92rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl">
            <p className="dtsc-label text-violet-600">Organisations</p>
            <h2 className="dtsc-h2 mt-4">Essentielle pour structurer. Croissance pour gérer. Premium pour piloter.</h2>
            <p className="mt-4 leading-7 text-dtsc-muted">Les capacités restent soumises à l’abonnement actif, au rôle, aux permissions, au secteur, aux modules activés et à l’isolation de l’organisation.</p>
          </div>
          <div className="mt-9 grid gap-5 xl:grid-cols-3">
            {organizations.map((offer) => {
              const limits = offer.organizationLimits;
              if (!limits) return null;
              return (
                <article key={offer.id} className="dtsc-product-surface flex min-h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">{offer.name}</p>
                      <div className="mt-3 flex items-end gap-2"><span className="text-4xl font-black tracking-[-0.04em]">{priceLabel(offer.priceUsd)}</span><span className="pb-1 text-sm font-bold text-dtsc-muted">/ mois</span></div>
                    </div>
                    <Building2 className="h-6 w-6 text-violet-600" />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-dtsc-muted">{offer.positioningFr}</p>
                  <div className="mt-5 grid gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-semibold text-dtsc-ink">
                    <span className="flex gap-2"><Users className="h-4 w-4 text-violet-600" />{limits.maxUsers.toLocaleString("fr-FR")} utilisateurs</span>
                    <span className="flex gap-2"><HardDrive className="h-4 w-4 text-violet-600" />{storageLabel(limits.maxStorageMb)} de stockage</span>
                    <span className="flex gap-2"><PhoneCall className="h-4 w-4 text-violet-600" />{limits.maxMonthlyCallMinutes.toLocaleString("fr-FR")} min d’appels/mois</span>
                    <span className="flex gap-2"><Database className="h-4 w-4 text-violet-600" />{limits.maxDocuments.toLocaleString("fr-FR")} documents métier</span>
                    <span className="flex gap-2"><Bot className="h-4 w-4 text-violet-600" />{offer.maxKnowledgeSources.toLocaleString("fr-FR")} sources de connaissance IA</span>
                  </div>
                  <div className="mt-5 flex-1 border-t border-dtsc-border pt-4">
                    {offer.highlightsFr.map((highlight) => <p key={highlight} className="mt-2 flex gap-2 text-sm leading-6 text-dtsc-muted"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{highlight}</p>)}
                  </div>
                  <p className="mt-5 rounded-xl bg-dtsc-soft p-3 text-xs font-bold leading-5 text-dtsc-blue">IA : {offer.aiModeFr}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[92rem] gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8 lg:py-20">
        <div>
          <h2 className="dtsc-h2">Prêt à utiliser DTSC Platform ?</h2>
          <p className="mt-3 max-w-2xl leading-7 text-dtsc-muted">Connectez-vous pour voir l’offre réellement appliquée à votre compte ou à votre organisation, sa consommation et ses limites effectives.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={getSignInUrl("/billing")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-dtsc-blue px-5 py-3 font-black text-white">Ouvrir mon abonnement <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/contact" className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-5 py-3 font-black text-dtsc-blue">Parler à DTSC</Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
