import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdministration, parseAdminRoleAccess } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import { CONSOLE_CAPABILITIES, getConsoleAccessDecision } from "@/lib/console/console-capabilities";
import { getDashboardUrl } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { sanitizeRichHtml } from "@/lib/rich-content";
import { getAppSettings } from "@/lib/settings";

export default async function PublicationPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) redirect(getDashboardUrl());
  const settings = await getAppSettings();
  const access = await getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.CONTENT_READ, adminRoleAccess: parseAdminRoleAccess(settings.adminRoleAccess) });
  if (!access.allowed) redirect("/admin/content");
  const { id } = await params;
  const publication = await prisma.publicPublication.findUnique({ where: { id }, include: { author: { select: { name: true, email: true } } } });
  if (!publication) notFound();
  return (
    <AppShell user={user}>
      <article className="mx-auto w-full max-w-4xl space-y-5 rounded-3xl border border-dtsc-border bg-dtsc-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black uppercase tracking-[0.14em] text-cyan-600">Prévisualisation protégée · {publication.locale}</p><h1 className="mt-2 text-3xl font-black text-dtsc-ink">{publication.title}</h1></div><Link href="/admin/content" className="rounded-xl border border-dtsc-border px-4 py-2 text-sm font-black">Retour au contenu</Link></div>
        <p className="text-lg leading-8 text-dtsc-muted">{publication.excerpt}</p>
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm font-bold text-dtsc-muted">{publication.status} · {publication.author?.name || publication.author?.email || "DTSC"} · /{publication.slug}</div>
        <div className="prose max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(publication.content) }} />
      </article>
    </AppShell>
  );
}
