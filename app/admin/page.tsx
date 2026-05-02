import { BarChart3, Bot, MessageSquare, Users } from "lucide-react";
import { UserRole } from "@prisma/client";
import Link from "next/link";
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
  const [users, conversations, messageCount, usageLogs, tickets] = await Promise.all([
    prisma.user.findMany({
      where: roleFilter ? { role: roleFilter } : undefined,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { conversations: true } } },
      take: 50,
    }),
    prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: true, _count: { select: { messages: true } } },
      take: 25,
    }),
    prisma.message.count(),
    prisma.usageLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.supportTicket.findMany({ orderBy: { createdAt: "desc" }, include: { user: true }, take: 20 }),
  ]);

  const totalTokens = usageLogs.reduce((sum, log) => sum + log.totalTokens, 0);

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section>
          <p className="text-sm text-cyan-200">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Pilotage DTSC Chatbot</h1>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Utilisateurs" value={users.length} helper="Comptes suivis" icon={Users} />
          <StatCard label="Conversations" value={conversations.length} helper="Dernières conversations" icon={Bot} />
          <StatCard label="Messages" value={messageCount} helper="Total messages" icon={MessageSquare} />
          <StatCard label="Tokens" value={totalTokens} helper="Usage estimé" icon={BarChart3} />
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h2 className="font-semibold text-white">Utilisateurs</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin" className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/10">
                Tous
              </Link>
              {Object.values(UserRole).map((userRole) => (
                <Link
                  key={userRole}
                  href={`/admin?role=${userRole}`}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/10"
                >
                  {userRole}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-3">Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Conversations</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td className="py-3 text-white">{managedUser.name}</td>
                    <td>{managedUser.email}</td>
                    <td>{managedUser.role}</td>
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
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Conversations récentes</h2>
            <div className="mt-4 divide-y divide-white/10 text-sm">
              {conversations.map((conversation) => (
                <div key={conversation.id} className="py-3">
                  <p className="text-white">{conversation.title}</p>
                  <p className="text-slate-500">
                    {conversation.user.email} · {conversation._count.messages} messages
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
            <h2 className="font-semibold text-white">Tickets support</h2>
            <div className="mt-4 divide-y divide-white/10 text-sm">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="py-3">
                  <p className="text-white">{ticket.subject}</p>
                  <p className="text-slate-500">
                    {ticket.user.email} · {ticket.status} · {ticket.priority}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
