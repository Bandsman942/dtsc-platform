import Link from "next/link";
import { Bot, Clock, MessageSquare, Plus, Target, Ticket } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { dtsc } from "@/lib/dtsc";

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
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Bienvenue, {user.name}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Espace client DTSC</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Pilotez vos échanges IA, structurez vos besoins en data, BI, IA, marketing digital ou solutions numériques, puis créez un ticket lorsqu&apos;un cadrage humain est nécessaire.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <Link href="/chat">
                <Plus className="h-4 w-4" />
                Nouvelle conversation
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
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
          <div className="dtsc-card p-6">
            <h2 className="font-black text-dtsc-ink">Conversations récentes</h2>
            <div className="mt-4 divide-y divide-dtsc-border">
              {recentConversations.length ? (
                recentConversations.map((conversation) => (
                  <Link key={conversation.id} href={`/chat?conversationId=${conversation.id}`} className="flex items-center justify-between py-4 text-sm text-dtsc-muted hover:text-dtsc-blue">
                    <span className="font-medium">{conversation.title}</span>
                    <span className="text-slate-500">{conversation._count.messages} messages</span>
                  </Link>
                ))
              ) : (
                <p className="py-8 text-sm text-slate-400">Aucune conversation pour le moment.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-dtsc-border bg-dtsc-soft p-6 text-dtsc-ink shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
            <Ticket className="h-6 w-6" />
            <h2 className="mt-4 font-bold">Besoin d&apos;un cadrage humain ?</h2>
            <p className="mt-2 text-sm text-dtsc-muted">
              Créez un ticket pour une demande commerciale, technique ou stratégique.
            </p>
            <Button asChild className="mt-5 rounded-xl bg-[#001736] text-white hover:bg-[#002b5b]">
              <Link href="/support">Créer une demande</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dtsc.targets.map((target) => (
            <div key={target} className="dtsc-card flex items-center gap-3 p-4">
              <Target className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-dtsc-muted">Marché cible</p>
                <p className="font-black text-dtsc-ink">{target}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
