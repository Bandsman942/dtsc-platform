import { BarChart3, Bot, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import { AdminDataTables } from "@/components/admin/admin-data-tables";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { SiteVisitsChart, type VisitPoint } from "@/components/admin/site-visits-chart";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

function isUserRole(value: string | undefined): value is UserRole {
  return value === UserRole.ADMIN || value === UserRole.MANAGER || value === UserRole.CLIENT || value === UserRole.SUPPORT;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; period?: string; date?: string }>;
}) {
  const user = await requireRole([UserRole.ADMIN]);
  const { role, period, date } = await searchParams;
  const parsedPeriod = Number(period || 30);
  const selectedPeriod = Number.isFinite(parsedPeriod) ? parsedPeriod : 30;
  const selectedDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const visitStart = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const visitEnd = selectedDate ? new Date(`${selectedDate}T23:59:59`) : new Date();
  if (!selectedDate) {
    visitStart.setDate(visitStart.getDate() - Math.min(Math.max(selectedPeriod, 7), 200));
  }
  const roleFilter = isUserRole(role) ? role : undefined;

  const [settings, users, userCount, conversationCount, conversations, messageCount, usageLogs, tickets, visits] =
    await Promise.all([
      getAppSettings(),
      prisma.user.findMany({
        where: roleFilter ? { role: roleFilter } : undefined,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { conversations: true } } },
        take: 200,
      }),
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: { user: true, _count: { select: { messages: true } } },
        take: 200,
      }),
      prisma.message.count(),
      prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 200,
      }),
      prisma.siteVisit.findMany({
        where: { createdAt: { gte: visitStart, lte: visitEnd } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

  const totalTokens = usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);
  const chartLength = selectedDate ? 1 : Math.min(selectedPeriod, 60);
  const visitPoints: VisitPoint[] = Array.from({ length: chartLength }).map((_, index) => {
    const day = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    if (!selectedDate) {
      day.setDate(day.getDate() - (chartLength - 1 - index));
    }
    const dateKey = day.toISOString().slice(0, 10);
    const count = visits.filter((visit) => new Date(visit.createdAt).toISOString().slice(0, 10) === dateKey).length;
    return {
      date: dateKey,
      label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      count,
    };
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Administration</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Pilotage DTSC Platform</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Supervisez les utilisateurs, les rôles RBAC, les conversations, les tickets support et l&apos;usage IA.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Utilisateurs" value={userCount} helper="Comptes suivis" icon={Users} />
          <StatCard label="Conversations" value={conversationCount} helper="Total plateforme" icon={Bot} />
          <StatCard label="Messages" value={messageCount} helper="Total messages" icon={MessageSquare} />
          <StatCard label="Tokens" value={totalTokens} helper="Usage estimé" icon={BarChart3} />
        </section>

        <AdminSettingsPanel
          settings={{
            defaultDailyMessageLimit: settings.defaultDailyMessageLimit,
            defaultDailyTokenLimit: settings.defaultDailyTokenLimit,
            chatbotEnabled: settings.chatbotEnabled,
            maintenanceMode: settings.maintenanceMode,
            supportAutoCloseDays: settings.supportAutoCloseDays,
            allowClientAnnouncements: settings.allowClientAnnouncements,
            commentEditWindowMinutes: settings.commentEditWindowMinutes,
            notificationRetentionDays: settings.notificationRetentionDays,
          }}
        />

        <section className="dtsc-card p-6">
          <div className="mb-5">
            <h2 className="font-black text-dtsc-ink">Créer un compte utilisateur</h2>
            <p className="text-sm text-dtsc-muted">L&apos;admin peut créer un compte avec n&apos;importe quel rôle et définir les limites journalières.</p>
          </div>
          <CreateUserForm />
        </section>

        <SiteVisitsChart points={visitPoints} selectedPeriod={selectedPeriod} selectedDate={selectedDate} />

        <AdminDataTables
          users={JSON.parse(JSON.stringify(users))}
          conversations={JSON.parse(JSON.stringify(conversations))}
          tickets={JSON.parse(JSON.stringify(tickets))}
        />

        <section className="rounded-2xl border border-dtsc-border bg-[#001736] p-6 text-white">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <div>
              <h2 className="font-black">Politique RBAC active</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                ADMIN supervise la plateforme, MANAGER prépare la supervision métier, SUPPORT traite les tickets et CLIENT utilise le chatbot et son espace privé.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
