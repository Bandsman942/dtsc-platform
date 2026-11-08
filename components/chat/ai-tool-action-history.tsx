"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock3, MailCheck, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Action = {
  id: string;
  toolCode: string;
  status: string;
  ticketId: string | null;
  contactMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
  reasonCode: string | null;
};

export function AiToolActionHistory({ conversationId, locale = "fr" }: { conversationId?: string | null; locale?: string }) {
  const en = locale === "en";
  const [items, setItems] = useState<Action[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    setBusy(true);
    try {
      const suffix = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
      const response = await fetch(`/api/ai/tools/history${suffix}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { actions?: Action[] };
      setItems(Array.isArray(data.actions) ? data.actions : []);
    } finally { setBusy(false); }
  }, [conversationId]);
  useEffect(() => {
    void refresh();
    const listener = () => { void refresh(); };
    window.addEventListener("dtsc-ai-tool-history-updated", listener);
    window.addEventListener("focus", listener);
    return () => {
      window.removeEventListener("dtsc-ai-tool-history-updated", listener);
      window.removeEventListener("focus", listener);
    };
  }, [refresh]);

  if (!items.length) return null;
  return (
    <section data-ai-verified-actions className="border-t border-dtsc-border bg-dtsc-page/90 px-3 py-2" aria-label={en ? "Verified assistant actions" : "Actions vérifiées de l'assistant"}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <strong className="text-xs font-bold text-dtsc-ink">{en ? "Actual actions" : "Actions réellement exécutées"}</strong>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>
            {busy ? (en ? "Checking…" : "Vérification…") : (en ? "Refresh" : "Actualiser")}
          </Button>
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" data-horizontal-rail>
          {items.slice(0, 5).map((item) => {
            const success = item.status === "SUCCEEDED";
            const Icon = success ? item.toolCode === "SUPPORT_TICKET_CREATE" ? TicketCheck : MailCheck : item.status === "STARTED" ? Clock3 : CircleAlert;
            const label = item.toolCode === "SUPPORT_TICKET_CREATE" ? (en ? "Support ticket" : "Ticket support") : (en ? "DTSC email" : "Courriel DTSC");
            const id = success ? item.ticketId || item.contactMessageId : null;
            return (
              <article key={item.id} className="min-w-[14rem] max-w-[18rem] shrink-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Icon aria-hidden="true" size={16} className={success ? "text-emerald-600" : "text-amber-500"} />
                  <strong className="truncate text-xs text-dtsc-ink">{label}</strong>
                </div>
                <p className="mt-1 text-xs font-semibold text-dtsc-muted">
                  {success ? (en ? "Confirmed by the system" : "Confirmé par le système")
                    : item.status === "STARTED" ? (en ? "In progress" : "En cours")
                    : (en ? "Not completed" : "Non effectué")}
                </p>
                {id ? <p className="mt-1 break-all text-[11px] text-dtsc-muted">{en ? "Reference" : "Référence"} : {id}</p> : null}
                {success && item.ticketId ? <Link className="mt-1 inline-flex text-xs font-bold text-dtsc-blue underline focus-visible:ring-2" href="/support">{en ? "Open support" : "Voir dans Support"}</Link> : null}
                {success ? <CheckCircle2 aria-label={en ? "Success" : "Succès"} className="mt-1 text-emerald-600" size={14}/> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
