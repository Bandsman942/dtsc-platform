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
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/10 bg-white/[0.04] p-6">
      <Input name="subject" placeholder="Objet de la demande" required />
      <textarea
        name="description"
        placeholder="Décrivez votre besoin, contexte ou urgence."
        className="min-h-36 w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        required
      />
      <select name="priority" className="h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm">
        <option value="MEDIUM">Priorité normale</option>
        <option value="HIGH">Priorité haute</option>
        <option value="URGENT">Urgent</option>
        <option value="LOW">Faible</option>
      </select>
      {message && <p className="text-sm text-cyan-200">{message}</p>}
      <Button className="bg-cyan-400 text-slate-950 hover:bg-cyan-300" disabled={isPending}>
        {isPending ? "Envoi..." : "Créer un ticket"}
      </Button>
    </form>
  );
}
