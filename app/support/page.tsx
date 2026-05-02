import { AppShell } from "@/components/layout/app-shell";
import { SupportForm } from "@/components/support/support-form";
import { requireUser } from "@/lib/auth";

export default async function SupportPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <h1 className="text-3xl font-semibold text-white">Support DTSC</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Créez une demande lorsqu'un sujet nécessite une validation humaine, un cadrage commercial, une étude technique ou un accompagnement stratégique.
          </p>
          <div className="mt-6">
            <SupportForm />
          </div>
        </section>
        <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <h2 className="font-semibold text-white">Bonnes pratiques</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li>Décrivez le contexte métier.</li>
            <li>Indiquez les outils ou sources de données concernés.</li>
            <li>Précisez les délais et personnes impliquées.</li>
            <li>Ajoutez les contraintes techniques connues.</li>
          </ul>
        </aside>
      </div>
    </AppShell>
  );
}
