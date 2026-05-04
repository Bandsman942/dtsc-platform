import { BarChart3, Bot, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import Link from "next/link";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserStatusSelect } from "@/components/admin/user-status-select";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requireRole([UserRole.ADMIN]);
  const { role } = await searchParams;
  const roleFilter =
    role && Object.values(UserRole).includes(role as UserRole)
      ? (role as UserRole)
      : undefined;

  const [users, userCount, conversationCount, conversations, messageCount, usageLogs, tickets] =
    await Promise.all([
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
    ]);

  const totalTokens = usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);

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
                    <td>{managedUser._count.conversations}</td>
                    <td>{formatDate(managedUser.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
