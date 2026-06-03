"use client";

import Link from "next/link";
import { useState } from "react";
import type { TicketPriority, TicketStatus, UserRole, UserStatus } from "@prisma/client";
import { ListControls } from "@/components/ui/list-controls";
import { UserLimitsForm } from "@/components/admin/user-limits-form";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserStatusSelect } from "@/components/admin/user-status-select";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

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
const userTableColumns = [
  { key: "name", label: "Nom", width: 220, minWidth: 160 },
  { key: "email", label: "Email", width: 300, minWidth: 220 },
  { key: "role", label: "Rôle", width: 190, minWidth: 160 },
  { key: "status", label: "Statut", width: 180, minWidth: 150 },
  { key: "limits", label: "Limites / jour", width: 360, minWidth: 280 },
  { key: "conversations", label: "Conversations", width: 150, minWidth: 130 },
  { key: "createdAt", label: "Créé le", width: 170, minWidth: 140 },
] as const;
type UserTableColumnKey = (typeof userTableColumns)[number]["key"];
const defaultUserColumnWidths = Object.fromEntries(userTableColumns.map((column) => [column.key, column.width])) as Record<UserTableColumnKey, number>;

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
  showUsers = true,
  showActivity = true,
  canManageUsers = true,
}: {
  users: ManagedUser[];
  conversations: AdminConversation[];
  tickets: AdminTicket[];
  showUsers?: boolean;
  showActivity?: boolean;
  canManageUsers?: boolean;
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
  const [userColumnWidths, setUserColumnWidths] = useState<Record<UserTableColumnKey, number>>(defaultUserColumnWidths);
  const userTableWidth = userTableColumns.reduce((sum, column) => sum + userColumnWidths[column.key], 0);

  function beginUserColumnResize(columnKey: UserTableColumnKey, startX: number) {
    const column = userTableColumns.find((item) => item.key === columnKey);
    if (!column) {
      return;
    }
    const startWidth = userColumnWidths[columnKey];
    const move = (moveEvent: MouseEvent | TouchEvent) => {
      const nextX = "touches" in moveEvent ? moveEvent.touches[0]?.clientX : moveEvent.clientX;
      if (typeof nextX !== "number") {
        return;
      }
      const nextWidth = Math.max(column.minWidth, startWidth + nextX - startX);
      setUserColumnWidths((current) => ({ ...current, [columnKey]: nextWidth }));
    };
    const stop = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", stop);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", stop);
  }

  return (
    <>
      {showUsers && (
        <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-black text-dtsc-ink">Utilisateurs et RBAC</h2>
              <p className="text-sm text-dtsc-muted">Modifiez les rôles et suspendez les accès sans intervention technique.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin?section=users" className="rounded-full border border-dtsc-border px-3 py-1.5 font-bold text-dtsc-muted hover:bg-dtsc-soft">
                Tous
              </Link>
              {userRoles.map((userRole) => (
                <Link
                  key={userRole}
                  href={`/admin?section=users&role=${userRole}`}
                  className="rounded-full border border-dtsc-border px-3 py-1.5 font-bold text-dtsc-muted hover:bg-dtsc-soft"
                >
                  {formatEnumLabel(userRole)}
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
          <p className="mt-3 text-xs font-semibold text-dtsc-muted">Faites défiler horizontalement et tirez le bord droit d&apos;un en-tête pour ajuster une colonne.</p>
          <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-dtsc-border">
            <table className="text-left text-sm" style={{ minWidth: userTableWidth, width: userTableWidth, tableLayout: "fixed" }}>
              <colgroup>
                {userTableColumns.map((column) => (
                  <col key={column.key} style={{ width: userColumnWidths[column.key] }} />
                ))}
              </colgroup>
              <thead className="text-dtsc-muted">
                <tr>
                  {userTableColumns.map((column) => (
                    <th key={column.key} className="relative select-none border-b border-dtsc-border bg-dtsc-page px-3 py-3 align-middle">
                      <span className="block truncate pr-3">{column.label}</span>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner ${column.label}`}
                        tabIndex={0}
                        onMouseDown={(mouseEvent) => {
                          mouseEvent.preventDefault();
                          beginUserColumnResize(column.key, mouseEvent.clientX);
                        }}
                        onTouchStart={(touchEvent) => {
                          const firstTouch = touchEvent.touches[0];
                          if (firstTouch) {
                            beginUserColumnResize(column.key, firstTouch.clientX);
                          }
                        }}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight") {
                            return;
                          }
                          keyboardEvent.preventDefault();
                          setUserColumnWidths((current) => ({
                            ...current,
                            [column.key]: Math.max(column.minWidth, current[column.key] + (keyboardEvent.key === "ArrowRight" ? 24 : -24)),
                          }));
                        }}
                        className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none border-r border-transparent hover:border-cyan-400"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dtsc-border text-dtsc-muted">
                {userList.paginatedItems.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td className="truncate px-3 py-3 font-bold text-dtsc-ink" title={managedUser.name}>{managedUser.name}</td>
                    <td className="truncate px-3 py-3" title={managedUser.email}>{managedUser.email}</td>
                    <td className="px-3 py-3">{canManageUsers ? <UserRoleSelect userId={managedUser.id} role={managedUser.role} /> : formatEnumLabel(managedUser.role)}</td>
                    <td className="px-3 py-3">{canManageUsers ? <UserStatusSelect userId={managedUser.id} status={managedUser.status} /> : formatEnumLabel(managedUser.status)}</td>
                    <td className="px-3 py-3">
                      {canManageUsers ? (
                        <UserLimitsForm
                          userId={managedUser.id}
                          dailyMessageLimit={managedUser.dailyMessageLimit}
                          dailyTokenLimit={managedUser.dailyTokenLimit}
                        />
                      ) : (
                        <span className="whitespace-nowrap">{managedUser.dailyMessageLimit} msg · {managedUser.dailyTokenLimit} tokens</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{managedUser._count.conversations}</td>
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(managedUser.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!userList.filteredCount && <p className="py-6 text-sm text-dtsc-muted">Aucun utilisateur ne correspond à votre recherche.</p>}
          </div>
        </section>
      )}

      {showActivity && (
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
                    {ticket.user.email} · {formatEnumLabel(ticket.status)} · {formatEnumLabel(ticket.priority)}
                  </p>
                </div>
              ))}
              {!ticketList.filteredCount && <p className="py-4 text-sm text-dtsc-muted">Aucun ticket trouvé.</p>}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
