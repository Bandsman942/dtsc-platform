import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import { PublicationCommentDeepLink } from "@/components/public/publication-comment-deep-link";
import { PublicationEngagement } from "@/components/public/publication-engagement";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { PublicArticleContent } from "@/components/public/public-article-content";
import { ShareActionButton } from "@/components/ui/share-action-button";
import { getCurrentUser } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/domains";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/labels";
import { hasHtmlMarkup, sanitizeRichHtml } from "@/lib/rich-content";

function withArticleHeadingAnchors(html: string) {
  const sections: Array<{ id: string; title: string; level: number }> = [];
  const enriched = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/gi, (_markup, rawLevel: string, inside: string) => {
    const id = "dtsc-reading-" + (sections.length + 1);
    const title = inside.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    sections.push({ id, title, level: Number(rawLevel) });
    return "<h" + rawLevel + ' id="' + id + '">' + inside + "</h" + rawLevel + ">";
  });
  return { enriched, sections };
}

function estimateReadingMinutes(content: string) {
  const words = content.replace(/<[^>]*>/g, " ").trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

type Params = { params: Promise<{ slug: string }>; searchParams?: Promise<{ commentId?: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const publication = await prisma.publicPublication.findFirst({
    where: { slug, published: true },
    select: { title: true, excerpt: true, content: true, seoJson: true, createdAt: true, updatedAt: true, publishedAt: true, author: { select: { name: true, publicProfileConsent: true } } },
  });

  if (!publication) return { title: "Ressource introuvable" };
  const storedSeo = publication.seoJson;
  const seo = storedSeo && typeof storedSeo === "object" && !Array.isArray(storedSeo) ? storedSeo as Record<string, unknown> : {};
  const seoTitle = typeof seo.title === "string" && seo.title.trim() ? seo.title : publication.title;
  const seoDescription = typeof seo.description === "string" && seo.description.trim() ? seo.description : publication.excerpt;
  const sanitizedImageMatch = hasHtmlMarkup(publication.content)
    ? sanitizeRichHtml(publication.content).match(/<img\s[^>]*src="([^"]+)"/i)
    : null;
  const coverSource = sanitizedImageMatch?.[1]?.replace(/&amp;/g, "&") || "/dtsc-logo.png";
  const coverUrl = new URL(coverSource, getPublicBaseUrl() || "https://dtsc-platform.com").toString();

  return {
    title: seoTitle,
    description: seoDescription,
    alternates: { canonical: `/ressources/${slug}` },
    openGraph: {
      type: "article",
      url: new URL(`/ressources/${slug}`, getPublicBaseUrl() || "https://dtsc-platform.com").toString(),
      title: seoTitle,
      description: seoDescription,
      images: [{ url: coverUrl, alt: publication.title }],
      publishedTime: (publication.publishedAt || publication.createdAt).toISOString(),
      modifiedTime: publication.updatedAt.toISOString(),
      ...(publication.author?.publicProfileConsent ? { authors: [publication.author.name] } : {}),
    },
    twitter: { card: "summary_large_image", title: seoTitle, description: seoDescription, images: [coverUrl] },
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
  const articleContent = hasHtmlMarkup(publication.content) ? sanitizeRichHtml(publication.content) : "";
  const { enriched: articleHtml, sections: articleSections } = withArticleHeadingAnchors(articleContent);
  const articleCopy = publication.locale === "en"
    ? { tocLabel: "Article table of contents", tocHeading: "In this article", related: "Explore related articles", read: "Read article" }
    : { tocLabel: "Sommaire de l’article", tocHeading: "Dans cet article", related: "Pour continuer votre lecture", read: "Lire l’article" };
  const relatedPublications = await prisma.publicPublication.findMany({
    where: { published: true, category: publication.category, id: { not: publication.id } },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 3,
    select: { id: true, slug: true, title: true, excerpt: true },
  });
  const readingMinutes = estimateReadingMinutes(publication.content);
  const articleUrl = new URL(`/ressources/${publication.slug}`, getPublicBaseUrl() || "https://dtsc-platform.com").toString();
  const articleStructuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: publication.title,
    description: publication.excerpt,
    mainEntityOfPage: articleUrl,
    url: articleUrl,
    datePublished: (publication.publishedAt || publication.createdAt).toISOString(),
    dateModified: publication.updatedAt.toISOString(),
    publisher: { "@type": "Organization", name: "Data and Tech Solutions Consulting" },
    author: { "@type": publication.author?.publicProfileConsent ? "Person" : "Organization", name: publication.author?.publicProfileConsent ? publication.author.name : "Data and Tech Solutions Consulting" },
    inLanguage: publication.locale || "fr",
  };

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink">
      <PublicHeader />
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData).replace(/</g, "\\u003c") }} />
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
                  Publié le {(publication.publishedAt || publication.createdAt).toLocaleDateString("fr-FR")} {publication.author?.publicProfileConsent ? `par ${publication.author.name}` : "par DTSC"}{publication.author?.publicProfileConsent && publication.author.jobTitle ? `, ${publication.author.jobTitle}` : ""}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-dtsc-muted"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{readingMinutes} min de lecture</span>
              <ShareActionButton title={publication.title} text={publication.excerpt} url={`/ressources/${publication.slug}`} className="border-dtsc-border bg-dtsc-page text-dtsc-ink hover:bg-dtsc-soft" />
            </div>
          </div>
        </section>

        <section className="dtsc-public-band-light">
          <div className="mx-auto w-full max-w-[48rem] min-w-0 px-4 py-12 sm:px-6 lg:py-16">
            <div className="dtsc-article-reader min-w-0">
              {articleSections.length > 1 ? (
                <nav aria-label={articleCopy.tocLabel} className="mb-10 border-l-2 border-dtsc-border pl-5">
                  <p className="text-sm font-semibold text-dtsc-ink">{articleCopy.tocHeading}</p>
                  <ol className="mt-3 grid gap-2">
                    {articleSections.map((section) => (
                      <li key={section.id} className={section.level === 3 ? "pl-4" : ""}>
                        <a href={"#" + section.id} className="text-sm leading-6 text-dtsc-blue hover:underline focus-visible:underline">{section.title}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              {hasHtmlMarkup(publication.content) ? (
                <PublicArticleContent html={articleHtml} />
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
        {relatedPublications.length ? (
          <section className="border-t border-dtsc-border bg-dtsc-surface">
            <div className="mx-auto w-full max-w-[48rem] px-4 py-10 sm:px-6 lg:py-14">
              <h2 className="text-xl font-semibold tracking-tight text-dtsc-ink">{articleCopy.related}</h2>
              <div className="mt-5 divide-y divide-dtsc-border">
                {relatedPublications.map((item) => (
                  <Link key={item.id} href={"/ressources/" + item.slug}
                    className="group block min-w-0 py-5 focus-visible:outline-2 focus-visible:outline-dtsc-blue">
                    <h3 className="break-words text-lg font-semibold text-dtsc-ink group-hover:text-dtsc-blue">{item.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-dtsc-muted">{item.excerpt}</p>
                    <span className="mt-3 inline-block text-sm font-medium text-dtsc-blue">{articleCopy.read} →</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </article>
      <PublicFooter />
    </main>
  );
}