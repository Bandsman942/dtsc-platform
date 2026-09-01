"use client";

import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";

type PendingConfirmation = {
  id: string;
  conversationId: string | null;
  turnId: string | null;
  expiresAt: string;
  preview?: {
    subject?: string | null;
    priority?: string | null;
  };
};

function runIdFromTurnId(turnId?: string | null) {
  if (!turnId) return null;
  const candidate = turnId.split(":")[0]?.trim();
  return candidate || null;
}

async function consumeTextStream(response: Response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

export function EnterpriseAiToolConfirmationBridge() {
  const locale = useAppLocale() || "fr";
  const en = locale === "en";
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (busy || document.visibilityState === "hidden") return;
    const response = await fetch("/api/ai/tools/pending", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => null);
    const next = Array.isArray(body?.confirmations) ? body.confirmations[0] || null : null;
    setPending(next);
  }, [busy]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const confirmation = await fetch("/api/ai/tools/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: pending.id }),
      });
      const confirmationBody = await confirmation.json().catch(() => null);
      if (!confirmation.ok || !confirmationBody?.ok) {
        throw new Error(confirmationBody?.reasonCode || confirmationBody?.error || "CONFIRMATION_FAILED");
      }

      const runId = runIdFromTurnId(pending.turnId);
      if (runId) {
        const resumed = await fetch(`/api/ai/agent/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" });
        if (!resumed.ok) {
          const body = await resumed.json().catch(() => null);
          throw new Error(body?.reasonCode || body?.error || "AGENT_RESUME_FAILED");
        }
        await consumeTextStream(resumed);
      }

      setPending(null);
      toastSuccess(en ? "Action approved and executed." : "Action confirmée et exécutée.");
      window.location.reload();
    } catch (error) {
      toastError(error instanceof Error ? error.message : (en ? "Unable to confirm this action." : "Impossible de confirmer cette action."));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/tools/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: pending.id }),
      });
      if (!response.ok) throw new Error("CONFIRMATION_CANCEL_FAILED");
      setPending(null);
      toastSuccess(en ? "Action rejected." : "Action refusée.");
    } catch {
      toastError(en ? "Unable to reject this action." : "Impossible de refuser cette action.");
    } finally {
      setBusy(false);
    }
  }

  if (!pending) return null;

  return (
    <aside
      className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] right-3 z-[970] w-[min(calc(100vw-1.5rem),26rem)] rounded-3xl border border-amber-500/30 bg-dtsc-surface p-4 shadow-2xl shadow-black/15 sm:bottom-5 sm:right-24"
      role="dialog"
      aria-live="assertive"
      aria-label={en ? "AI action approval" : "Validation d’action IA"}
      data-enterprise-ai-tool-confirmation
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm font-black text-dtsc-ink">{en ? "Approval required" : "Validation requise"}</strong>
          <p className="mt-1 text-xs leading-relaxed text-dtsc-muted">
            {en
              ? "DTSC AI prepared a business action. Nothing will be changed until you approve it here."
              : "L’IA DTSC a préparé une action métier. Rien ne sera modifié tant que vous ne la confirmez pas ici."}
          </p>
          {pending.preview?.subject ? (
            <div className="mt-3 rounded-2xl border border-dtsc-border bg-dtsc-page px-3 py-2.5">
              <p className="text-xs font-black text-dtsc-ink">{pending.preview.subject}</p>
              {pending.preview.priority ? <p className="mt-1 text-[0.68rem] font-semibold text-dtsc-muted">{en ? "Priority" : "Priorité"}: {pending.preview.priority}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => void reject()}>
          <XCircle className="mr-2 h-4 w-4" />{en ? "Reject" : "Refuser"}
        </Button>
        <Button type="button" className="rounded-full" disabled={busy} onClick={() => void confirm()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          {en ? "Approve" : "Confirmer"}
        </Button>
      </div>
    </aside>
  );
}
