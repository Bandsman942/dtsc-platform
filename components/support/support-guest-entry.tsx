import Link from "next/link";
import { ArrowRight, BookOpenCheck, LifeBuoy, LockKeyhole } from "lucide-react";
import { getPublicUrl, getSignInUrl } from "@/lib/domains";

export function SupportGuestEntry() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr]">
      <section>
        <p className="dtsc-label text-dtsc-blue">Support DTSC</p>
        <h1 className="dtsc-h1 mt-4 max-w-3xl text-dtsc-ink">Obtenez de l’aide sans exposer vos demandes privées.</h1>
        <p className="dtsc-body-lg mt-5 max-w-2xl text-dtsc-muted">Les tickets, commentaires et pièces jointes sont accessibles uniquement après connexion. Les ressources publiques restent disponibles pour préparer votre demande.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={getSignInUrl("/support")} className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-5 py-3 font-semibold text-white transition hover:bg-[var(--dtsc-brand-secondary-hover)]">Connectez-vous pour consulter vos tickets <ArrowRight className="h-4 w-4" /></Link>
          <Link href={getPublicUrl("/contact")} className="inline-flex items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-5 py-3 font-semibold text-dtsc-blue transition hover:bg-dtsc-soft">Contact général</Link>
        </div>
      </section>
      <section className="dtsc-product-surface p-6 sm:p-8">
        <div className="grid gap-5">
          <div className="flex gap-4"><LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-dtsc-blue" /><div><h2 className="font-semibold text-dtsc-ink">Accès protégé</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">Aucun ticket ni détail d’organisation n’est affiché sans session valide.</p></div></div>
          <div className="flex gap-4"><LifeBuoy className="mt-1 h-6 w-6 shrink-0 text-emerald-600" /><div><h2 className="font-semibold text-dtsc-ink">Parcours clair</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">Créez une demande, suivez le SLA, commentez et ouvrez les notifications par lien profond.</p></div></div>
          <div className="flex gap-4"><BookOpenCheck className="mt-1 h-6 w-6 shrink-0 text-cyan-600" /><div><h2 className="font-semibold text-dtsc-ink">Aide avant ticket</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">Consultez les guides et publications DTSC pour résoudre les questions fréquentes.</p><Link href={getPublicUrl("/ressources")} className="mt-2 inline-flex text-sm font-semibold text-dtsc-blue hover:underline">Explorer les ressources</Link></div></div>
        </div>
      </section>
    </main>
  );
}
