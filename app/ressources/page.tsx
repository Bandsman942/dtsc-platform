import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Search, CalendarDays } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { prisma } from "@/lib/prisma";
import { resourceCopy } from "@/lib/public-resources-i18n";

export const metadata: Metadata = {
  title: "Ressources DTSC — articles, guides et cas pratiques",
  description: "Explorez les articles, guides, cas pratiques, démonstrations et réflexions DTSC sur la transformation digitale, la data, l'IA et les entreprises.",
  alternates: { canonical: "/ressources" },
};
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
const categories = [
  "ARTICLE", "GUIDE", "CAS_PRATIQUE", "DEMONSTRATION",
  "PROJET", "ANNONCE", "REFLEXION_BUSINESS_TECH", "RESSOURCE",
] as const;

type Filters = {
  q?: string | string[];
  category?: string | string[];
  page?: string | string[];
  order?: string | string[];
};
type Props = { searchParams?: Promise<Filters> };

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] || "" : "";
}

function resourceUrl(filters: { q?: string; category?: string; order?: string; page?: number }) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.order === "oldest") params.set("order", "oldest");
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return "/ressources" + (query ? "?" + query : "");
}

export default async function RessourcesPage({ searchParams }: Props) {
  const [queryParams, cookieStore, requestHeaders] = await Promise.all([
    searchParams || Promise.resolve({} as Filters), cookies(), headers(),
  ]);
  const cookieLocale = cookieStore.get("dtsc_locale")?.value || cookieStore.get("NEXT_LOCALE")?.value;
  const locale = cookieLocale === "en" || cookieLocale === "fr"
    ? cookieLocale : requestHeaders.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";
  const copy = resourceCopy[locale];
  const q = first(queryParams.q).trim().slice(0, 80);
  const rawCategory = first(queryParams.category);
  const category = categories.find((code) => code === rawCategory) || "";
  const order = first(queryParams.order) === "oldest" ? "oldest" : "recent";
  const requestedPage = Math.min(10000, Math.max(1, Number.parseInt(first(queryParams.page), 10) || 1));

  const baseWhere: Prisma.PublicPublicationWhereInput = { published: true };
  const filteredWhere: Prisma.PublicPublicationWhereInput = {
    ...baseWhere,
    ...(category ? { category } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" } },
      { excerpt: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };
  const recentOrder: Prisma.PublicPublicationOrderByWithRelationInput[] = [
    { publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" },
  ];
  const listOrder: Prisma.PublicPublicationOrderByWithRelationInput[] = order === "oldest"
    ? [{ publishedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
    : recentOrder;

  const [total, categoryTotals, featured] = await Promise.all([
    prisma.publicPublication.count({ where: filteredWhere }),
    prisma.publicPublication.groupBy({
      by: ["category"], where: baseWhere, _count: { _all: true },
    }),
    prisma.publicPublication.findMany({
      where: baseWhere, orderBy: recentOrder, take: 3,
      select: {
        id: true, slug: true, title: true, excerpt: true, category: true,
        publishedAt: true, createdAt: true,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const publications = await prisma.publicPublication.findMany({
    where: filteredWhere, orderBy: listOrder, skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, slug: true, title: true, excerpt: true, category: true,
      publishedAt: true, createdAt: true,
      author: { select: { name: true, publicProfileConsent: true } },
    },
  });

  const totals = new Map(categoryTotals.map((row) => [row.category, row._count._all]));
  const totalPublished = categoryTotals.reduce((sum, row) => sum + row._count._all, 0);
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-CD", {
    day: "numeric", month: "long", year: "numeric",
  });
  const baseFilters = { q, category, order };
  const hasFilters = Boolean(q || category || order === "oldest");

  return (
    <main className="min-h-screen w-full min-w-0 max-w-full bg-dtsc-page text-dtsc-ink">
      <PublicHeader />

      <header className="border-b border-dtsc-border bg-dtsc-surface">
        <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-12 sm:px-6 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-dtsc-blue">{copy.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-dtsc-muted sm:text-lg">{copy.intro}</p>
        </div>
      </header>

      {featured.length ? (
        <section aria-label={copy.featured} className="mx-auto w-full max-w-6xl min-w-0 px-4 pt-10 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{copy.featured}</h2>
            <span className="text-xs text-dtsc-muted">{copy.lastPublications}</span>
          </div>
          <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 border-b border-dtsc-border pb-9 md:grid-cols-3">
            {featured.map((publication) => (
              <Link key={publication.id} href={"/ressources/" + publication.slug}
                className="group block min-w-0 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-dtsc-blue">
                <p className="text-xs font-semibold uppercase tracking-wider text-dtsc-blue">{copy.categories[publication.category as keyof typeof copy.categories] || publication.category}</p>
                <h3 className="mt-3 break-words text-xl font-semibold leading-snug tracking-tight group-hover:text-dtsc-blue">{publication.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-dtsc-muted">{publication.excerpt}</p>
                <p className="mt-3 text-xs text-dtsc-muted">{dateFormat.format(publication.publishedAt || publication.createdAt)}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-6xl min-w-0 px-4 py-10 sm:px-6" aria-label={copy.catalog}>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.catalog}</h2>
          <span className="text-sm text-dtsc-muted">{totalPublished} {copy.published}</span>
        </div>

        <nav className="mt-6 flex w-full max-w-full gap-2 overflow-x-auto pb-3" data-horizontal-rail aria-label={copy.filterByCategory}>
          <Link href={resourceUrl({ q, order })} aria-current={!category ? "page" : undefined}
            className={!category
              ? "shrink-0 rounded-full bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white"
              : "shrink-0 rounded-full border border-dtsc-border px-4 py-2 text-sm font-medium text-dtsc-ink hover:bg-dtsc-soft"}>
            {copy.all} <span className="ml-1 opacity-70">{totalPublished}</span>
          </Link>
          {categories.map((code) => (
            <Link key={code} href={resourceUrl({ q, category: code === category ? "" : code, order })}
              aria-current={category === code ? "page" : undefined}
              className={category === code
                ? "shrink-0 rounded-full bg-dtsc-blue px-4 py-2 text-sm font-semibold text-white"
                : "shrink-0 rounded-full border border-dtsc-border px-4 py-2 text-sm font-medium text-dtsc-ink hover:bg-dtsc-soft"}>
              {copy.categories[code]} <span className="ml-1 opacity-70">{totals.get(code) || 0}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-4">
          <form action="/ressources" method="get" role="search" className="flex min-w-0 w-full max-w-lg items-center gap-2">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            {order === "oldest" ? <input type="hidden" name="order" value="oldest" /> : null}
            <label htmlFor="resource-query" className="sr-only">{copy.searchLabel}</label>
            <input id="resource-query" name="q" type="search" maxLength={80}
              defaultValue={q} placeholder={copy.searchPlaceholder}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm text-dtsc-ink outline-offset-2 focus-visible:outline-dtsc-blue" />
            <button type="submit" aria-label={copy.searchLabel}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-dtsc-blue px-4 text-sm font-semibold text-white hover:opacity-90">
              <Search className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{copy.search}</span>
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm" aria-label={copy.sortLabel}>
            <span className="text-dtsc-muted">{copy.sortLabel}</span>
            <Link href={resourceUrl({ q, category })} aria-current={order === "recent" ? "page" : undefined}
              className={order === "recent" ? "font-semibold text-dtsc-blue underline underline-offset-4" : "text-dtsc-muted hover:text-dtsc-blue"}>
              {copy.newest}
            </Link>
            <span aria-hidden="true" className="text-dtsc-muted">·</span>
            <Link href={resourceUrl({ q, category, order: "oldest" })} aria-current={order === "oldest" ? "page" : undefined}
              className={order === "oldest" ? "font-semibold text-dtsc-blue underline underline-offset-4" : "text-dtsc-muted hover:text-dtsc-blue"}>
              {copy.oldest}
            </Link>
          </div>
        </div>

        <p className="mt-7 text-sm text-dtsc-muted" role="status">{total} {total === 1 ? copy.result : copy.results}</p>
        {publications.length ? (
          <div className="mt-2 divide-y divide-dtsc-border">
            {publications.map((publication) => (
              <Link key={publication.id} href={"/ressources/" + publication.slug}
                className="group flex min-w-0 flex-col gap-3 py-6 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-dtsc-blue sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-dtsc-blue">
                    {copy.categories[publication.category as keyof typeof copy.categories] || publication.category}
                  </p>
                  <h3 className="mt-2 break-words text-xl font-semibold leading-snug group-hover:text-dtsc-blue sm:text-2xl">{publication.title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-dtsc-muted">{publication.excerpt}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-dtsc-muted">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {dateFormat.format(publication.publishedAt || publication.createdAt)}
                    {publication.author?.publicProfileConsent ? " · " + publication.author.name : ""}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-dtsc-blue">
                  {copy.read} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-8 border-t border-dtsc-border py-10">
            <h3 className="text-xl font-semibold">{copy.emptyTitle}</h3>
            <p className="mt-2 max-w-lg text-sm leading-7 text-dtsc-muted">{copy.emptyDescription}</p>
            {hasFilters ? <Link href="/ressources" className="mt-4 inline-flex text-sm font-semibold text-dtsc-blue underline underline-offset-4">{copy.reset}</Link> : null}
            <Link href="/services" className="mt-4 ml-4 inline-flex text-sm font-semibold text-dtsc-blue underline underline-offset-4">{copy.services}</Link>
          </div>
        )}

        {totalPages > 1 ? (
          <nav aria-label={copy.pagination} className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-dtsc-border pt-6">
            {page > 1 ? (
              <Link href={resourceUrl({ ...baseFilters, page: page - 1 })} rel="prev"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-dtsc-blue hover:underline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.previous}
              </Link>
            ) : <span />}
            <span className="text-sm text-dtsc-muted">{copy.page} {page} / {totalPages}</span>
            {page < totalPages ? (
              <Link href={resourceUrl({ ...baseFilters, page: page + 1 })} rel="next"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-dtsc-blue hover:underline">
                {copy.next}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </section>
      <PublicFooter />
    </main>
  );
}
