import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicationCommentDeepLink } from "@/components/public/publication-comment-deep-link";
import { PublicationEngagement } from "@/components/public/publication-engagement";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { ShareActionButton } from "@/components/ui/share-action-button";
import { getCurrentUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";
import { hasHtmlMarkup, sanitizeRichHtml } from "@/lib/rich-content";

type Params = { params: Promise<{ slug: string }>; searchParams?: Promise<{ commentId?: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const publication = await prisma.publicPublication.findFirst({
    where: { slug, published: true },
    select: { title: true, excerpt: true },
  });

  if (!publication) return { title: "Ressource introuvable" };

  return {
    title: publication.title,
    description: publication.excerpt,
    alternates: { canonical: `/ressources/${slug}` },
  };
}

export default async function PublicationPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { commentId } = searchParams ? await searchParams : {};
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

  if (!publication) notFound();

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <article>
        <section className="border-b border-dtsc-border bg-dtsc-surface text-dtsc-ink">
          <div className="mx-auto w-full max-w-[52rem] min-w-0 px-4 py-12 sm:px-6 lg:py-16">
            <Link href="/ressources" className="inline-flex items-center gap-2 text-sm font-medium text-dtsc-blue underline underline-offset-4">
              <ArrowLeft className="h-4 w-4" />
              Retour aux ressources
            </Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.1em] text-dtsc-blue">{formatEnumLabel(publication.category)}</p>
            <h1 className="mt-4 break-words text-4xl font-semibold leading-[1.1] tracking-tight text-dtsc-ink sm:text-5xl">{publication.title}</h1>
            <p className="mt-5 text-lg leading-8 text-dtsc-muted">{publication.excerpt}</p>
            <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-4 text-sm text-dtsc-muted">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {publication.author?.publicProfileConsent ? (
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-dtsc-soft text-sm font-semibold text-dtsc-blue">
                    {publication.author.avatarUrl ? <Image src={publication.author.avatarUrl} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" /> : publication.author.name.slice(0, 2).toUpperCase()}
                  </span>
                ) : null}
                <span className="min-w-0 break-words">
                  Publié le {publication.createdAt.toLocaleDateString("fr-FR")} {publication.author?.publicProfileConsent ? `par ${publication.author.name}` : "par DTSC"}{publication.author?.publicProfileConsent && publication.author.jobTitle ? `, ${publication.author.jobTitle}` : ""}
                </span>
              </div>
              <ShareActionButton title={publication.title} text={publication.excerpt} url={`/ressources/${publication.slug}`} className="border-dtsc-border bg-dtsc-page text-dtsc-ink hover:bg-dtsc-soft" />
            </div>
          </div>
        </section>

        <section className="dtsc-public-band-light">
          <div className="mx-auto w-full max-w-[48rem] min-w-0 px-4 py-12 sm:px-6 lg:py-16">
            <div className="dtsc-article-reader min-w-0">
              {hasHtmlMarkup(publication.content) ? (
                <div className="dtsc-publication-content text-dtsc-muted" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(publication.content) }} />
              ) : (
                <div className="prose prose-slate max-w-none text-dtsc-muted">
                  {publication.content.split("\n").map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 24)}`} className="mb-5 text-base leading-8">{paragraph}</p>
                  ))}
                </div>
              )}
              <PublicationCommentDeepLink commentId={commentId} />
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