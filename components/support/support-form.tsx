"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SupportForm() {
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage("");

    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsPending(false);
    setMessage(response.ok ? "Demande transmise à l'équipe DTSC." : "Impossible d'envoyer la demande.");
    if (response.ok) {
      event.currentTarget.reset();
    }
  }

  return (
    <details className="dtsc-card overflow-hidden p-0 lg:overflow-visible">
      <summary className="cursor-pointer list-none px-5 py-4 text-base font-black text-dtsc-ink [&::-webkit-details-marker]:hidden">
        Créer un ticket support
      </summary>
      <form onSubmit={submit} className="space-y-4 border-t border-dtsc-border p-5">
        <Input name="subject" placeholder="Objet de la demande" required />
        <textarea
          name="description"
          placeholder="Décrivez votre besoin, contexte ou urgence."
          className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          required
        />
        <select name="priority" className="h-10 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
          <option value="MEDIUM">Priorité normale</option>
          <option value="HIGH">Priorité haute</option>
          <option value="URGENT">Urgent</option>
          <option value="LOW">Faible</option>
        </select>
        {message && <p className="text-sm font-bold text-dtsc-blue">{message}</p>}
        <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" disabled={isPending}>
          {isPending ? "Envoi..." : "Créer un ticket"}
        </Button>
      </form>
    </details>
  );
}
