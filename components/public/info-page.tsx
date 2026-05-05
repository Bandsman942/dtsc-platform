import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { sources } from "@/lib/public-content";

export function InfoPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: string[][];
}) {
  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-600">Ressource DTSC</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-dtsc-muted">{intro}</p>
        <div className="mt-10 grid gap-5">
          {sections.map(([heading, text]) => (
            <article key={heading} className="dtsc-card p-6">
              <h2 className="text-xl font-black">{heading}</h2>
              <p className="mt-3 leading-7 text-dtsc-muted">{text}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-dtsc-border bg-dtsc-surface p-6">
          <h2 className="font-black">Sources vérifiables</h2>
          <div className="mt-4 grid gap-2">
            {sources.map((source) => (
              <Link key={source.href} href={source.href} target="_blank" className="text-sm font-black text-dtsc-blue underline underline-offset-4 hover:text-cyan-500">
                {source.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
