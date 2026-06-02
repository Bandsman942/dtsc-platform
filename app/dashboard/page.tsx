import Link from "next/link";
import { Activity as ActivityIcon, BarChart3, Bot, BriefcaseBusiness, Clock, FileText, MessageSquare, Plus, Target, Ticket } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { getSession, requireUser } from "@/lib/auth";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { dtsc } from "@/lib/dtsc";
import { getSupportUrl } from "@/lib/domains";

export default async function DashboardPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const [conversationCount, messageCount, recentConversations, profile, activityCount, documentCount, readyDocumentCount, usageToday] = await Promise.all([
    prisma.conversation.count({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.message.count({ where: { conversation: { userId: user.id, organizationId: activeOrganizationId } } }),
    prisma.conversation.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.companyProfile.findFirst({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.companyActivity.count({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.knowledgeDocument.count({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.knowledgeDocument.count({ where: { userId: user.id, organizationId: activeOrganizationId, status: "READY" } }),
    prisma.usageLog.aggregate({
      where: {
        userId: user.id,
        organizationId: activeOrganizationId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      _sum: { totalTokens: true },
    }),
  ]);

  const lastActivity = recentConversations[0]?.updatedAt;

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Bienvenue, {user.name}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Espace client DTSC</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Pilotez vos échanges IA, structurez vos besoins en data, BI, IA, marketing digital ou solutions numériques, puis créez un ticket lorsqu&apos;un cadrage humain est nécessaire.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild title="Démarrer un échange avec le chatbot DTSC." className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/chat">
                <Plus className="h-4 w-4" />
                Nouvelle conversation
              </Link>
            </Button>
            <Button asChild variant="outline" title="Créer un ticket pour une demande commerciale, technique ou stratégique." className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href={getSupportUrl("/support")}>Contacter l&apos;équipe DTSC</Link>
            </Button>
            <Button asChild variant="outline" title="Renseigner votre entreprise pour personnaliser le chatbot." className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/company">Compléter mon entreprise</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Conversations" value={conversationCount} helper="Historique client" icon={Bot} title="Nombre total de conversations ouvertes avec le chatbot." />
          <StatCard label="Messages" value={messageCount} helper="Messages échangés" icon={MessageSquare} title="Volume total de messages dans vos conversations." />
          <StatCard label="Dernière activité" value={lastActivity ? formatDate(lastActivity) : "Aucune"} helper="Activité récente" icon={Clock} title="Dernière conversation mise à jour." />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Profil entreprise" value={profile ? "Actif" : "À compléter"} helper={profile?.organizationName || "Aucun contexte entreprise"} icon={BriefcaseBusiness} title="Indique si le chatbot dispose déjà de votre profil entreprise." />
          <StatCard label="Activités métier" value={activityCount} helper="Activités contextualisées" icon={ActivityIcon} title="Nombre d'activités professionnelles utilisées pour personnaliser le chatbot." />
          <StatCard label="Documents prêts" value={`${readyDocumentCount}/${documentCount}`} helper="Base documentaire privée" icon={FileText} title="Documents indexés et exploitables par le chatbot." />
          <StatCard label="Tokens aujourd'hui" value={usageToday._sum.totalTokens || 0} helper="Usage IA journalier" icon={BarChart3} title="Volume de tokens consommés aujourd'hui dans vos échanges." />
        </section>

        <Accordion>
          <AccordionItem title="Résumé du contexte professionnel" defaultOpen>
            <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">KPI entreprise</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Organisation", profile?.organizationName || "Non renseignée"],
                    ["Secteur", profile?.sector || "Non renseigné"],
                    ["Poste", profile?.userPosition || "Non renseigné"],
                    ["Département", profile?.department || "Non renseigné"],
                    ["Objectifs", profile?.goals || "À préciser dans le module Entreprise"],
                    ["KPI", profile?.kpis || "À préciser dans le module Entreprise"],
                  ].map(([label, value]) => (
                    <div key={label} title={`Information entreprise: ${label}`} className="rounded-xl border border-dtsc-border bg-dtsc-page p-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
                      <p className="mt-2 line-clamp-3 text-sm font-bold leading-6 text-dtsc-ink">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-dtsc-border bg-[#001736] p-5 text-white">
                <BriefcaseBusiness className="h-6 w-6 text-cyan-300" />
                <h2 className="mt-4 font-black">Personnalisation chatbot</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Plus votre profil entreprise, vos activités et vos documents sont complets, plus les réponses du chatbot peuvent être adaptées à votre métier, vos objectifs et vos contraintes.
                </p>
                <Button asChild className="mt-5 rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300" title="Ouvrir le module Entreprise.">
                  <Link href="/company">Améliorer mon contexte</Link>
                </Button>
              </div>
            </section>
          </AccordionItem>

          <AccordionItem title="Conversations récentes">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
                <div className="divide-y divide-dtsc-border">
                  {recentConversations.length ? (
                    recentConversations.map((conversation) => (
                      <Link key={conversation.id} href={`/chat?conversationId=${conversation.id}`} className="flex items-center justify-between gap-3 py-4 text-sm text-dtsc-muted hover:text-dtsc-blue">
                        <span className="min-w-0 truncate font-medium">{conversation.title}</span>
                        <span className="shrink-0 text-slate-500">{conversation._count.messages} messages</span>
                      </Link>
                    ))
                  ) : (
                    <p className="py-8 text-sm text-slate-400">Aucune conversation pour le moment.</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-5 text-dtsc-ink shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
                <Ticket className="h-6 w-6" />
                <h2 className="mt-4 font-bold">Besoin d&apos;un cadrage humain ?</h2>
                <p className="mt-2 text-sm text-dtsc-muted">
                  Créez un ticket pour une demande commerciale, technique ou stratégique.
                </p>
                <Button asChild className="mt-5 rounded-xl bg-[#001736] text-white hover:bg-[#002b5b]">
                  <Link href={getSupportUrl("/support")}>Créer une demande</Link>
                </Button>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem title="Marchés cibles DTSC">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {dtsc.targets.map((target) => (
                <div key={target} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 flex items-center gap-3">
                  <Target className="h-5 w-5 text-cyan-500" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-dtsc-muted">Marché cible</p>
                    <p className="font-black text-dtsc-ink">{target}</p>
                  </div>
                </div>
              ))}
            </div>
          </AccordionItem>
        </Accordion>
      </div>
    </AppShell>
  );
}
