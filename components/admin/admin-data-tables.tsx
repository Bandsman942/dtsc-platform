"use client";

import Link from "next/link";
import type { TicketPriority, TicketStatus, UserRole, UserStatus } from "@prisma/client";
import { ListControls } from "@/components/ui/list-controls";
import { UserLimitsForm } from "@/components/admin/user-limits-form";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserStatusSelect } from "@/components/admin/user-status-select";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  role: UserRole;
  status: UserStatus;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
  createdAt: string;
  _count: { conversations: number };
};

type AdminConversation = {
  id: string;
  title: string;
  user: { email: string };
  _count: { messages: number };
};

type AdminTicket = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  user: { email: string };
};

const userRoles: UserRole[] = ["ADMIN", "MANAGER", "CLIENT", "SUPPORT"];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AdminDataTables({
  users,
  conversations,
  tickets,
}: {
  users: ManagedUser[];
  conversations: AdminConversation[];
  tickets: AdminTicket[];
}) {
  const userList = useSmartList({
    items: users,
    pageSize: 10,
    getSearchText: (user) => `${user.name} ${user.email} ${user.role} ${user.status} ${user.companyName || ""}`,
  });
  const conversationList = useSmartList({
    items: conversations,
    pageSize: 8,
    getSearchText: (conversation) => `${conversation.title} ${conversation.user.email} ${conversation._count.messages}`,
  });
  const ticketList = useSmartList({
    items: tickets,
    pageSize: 8,
    getSearchText: (ticket) => `${ticket.subject} ${ticket.user.email} ${ticket.status} ${ticket.priority}`,
  });

  return (
    <>
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
            {userRoles.map((userRole) => (
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
        <div className="mt-4">
          <ListControls
            query={userList.query}
            onQueryChange={userList.setQuery}
            page={userList.page}
            pageCount={userList.pageCount}
            totalCount={userList.totalCount}
            filteredCount={userList.filteredCount}
            placeholder="Rechercher par nom, email, rôle ou statut..."
            onPageChange={userList.setPage}
          />
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
              {userList.paginatedItems.map((managedUser) => (
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
          {!userList.filteredCount && <p className="py-6 text-sm text-dtsc-muted">Aucun utilisateur ne correspond à votre recherche.</p>}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="dtsc-card p-6">
          <h2 className="font-black text-dtsc-ink">Conversations récentes</h2>
          <div className="mt-4">
            <ListControls
              query={conversationList.query}
              onQueryChange={conversationList.setQuery}
              page={conversationList.page}
              pageCount={conversationList.pageCount}
              totalCount={conversationList.totalCount}
              filteredCount={conversationList.filteredCount}
              placeholder="Rechercher conversation ou email..."
              onPageChange={conversationList.setPage}
            />
          </div>
          <div className="mt-4 divide-y divide-dtsc-border text-sm">
            {conversationList.paginatedItems.map((conversation) => (
              <div key={conversation.id} className="py-3">
                <p className="font-bold text-dtsc-ink">{conversation.title}</p>
                <p className="text-dtsc-muted">
                  {conversation.user.email} · {conversation._count.messages} messages
                </p>
              </div>
            ))}
            {!conversationList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucune conversation trouvée.</p>}
          </div>
        </div>
        <div className="dtsc-card p-6">
          <h2 className="font-black text-dtsc-ink">Tickets support</h2>
          <div className="mt-4">
            <ListControls
              query={ticketList.query}
              onQueryChange={ticketList.setQuery}
              page={ticketList.page}
              pageCount={ticketList.pageCount}
              totalCount={ticketList.totalCount}
              filteredCount={ticketList.filteredCount}
              placeholder="Rechercher ticket, statut ou client..."
              onPageChange={ticketList.setPage}
            />
          </div>
          <div className="mt-4 divide-y divide-dtsc-border text-sm">
            {ticketList.paginatedItems.map((ticket) => (
              <div key={ticket.id} className="py-3">
                <p className="font-bold text-dtsc-ink">{ticket.subject}</p>
                <p className="text-dtsc-muted">
                  {ticket.user.email} · {ticket.status} · {ticket.priority}
                </p>
              </div>
            ))}
            {!ticketList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun ticket trouvé.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
