"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupportTicket, User } from "@prisma/client";
import { Button } from "@/components/ui/button";

type TicketWithUser = SupportTicket & { user?: Pick<User, "name" | "email"> };

export function TicketBoard({ tickets, canManage = false }: { tickets: TicketWithUser[]; canManage?: boolean }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState("");

  async function resolveTicket(event: React.FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault();
    setActiveId(ticketId);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setActiveId("");
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {tickets.map((ticket) => (
        <article key={ticket.id} className="dtsc-card p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted">
                {ticket.user?.email || "Utilisateur"} · {ticket.priority}
              </p>
              <h3 className="mt-1 font-black text-dtsc-ink">{ticket.subject}</h3>
              <p className="mt-2 text-sm leading-6 text-dtsc-muted">{ticket.description}</p>
              {ticket.resolution && (
                <p className="mt-3 rounded-xl bg-dtsc-soft p-3 text-sm font-semibold text-dtsc-blue">
                  Résolution: {ticket.resolution}
                </p>
              )}
            </div>
            <span className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">{ticket.status}</span>
          </div>
          {canManage && (
            <form onSubmit={(event) => resolveTicket(event, ticket.id)} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
              <select name="status" defaultValue={ticket.status} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <input name="resolution" defaultValue={ticket.resolution || ""} placeholder="Note de résolution visible par l'utilisateur" className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink" />
              <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" disabled={activeId === ticket.id}>
                {activeId === ticket.id ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </form>
          )}
        </article>
      ))}
      {!tickets.length && <p className="dtsc-card p-6 text-sm text-dtsc-muted">Aucun ticket à afficher.</p>}
    </div>
  );
}
