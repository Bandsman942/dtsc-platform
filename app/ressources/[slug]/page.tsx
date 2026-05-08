import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";
import { hasHtmlMarkup, sanitizeRichHtml } from "@/lib/rich-content";

type Params = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const publication = await prisma.publicPublication.findFirst({
    where: { slug, published: true },
    select: { title: true, excerpt: true },
  });

  if (!publication) {
    return { title: "Ressource introuvable" };
  }

  return {
    title: publication.title,
    description: publication.excerpt,
    alternates: { canonical: `/ressources/${slug}` },
  };
}

export default async function PublicationPage({ params }: Params) {
  const { slug } = await params;
  const publication = await prisma.publicPublication.findFirst({
    where: { slug, published: true },
    include: { author: { select: { name: true, jobTitle: true, avatarUrl: true, publicProfileConsent: true } } },
  });

  if (!publication) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <article>
        <section className="border-b border-dtsc-border bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#0057b8] text-white">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <Link href="/ressources" className="inline-flex items-center gap-2 text-sm font-black text-cyan-200 underline underline-offset-4">
              <ArrowLeft className="h-4 w-4" />
              Retour aux ressources
            </Link>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.18em] text-cyan-200">{formatEnumLabel(publication.category)}</p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">{publication.title}</h1>
            <p className="mt-5 text-lg leading-8 text-blue-50">{publication.excerpt}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-blue-100">
              {publication.author?.publicProfileConsent && (
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-black text-white">
                  {publication.author.avatarUrl ? <img src={publication.author.avatarUrl} alt="" className="h-full w-full object-cover" /> : publication.author.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>
                Publié le {publication.createdAt.toLocaleDateString("fr-FR")}{" "}
                {publication.author?.publicProfileConsent ? `par ${publication.author.name}` : "par DTSC"}
                {publication.author?.publicProfileConsent && publication.author.jobTitle ? `, ${publication.author.jobTitle}` : ""}
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="dtsc-card p-6 sm:p-8">
            {hasHtmlMarkup(publication.content) ? (
              <div
                className="dtsc-publication-content text-dtsc-muted"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(publication.content) }}
              />
            ) : (
              <div className="prose prose-slate max-w-none text-dtsc-muted">
                {publication.content.split("\n").map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 24)}`} className="mb-5 text-base leading-8">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>
      </article>
      <PublicFooter />
    </main>
  );
}
