import { BarChart3, Bot, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserStatusSelect } from "@/components/admin/user-status-select";
import { UserLimitsForm } from "@/components/admin/user-limits-form";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { SiteVisitsChart, type VisitPoint } from "@/components/admin/site-visits-chart";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
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
        take: 50,
      }),
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: { user: true, _count: { select: { messages: true } } },
        take: 25,
      }),
      prisma.message.count(),
      prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 20,
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
          }}
          emails={users.map((managedUser) => managedUser.email)}
        />

        <section className="dtsc-card p-6">
          <div className="mb-5">
            <h2 className="font-black text-dtsc-ink">Créer un compte utilisateur</h2>
            <p className="text-sm text-dtsc-muted">L&apos;admin peut créer un compte avec n&apos;importe quel rôle et définir les limites journalières.</p>
          </div>
          <CreateUserForm />
        </section>

        <section className="dtsc-card p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-black text-dtsc-ink">Utilisateurs et RBAC</h2>
              <p className="text-sm text-dtsc-muted">Modifiez les rôles et suspendez les accès sans intervention technique.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin" className="rounded-full border border-dtsc-border px-3 py-1.5 font-bold text-dtsc-muted hover:bg-dtsc-soft">
                Tous
              </Link>
              {Object.values(UserRole).map((userRole) => (
                <Link
                  key={userRole}
                  href={`/admin?role=${userRole}`}
                  className="rounded-full border border-dtsc-border px-3 py-1.5 font-bold text-dtsc-muted hover:bg-dtsc-soft"
                >
                  {userRole}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-dtsc-muted">
                <tr>
                  <th className="py-3">Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Limites / jour</th>
                  <th>Conversations</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dtsc-border text-dtsc-muted">
                {users.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td className="py-3 font-bold text-dtsc-ink">{managedUser.name}</td>
                    <td>{managedUser.email}</td>
                    <td>
                      <UserRoleSelect userId={managedUser.id} role={managedUser.role} />
                    </td>
                    <td>
                      <UserStatusSelect userId={managedUser.id} status={managedUser.status} />
                    </td>
                    <td>
                      <UserLimitsForm
                        userId={managedUser.id}
                        dailyMessageLimit={managedUser.dailyMessageLimit}
                        dailyTokenLimit={managedUser.dailyTokenLimit}
                      />
                    </td>
                    <td>{managedUser._count.conversations}</td>
                    <td>{formatDate(managedUser.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <SiteVisitsChart points={visitPoints} selectedPeriod={selectedPeriod} selectedDate={selectedDate} />

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="dtsc-card p-6">
            <h2 className="font-black text-dtsc-ink">Conversations récentes</h2>
            <div className="mt-4 divide-y divide-dtsc-border text-sm">
              {conversations.map((conversation) => (
                <div key={conversation.id} className="py-3">
                  <p className="font-bold text-dtsc-ink">{conversation.title}</p>
                  <p className="text-dtsc-muted">
                    {conversation.user.email} · {conversation._count.messages} messages
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="dtsc-card p-6">
            <h2 className="font-black text-dtsc-ink">Tickets support</h2>
            <div className="mt-4 divide-y divide-dtsc-border text-sm">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="py-3">
                  <p className="font-bold text-dtsc-ink">{ticket.subject}</p>
                  <p className="text-dtsc-muted">
                    {ticket.user.email} · {ticket.status} · {ticket.priority}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

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
