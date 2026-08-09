"use client";

import { CheckCircle2, Loader2, ShieldCheck, TicketCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type PendingConfirmation = {
  id: string;
  conversationId: string | null;
  turnId: string | null;
  toolCode: "SUPPORT_TICKET_CREATE" | "DTSC_CONTACT_EMAIL_SEND" | string;
  expiresAt: string;
  createdAt: string;
  preview?: {
    subject?: string | null;
    priority?: string | null;
  };
};

type ToolExecutionResult = {
  ok?: boolean;
  status?: string;
  result?: Record<string, unknown> | null;
  error?: string;
  reasonCode?: string;
};

function actionLabel(toolCode: string, en: boolean) {
  if (toolCode === "SUPPORT_TICKET_CREATE") return en ? "Create support ticket" : "Créer le ticket support";
  if (toolCode === "DTSC_CONTACT_EMAIL_SEND") return en ? "Send message to DTSC" : "Envoyer le message à DTSC";
  return en ? "Confirm action" : "Confirmer l’action";
}

function titleFor(toolCode: string, en: boolean) {
  if (toolCode === "SUPPORT_TICKET_CREATE") return en ? "Support ticket ready" : "Ticket support prêt";
  if (toolCode === "DTSC_CONTACT_EMAIL_SEND") return en ? "Message ready to send" : "Message prêt à envoyer";
  return en ? "Action ready" : "Action prête";
}

function formatPriority(priority: string | null | undefined, en: boolean) {
  const value = (priority || "").toUpperCase();
  const labels: Record<string, [string, string]> = {
    LOW: ["Faible", "Low"],
    MEDIUM: ["Moyenne", "Medium"],
    HIGH: ["Haute", "High"],
    URGENT: ["Urgente", "Urgent"],
  };
  return labels[value]?.[en ? 1 : 0] || priority || null;
}

export function AiToolConfirmationDock({ conversationId, locale = "fr" }: { conversationId?: string | null; locale?: string }) {
  const en = locale === "en";
  const [confirmations, setConfirmations] = useState<PendingConfirmation[]>([]);
  const [busyId, setBusyId] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    const suffix = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
    const response = await fetch(`/api/ai/tools/pending${suffix}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) return;
    setConfirmations(Array.isArray(body?.confirmations) ? body.confirmations : []);
  }, [conversationId]);

  useEffect(() => {
    setPortalTarget(document.querySelector<HTMLElement>("[data-immersive-conversation='true']"));
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function cancel(item: PendingConfirmation) {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/ai/tools/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: item.id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "CANCEL_FAILED");
      }
      setConfirmations((current) => current.filter((entry) => entry.id !== item.id));
      toastSuccess(en ? "Action cancelled." : "Action annulée.");
    } catch {
      toastError(en ? "Unable to cancel this action." : "Impossible d’annuler cette action.");
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  async function confirm(item: PendingConfirmation) {
    setBusyId(item.id);
    try {
      const response = await fetch("/api/ai/tools/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: item.id }),
      });
      const body = await response.json().catch(() => null) as ToolExecutionResult | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || body?.reasonCode || body?.status || "CONFIRM_FAILED");

      setConfirmations((current) => current.filter((entry) => entry.id !== item.id));
      if (item.toolCode === "SUPPORT_TICKET_CREATE") {
        const ticketId = typeof body.result?.ticketId === "string" ? body.result.ticketId : "";
        toastSuccess(ticketId ? (en ? `Support ticket created: ${ticketId}.` : `Ticket support créé : ${ticketId}.`) : (en ? "Support ticket created." : "Ticket support créé."));
      } else if (item.toolCode === "DTSC_CONTACT_EMAIL_SEND") {
        const sent = body.result?.sent === true;
        toastSuccess(sent ? (en ? "Message sent to DTSC." : "Message envoyé à DTSC.") : (en ? "Message registered for DTSC, but email delivery was not confirmed." : "Message enregistré pour DTSC, mais l’envoi email n’a pas été confirmé."));
      } else {
        toastSuccess(en ? "Action completed." : "Action exécutée.");
      }
    } catch {
      toastError(en ? "This action could not be confirmed. It may have expired or no longer be authorized." : "Cette action n’a pas pu être confirmée. Elle a peut-être expiré ou n’est plus autorisée.");
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  if (!confirmations.length || !portalTarget) return null;

  return createPortal(
    <div className="shrink-0 border-t border-dtsc-border/70 bg-dtsc-surface px-2.5 py-2 sm:px-4" aria-live="polite">
      <div className="mx-auto grid w-full max-w-4xl gap-2">
        {confirmations.map((item) => {
          const busy = busyId === item.id;
          const isTicket = item.toolCode === "SUPPORT_TICKET_CREATE";
          const priority = formatPriority(item.preview?.priority, en);
          return (
            <section key={item.id} className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.055] p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-700 dark:text-cyan-300">
                  {isTicket ? <TicketCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-black text-dtsc-ink">{titleFor(item.toolCode, en)}</strong>
                    <span className="rounded-full border border-cyan-500/20 bg-dtsc-surface px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.08em] text-cyan-700 dark:text-cyan-300">{en ? "Requires approval" : "Validation requise"}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                    {item.preview?.subject ? <>{en ? "Subject" : "Objet"} : <span className="text-dtsc-ink">{item.preview.subject}</span></> : (en ? "Review this action before DTSC executes it." : "Vérifiez cette action avant son exécution par DTSC.")}
                  </p>
                  {priority ? <p className="mt-0.5 text-[0.7rem] font-semibold text-dtsc-muted">{en ? "Priority" : "Priorité"} : {priority}</p> : null}
                  <p className="mt-1.5 text-[0.69rem] leading-relaxed text-dtsc-muted">{en ? "Typing yes in the chat never authorizes this action. Only this confirmation control can execute it." : "Écrire oui dans le chat n’autorise jamais cette action. Seul ce contrôle de confirmation peut l’exécuter."}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" disabled={busy} onClick={() => void cancel(item)}>
                  <X className="mr-1.5 h-4 w-4" />{en ? "Cancel" : "Annuler"}
                </Button>
                <Button type="button" className={cn("w-full rounded-xl sm:w-auto", busy && "cursor-wait")} disabled={busy} onClick={() => void confirm(item)}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}{actionLabel(item.toolCode, en)}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>,
    portalTarget,
  );
}
