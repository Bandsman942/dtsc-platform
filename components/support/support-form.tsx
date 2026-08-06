"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

export function SupportForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsPending(true);
    try {
      const response = await fetch("/api/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      if (!response.ok) { toastError("Impossible d’envoyer la demande."); return; }
      toastSuccess("Demande transmise à l’équipe DTSC.");
      form.reset();
      setOpen(false);
      router.refresh();
    } catch {
      toastError("Impossible d’envoyer la demande.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="dtsc-product-surface min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><h2 className="text-base font-semibold text-dtsc-ink">Créer un ticket support</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">Transmettez une demande contextualisée à DTSC.</p></div>
        <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-dtsc-blue text-white hover:bg-[var(--dtsc-brand-secondary-hover)]">Créer un ticket</Button>
      </div>
      <Dialog open={open} title="Créer un ticket support" description="Décrivez votre besoin avec assez de contexte pour permettre une réponse rapide et utile." onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <FormField label="Objet de la demande" hint="Résumez le sujet en une phrase claire."><Input name="subject" required /></FormField>
          <FormField label="Description détaillée" hint="Ajoutez le contexte, l’impact, les étapes déjà testées et les délais éventuels."><textarea name="description" className="min-h-44 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" required /></FormField>
          <FormField label="Priorité" hint="Choisissez l’urgence réelle."><select name="priority" className="h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="MEDIUM">Priorité normale</option><option value="HIGH">Priorité haute</option><option value="URGENT">Urgent</option><option value="LOW">Faible</option></select></FormField>
          <Button className="w-full rounded-xl bg-dtsc-blue text-white hover:bg-[var(--dtsc-brand-secondary-hover)] sm:w-fit" disabled={isPending}>{isPending ? "Envoi…" : "Créer le ticket support"}</Button>
        </form>
      </Dialog>
    </div>
  );
}
