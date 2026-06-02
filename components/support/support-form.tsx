"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export function SupportForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

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
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="dtsc-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black text-dtsc-ink">Créer un ticket support</h2>
          <p className="mt-1 text-sm text-dtsc-muted">Ouvrez un formulaire complet pour transmettre une demande contextualisée à DTSC.</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          Créer un ticket
        </Button>
      </div>
      {message && <p className="mt-3 text-sm font-bold text-dtsc-blue">{message}</p>}
      <Dialog open={open} title="Créer un ticket support" description="Décrivez votre besoin avec assez de contexte pour permettre une réponse DTSC rapide et utile." onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">
        <form onSubmit={submit} className="grid gap-4">
          <FormField label="Objet de la demande" hint="Résumez le sujet en une phrase claire.">
            <Input name="subject" placeholder="Exemple: difficulté de connexion à l'espace entreprise" required />
          </FormField>
          <FormField label="Description détaillée" hint="Ajoutez le contexte, l'impact, les étapes déjà testées et les délais éventuels.">
            <textarea
              name="description"
              placeholder="Décrivez votre besoin, contexte ou urgence."
              className="min-h-44 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              required
            />
          </FormField>
          <FormField label="Priorité" hint="Choisissez l'urgence réelle pour aider DTSC à prioriser le traitement.">
            <select name="priority" className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
              <option value="MEDIUM">Priorité normale</option>
              <option value="HIGH">Priorité haute</option>
              <option value="URGENT">Urgent</option>
              <option value="LOW">Faible</option>
            </select>
          </FormField>
          <Button className="w-fit rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" disabled={isPending}>
            {isPending ? "Envoi..." : "Créer le ticket support"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
