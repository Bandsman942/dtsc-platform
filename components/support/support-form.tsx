"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/client-toast";

type AiAction = "REWRITE" | "PROFESSIONAL" | "SHORTEN" | "FRIENDLY" | "PROPOSE_REPLY" | "SUMMARY" | "NEXT_ACTIONS" | "TITLE";
const aiActions: Array<{ action: AiAction; fr: string; en: string }> = [
  { action: "REWRITE", fr: "Reformuler", en: "Rewrite" },
  { action: "PROFESSIONAL", fr: "Professionnaliser", en: "Professional" },
  { action: "SHORTEN", fr: "Raccourcir", en: "Shorten" },
  { action: "FRIENDLY", fr: "Clarifier", en: "Clarify" },
  { action: "PROPOSE_REPLY", fr: "Proposer une rédaction", en: "Propose draft" },
  { action: "SUMMARY", fr: "Résumer", en: "Summarize" },
  { action: "NEXT_ACTIONS", fr: "Étapes à vérifier", en: "Next steps" },
  { action: "TITLE", fr: "Proposer un titre", en: "Suggest title" },
];

export function SupportForm({ locale = "fr" }: { locale?: string }) {
  const en = locale === "en";
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [aiPending, setAiPending] = useState<AiAction | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ action: AiAction; content: string } | null>(null);
  useEffect(() => {
    if (!photo) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function assist(action: AiAction) {
    if (!description.trim() && !subject.trim()) return toastError(en ? "Describe the problem first." : "Décrivez d'abord le problème.");
    setAiPending(action);
    setAiSuggestion(null);
    try {
      const response = await fetch("/api/support/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, draft: description || subject, context: subject || "" }),
      });
      const body = await response.json().catch(() => null) as { content?: string; message?: string } | null;
      if (!response.ok || !body?.content) throw new Error(body?.message || (en ? "AI assistance unavailable." : "L’assistance IA est indisponible."));
      setAiSuggestion({ action, content: body.content });
    } catch (error) {
      toastError(error instanceof Error ? error.message : (en ? "AI assistance unavailable." : "Assistance IA indisponible."));
    } finally { setAiPending(null); }
  }

  function choosePhoto(file: File | null) {
    if (!file) { setPhoto(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) {
      return toastError(en ? "JPEG, PNG or WebP only, max 8 MB." : "Photo JPEG, PNG ou WebP uniquement, 8 Mo maximum.");
    }
    setPhoto(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, priority }),
      });
      const body = await response.json().catch(() => null) as { ticket?: { id: string }; message?: string } | null;
      if (!response.ok || !body?.ticket?.id) throw new Error(body?.message || (en ? "Unable to send ticket." : "Impossible d’envoyer le ticket."));
      let uploaded = true;
      if (photo) {
        const form = new FormData();
        form.append("photo", photo);
        const mediaResponse = await fetch(`/api/support/tickets/${body.ticket.id}/attachments`, { method: "POST", body: form }).catch(() => null);
        uploaded = Boolean(mediaResponse?.ok);
      }
      if (uploaded) toastSuccess(en ? "Ticket sent to DTSC Support." : "Ticket transmis à l’équipe DTSC.");
      else toastError(en ? "Ticket sent, but photo upload failed. You can follow your ticket below." : "Ticket envoyé, mais la photo n’a pas pu être jointe. Vous pouvez suivre le ticket ci-dessous.");
      setSubject(""); setDescription(""); setPriority("MEDIUM"); setPhoto(null); setAiSuggestion(null); setOpen(false); router.refresh();
    } catch (error) { toastError(error instanceof Error ? error.message : (en ? "Unable to send ticket." : "Impossible d’envoyer le ticket.")); }
    finally { setIsPending(false); }
  }

  return (
    <div className="dtsc-product-surface min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><h2 className="text-base font-semibold text-dtsc-ink">{en ? "Create a support ticket" : "Créer un ticket support"}</h2><p className="mt-1 text-sm leading-6 text-dtsc-muted">{en ? "Explain your issue, optionally with a private photo and AI help." : "Décrivez votre problème, avec une photo privée et une aide IA si nécessaire."}</p></div>
        <Button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-dtsc-blue text-white">{en ? "New ticket" : "Créer un ticket"}</Button>
      </div>
      <Dialog open={open} title={en ? "Support ticket" : "Créer un ticket support"} description={en ? "Review all information before sending." : "Vérifiez chaque information avant l'envoi."} onClose={() => { if (!isPending) setOpen(false); }} className="h-[92dvh] max-w-4xl">
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <FormField label={en ? "Subject" : "Objet de la demande"} hint={en ? "Keep the title specific." : "Résumez précisément le sujet."}><Input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={160} required /></FormField>
          <FormField label={en ? "Detailed description" : "Description détaillée"} hint={en ? "Explain the context, impact and steps taken." : "Précisez le contexte, les conséquences et les étapes déjà testées."}>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={2500} className="min-h-36 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" required />
          </FormField>
          <section aria-label={en ? "AI writing assistant" : "Assistant IA de rédaction"} className="rounded-xl border border-violet-400/25 bg-violet-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-dtsc-ink"><Sparkles className="h-4 w-4 text-violet-500" />{en ? "AI writing assistant" : "Rédaction assistée par IA"}</div>
            <div className="flex flex-wrap gap-2">{aiActions.map(({action,fr,en:enLabel}) => <Button type="button" size="sm" variant="outline" key={action} disabled={Boolean(aiPending) || isPending} onClick={() => void assist(action)}>{aiPending === action ? "…" : en ? enLabel : fr}</Button>)}</div>
            {aiSuggestion ? <div className="mt-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><p className="mb-2 text-xs font-bold text-dtsc-muted">{en ? "AI suggestion — review before applying" : "Proposition IA — à vérifier avant application"}</p><p className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm text-dtsc-ink">{aiSuggestion.content}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => { if (aiSuggestion.action === "TITLE") setSubject(aiSuggestion.content.slice(0,160)); else setDescription(aiSuggestion.content.slice(0,2500)); setAiSuggestion(null); }}>{en ? "Apply suggestion" : "Appliquer la proposition"}</Button><Button type="button" size="sm" variant="outline" onClick={() => setAiSuggestion(null)}>{en ? "Discard" : "Ignorer"}</Button></div></div> : null}
          </section>
          <FormField label={en ? "Priority" : "Priorité"} hint={en ? "Choose the actual urgency." : "Choisissez l'urgence réelle."}><select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="LOW">{en ? "Low" : "Faible"}</option><option value="MEDIUM">{en ? "Normal" : "Normale"}</option><option value="HIGH">{en ? "High" : "Élevée"}</option><option value="URGENT">{en ? "Urgent" : "Urgente"}</option></select></FormField>
          <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
            <label htmlFor="support-photo-input" className="mb-2 flex items-center gap-2 text-sm font-bold text-dtsc-ink"><ImagePlus className="h-4 w-4" />{en ? "Attach an optional photo" : "Joindre une photo (facultatif)"}</label>
            <input id="support-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0] || null)} className="block w-full min-w-0 text-sm text-dtsc-muted" />
            <p className="mt-1 text-xs text-dtsc-muted">{en ? "JPEG, PNG, WebP — max 8 MB. Private, visible only to authorized support agents." : "JPEG, PNG, WebP — 8 Mo maximum. Photo privée, visible uniquement par le support autorisé."}</p>
            {photo && previewUrl ? <div className="mt-3 flex items-start gap-3"><Image src={previewUrl} alt={en ? "Selected photo preview" : "Aperçu de la photo sélectionnée"} width={128} height={96} unoptimized className="h-24 w-32 rounded-xl border border-dtsc-border object-cover" /><span className="min-w-0 flex-1 break-all text-xs text-dtsc-muted">{photo.name}</span><Button size="icon" variant="outline" type="button" onClick={() => setPhoto(null)} aria-label={en ? "Remove photo" : "Retirer la photo"}><X className="h-4 w-4" /></Button></div> : null}
          </div>
          <Button className="w-full rounded-xl bg-dtsc-blue text-white sm:w-fit" disabled={isPending || Boolean(aiPending)}><Send className="h-4 w-4" />{isPending ? (en ? "Sending…" : "Envoi…") : (en ? "Approve and send ticket" : "Approuver et envoyer le ticket")}</Button>
        </form>
      </Dialog>
    </div>
  );
}
