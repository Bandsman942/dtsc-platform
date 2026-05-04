import { AppShell } from "@/components/layout/app-shell";
import { SupportForm } from "@/components/support/support-form";
import { requireUser } from "@/lib/auth";

export default async function SupportPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <p className="text-sm font-bold text-cyan-600">Assistance</p>
          <h1 className="mt-2 text-4xl font-black text-dtsc-ink">Support DTSC</h1>
          <p className="mt-3 max-w-2xl leading-7 text-dtsc-muted">
            Créez une demande lorsqu&apos;un sujet nécessite une validation humaine, un cadrage commercial, une étude technique ou un accompagnement stratégique.
          </p>
          <div className="mt-6">
            <SupportForm />
          </div>
        </section>
        <aside className="dtsc-card p-6">
          <h2 className="font-black text-dtsc-ink">Bonnes pratiques</h2>
          <ul className="mt-4 space-y-3 text-sm text-dtsc-muted">
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
