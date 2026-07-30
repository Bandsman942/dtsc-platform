import Link from "next/link";
import { Activity as ActivityIcon, BarChart3, Bot, BriefcaseBusiness, Clock, FileText, MessageSquare, Plus, Target, Ticket } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
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
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={`Bienvenue, ${user.name}`}
          title="Espace client DTSC"
          description="Pilotez vos échanges IA, structurez vos besoins en data, BI, IA, marketing digital ou solutions numériques, puis créez un ticket lorsqu’un cadrage humain est nécessaire."
          primaryAction={(
            <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/chat"><Plus className="h-4 w-4" />Nouvelle conversation</Link>
            </Button>
          )}
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href={getSupportUrl("/support")}>Contacter DTSC</Link>
            </Button>
          )}
        />

        <ModuleMetrics label="Indicateurs du tableau de bord">
          <ModuleMetric label="Conversations" value={conversationCount} hint={<span className="inline-flex items-center gap-1"><Bot className="h-3.5 w-3.5" />Historique client</span>} />
          <ModuleMetric label="Messages" value={messageCount} hint={<span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />Messages échangés</span>} />
          <ModuleMetric label="Dernière activité" value={lastActivity ? formatDate(lastActivity) : "Aucune"} hint={<span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Activité récente</span>} />
          <ModuleMetric label="Profil entreprise" value={profile ? "Actif" : "À compléter"} hint={<span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{profile?.organizationName || "Contexte absent"}</span>} />
          <ModuleMetric label="Activités métier" value={activityCount} hint={<span className="inline-flex items-center gap-1"><ActivityIcon className="h-3.5 w-3.5" />Contexte professionnel</span>} />
          <ModuleMetric label="Documents prêts" value={`${readyDocumentCount}/${documentCount}`} hint={<span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Base privée</span>} />
          <ModuleMetric label="Tokens aujourd’hui" value={usageToday._sum.totalTokens || 0} hint={<span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Usage IA</span>} />
        </ModuleMetrics>

        <ModuleContent>
          <ModuleSection title="Actions rapides" description="Démarrez un échange, complétez votre entreprise ou demandez un accompagnement humain.">
            <div data-responsive-actions className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:flex sm:flex-wrap">
              <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <Link href="/company">Compléter mon entreprise</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                <Link href={getSupportUrl("/support")}><Ticket className="h-4 w-4" />Créer une demande</Link>
              </Button>
            </div>
          </ModuleSection>

          <Accordion>
            <AccordionItem title="Résumé du contexte professionnel" defaultOpen>
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <BusinessList ariaLabel="Contexte professionnel">
                  {[
                    ["Organisation", profile?.organizationName || "Non renseignée"],
                    ["Secteur", profile?.sector || "Non renseigné"],
                    ["Poste", profile?.userPosition || "Non renseigné"],
                    ["Département", profile?.department || "Non renseigné"],
                    ["Objectifs", profile?.goals || "À préciser dans le module Entreprise"],
                    ["KPI", profile?.kpis || "À préciser dans le module Entreprise"],
                  ].map(([label, value]) => <BusinessListItem key={label} title={label} description={value} />)}
                </BusinessList>
                <div className="min-w-0 rounded-2xl bg-[#001736] p-5 text-white">
                  <BriefcaseBusiness className="h-6 w-6 text-cyan-300" />
                  <h2 className="mt-4 font-black">Personnalisation chatbot</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Plus votre profil entreprise, vos activités et vos documents sont complets, plus les réponses du chatbot sont adaptées à votre métier.</p>
                  <Button asChild className="mt-5 rounded-xl bg-cyan-400 text-[#001736] hover:bg-cyan-300"><Link href="/company">Améliorer mon contexte</Link></Button>
                </div>
              </div>
            </AccordionItem>

            <AccordionItem title="Conversations récentes">
              {recentConversations.length ? (
                <BusinessList ariaLabel="Conversations récentes">
                  {recentConversations.map((conversation) => (
                    <BusinessListItem
                      key={conversation.id}
                      title={conversation.title}
                      description="Conversation privée DTSC"
                      status={<StatusBadge>{conversation._count.messages} messages</StatusBadge>}
                      actions={<Link href={`/chat?conversationId=${conversation.id}`} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Ouvrir</Link>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune conversation" description="Démarrez votre premier échange avec le chatbot DTSC." />}
            </AccordionItem>

            <AccordionItem title="Marchés cibles DTSC">
              <BusinessList ariaLabel="Marchés cibles DTSC">
                {dtsc.targets.map((target) => <BusinessListItem key={target} leading={<Target className="h-5 w-5 text-cyan-500" />} title={target} meta="Marché cible" />)}
              </BusinessList>
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
