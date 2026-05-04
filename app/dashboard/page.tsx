import Link from "next/link";
import { Bot, Clock, MessageSquare, Plus, Ticket } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const [conversationCount, messageCount, recentConversations] = await Promise.all([
    prisma.conversation.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { userId: user.id } } }),
    prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  const lastActivity = recentConversations[0]?.updatedAt;

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <p className="text-sm text-cyan-200">Bienvenue, {user.name}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Espace client DTSC</h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            Pilotez vos échanges IA, retrouvez l&apos;historique de vos conversations et contactez l&apos;équipe DTSC pour les sujets nécessitant un accompagnement humain.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="/chat">
                <Plus className="h-4 w-4" />
                Nouvelle conversation
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">
              <Link href="/support">Contacter l&apos;équipe DTSC</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Conversations" value={conversationCount} helper="Historique client" icon={Bot} />
          <StatCard label="Messages" value={messageCount} helper="Messages échangés" icon={MessageSquare} />
          <StatCard label="Dernière activité" value={lastActivity ? formatDate(lastActivity) : "Aucune"} helper="Activité récente" icon={Clock} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Conversations récentes</h2>
            <div className="mt-4 divide-y divide-white/10">
              {recentConversations.length ? (
                recentConversations.map((conversation) => (
                  <Link key={conversation.id} href={`/chat?conversationId=${conversation.id}`} className="flex items-center justify-between py-4 text-sm hover:text-cyan-200">
                    <span>{conversation.title}</span>
                    <span className="text-slate-500">{conversation._count.messages} messages</span>
                  </Link>
                ))
              ) : (
                <p className="py-8 text-sm text-slate-400">Aucune conversation pour le moment.</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-cyan-400 p-6 text-slate-950">
            <Ticket className="h-6 w-6" />
            <h2 className="mt-4 font-semibold">Besoin d&apos;un cadrage humain ?</h2>
            <p className="mt-2 text-sm text-slate-800">
              Créez un ticket pour une demande commerciale, technique ou stratégique.
            </p>
            <Button asChild className="mt-5 bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/support">Créer une demande</Link>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
