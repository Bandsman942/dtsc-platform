import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicationEngagement } from "@/components/public/publication-engagement";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { ShareActionButton } from "@/components/ui/share-action-button";
import { getCurrentUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
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
  const [publication, currentUser, settings] = await Promise.all([
    prisma.publicPublication.findFirst({
      where: { slug, published: true },
      include: {
        author: { select: { name: true, jobTitle: true, avatarUrl: true, publicProfileConsent: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        reactions: { select: { value: true, userId: true } },
      },
    }),
    getCurrentUser(),
    getAppSettings(),
  ]);

  if (!publication) {
    notFound();
  }

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <article>
        <section className="border-b border-dtsc-border bg-gradient-to-br from-[#001736] via-[#002b5b] to-[#0057b8] text-white">
          <div className="dtsc-premium-reveal mx-auto w-full max-w-5xl min-w-0 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <Link href="/ressources" className="inline-flex items-center gap-2 text-sm font-black text-cyan-200 underline underline-offset-4">
              <ArrowLeft className="h-4 w-4" />
              Retour aux ressources
            </Link>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.18em] text-cyan-200">{formatEnumLabel(publication.category)}</p>
            <h1 className="dtsc-text-shimmer mt-4 break-words text-4xl font-black leading-tight sm:text-6xl">{publication.title}</h1>
            <p className="dtsc-premium-reveal-delay mt-5 text-lg leading-8 text-blue-50">{publication.excerpt}</p>
            <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-4 text-sm text-blue-100">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {publication.author?.publicProfileConsent && (
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-black text-white">
                    {publication.author.avatarUrl ? <img src={publication.author.avatarUrl} alt="" className="h-full w-full object-cover" /> : publication.author.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 break-words">
                  Publié le {publication.createdAt.toLocaleDateString("fr-FR")}{" "}
                  {publication.author?.publicProfileConsent ? `par ${publication.author.name}` : "par DTSC"}
                  {publication.author?.publicProfileConsent && publication.author.jobTitle ? `, ${publication.author.jobTitle}` : ""}
                </span>
              </div>
              <ShareActionButton
                title={publication.title}
                text={publication.excerpt}
                url={`/ressources/${publication.slug}`}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              />
            </div>
          </div>
        </section>

        <section className="dtsc-public-band-light">
          <div className="mx-auto w-full max-w-4xl min-w-0 px-4 py-14 sm:px-6 lg:px-8">
            <div className="dtsc-card dtsc-premium-reveal p-6 sm:p-8">
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
              <PublicationEngagement
                publicationId={publication.id}
                comments={JSON.parse(JSON.stringify(publication.comments))}
                reactions={publication.reactions}
                currentUser={currentUser ? { id: currentUser.id, role: currentUser.role, name: currentUser.name } : null}
                commentEditWindowMinutes={settings.commentEditWindowMinutes}
              />
            </div>
          </div>
        </section>
      </article>
      <PublicFooter />
    </main>
  );
}
