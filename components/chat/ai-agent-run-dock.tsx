"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Coins,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Streamdown } from "streamdown";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type AgentVariant = "chatbot" | "enterprise";

type AgentStep = {
  id: string;
  stepIndex: number;
  kind: string;
  status: string;
  toolCode?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  reasonCode?: string | null;
};

type AgentSnapshot = {
  id: string;
  status: string;
  currentStep: number;
  toolCallCount: number;
  pendingConfirmationId?: string | null;
  reasonCode?: string | null;
  limits: {
    maxSteps: number;
    maxToolCalls: number;
    maxTokens: number;
    maxEstimatedCost: number;
    maxDurationMs: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  steps: AgentStep[];
};

type PendingConfirmation = {
  id: string;
  toolCode: string;
  preview?: { subject?: string | null; priority?: string | null };
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"]);

function statusLabel(status: string, en: boolean) {
  const labels: Record<string, [string, string]> = {
    RUNNING: ["Analyse en cours", "Analysis in progress"],
    WAITING_CONFIRMATION: ["Validation requise", "Approval required"],
    READY_TO_RESUME: ["Prêt à reprendre", "Ready to resume"],
    COMPLETED: ["Terminé", "Completed"],
    FAILED: ["Échec", "Failed"],
    CANCELLED: ["Annulé", "Cancelled"],
    BUDGET_EXHAUSTED: ["Limite atteinte", "Budget reached"],
  };
  return labels[status]?.[en ? 1 : 0] || status;
}

function stepLabel(step: AgentStep, en: boolean) {
  if (step.toolCode) return `${en ? "Tool" : "Outil"} · ${step.toolCode}`;
  const labels: Record<string, [string, string]> = {
    MODEL: ["Analyse du modèle", "Model analysis"],
    TOOL: ["Exécution d’outil", "Tool execution"],
    CONFIRMATION: ["Validation humaine", "Human approval"],
  };
  return labels[step.kind]?.[en ? 1 : 0] || step.kind;
}

async function readTextStream(response: Response, onChunk: (chunk: string) => void) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
}

export function AiAgentRunDock({ variant }: { variant: AgentVariant }) {
  const locale = useAppLocale() || "fr";
  const en = locale === "en";
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [runId, setRunId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (variant !== "enterprise") return;
    void fetch("/api/ai/agent/context", { cache: "no-store" })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (response.ok && typeof body?.organizationId === "string") setOrganizationId(body.organizationId);
      })
      .catch(() => null);
  }, [variant]);

  const refreshConfirmation = useCallback(async (pendingId?: string | null) => {
    if (!pendingId) {
      setConfirmation(null);
      return;
    }
    const response = await fetch("/api/ai/tools/pending", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) return;
    const item = Array.isArray(body?.confirmations)
      ? body.confirmations.find((entry: PendingConfirmation) => entry.id === pendingId)
      : null;
    setConfirmation(item || null);
  }, []);

  const refreshRun = useCallback(async (targetRunId?: string) => {
    const id = targetRunId || runId;
    if (!id) return;
    const response = await fetch(`/api/ai/agent/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) return;
    setSnapshot(body as AgentSnapshot);
    await refreshConfirmation(body?.pendingConfirmationId || null);
  }, [refreshConfirmation, runId]);

  const snapshotStatus = snapshot?.status;

  useEffect(() => {
    if (!runId) return;
    void refreshRun(runId);
    const timer = window.setInterval(() => {
      if (!snapshotStatus || !TERMINAL_STATUSES.has(snapshotStatus)) void refreshRun(runId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refreshRun, runId, snapshotStatus]);

  const endpoint = variant === "enterprise" ? "/api/enterprise/ai/agent" : "/api/chat/agent";
  const canStart = variant === "chatbot" || Boolean(organizationId);
  const isActive = busy || Boolean(snapshot && !TERMINAL_STATUSES.has(snapshot.status));
  const latestSteps = useMemo(() => [...(snapshot?.steps || [])].sort((a, b) => a.stepIndex - b.stepIndex).slice(-6), [snapshot?.steps]);

  useFloatingAction({
    id: `ai-agent-mode-${variant}`,
    label: isActive
      ? (en ? "Agent mode · active" : "Mode agent · actif")
      : (en ? "Agent mode" : "Mode agent"),
    icon: Bot,
    order: 5,
    onSelect: () => setOpen(true),
  });

  async function startAgent() {
    const content = prompt.trim();
    if (!content || busy) return;
    if (!canStart) return toastError(en ? "No active company context is available." : "Aucun contexte d’entreprise actif n’est disponible.");

    setBusy(true);
    setAnswer("");
    setSnapshot(null);
    setConfirmation(null);
    try {
      const payload = variant === "enterprise"
        ? { organizationId, conversationId: conversationId || undefined, content, useKnowledge: true, useTools: true }
        : { conversationId: conversationId || undefined, content };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.reasonCode || body?.error || "AGENT_START_FAILED");
      }

      const nextRunId = response.headers.get("X-AI-Agent-Run-Id") || "";
      const nextConversationId = response.headers.get("X-Conversation-Id") || conversationId;
      if (nextRunId) setRunId(nextRunId);
      if (nextConversationId) setConversationId(nextConversationId);
      setPrompt("");
      await readTextStream(response, (chunk) => setAnswer((current) => current + chunk));
      if (nextRunId) await refreshRun(nextRunId);
    } catch (error) {
      toastError(error instanceof Error ? error.message : (en ? "Unable to start the agent." : "Impossible de démarrer l’agent."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun() {
    if (!runId || confirmBusy) return;
    setConfirmBusy(true);
    try {
      const response = await fetch(`/api/ai/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("CANCEL_FAILED");
      await refreshRun(runId);
      toastSuccess(en ? "Agent run cancelled." : "Exécution de l’agent annulée.");
    } catch {
      toastError(en ? "Unable to cancel this run." : "Impossible d’annuler cette exécution.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmAction() {
    if (!confirmation || confirmBusy) return;
    setConfirmBusy(true);
    try {
      const response = await fetch("/api/ai/tools/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: confirmation.id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.reasonCode || body?.error || "CONFIRM_FAILED");
      setConfirmation(null);
      await refreshRun(runId);
      toastSuccess(en ? "Action confirmed. The agent can now resume." : "Action confirmée. L’agent peut maintenant reprendre.");
    } catch {
      toastError(en ? "This action could not be confirmed." : "Cette action n’a pas pu être confirmée.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function rejectAction() {
    if (!confirmation || confirmBusy) return;
    setConfirmBusy(true);
    try {
      const response = await fetch("/api/ai/tools/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: confirmation.id }),
      });
      if (!response.ok) throw new Error("CONFIRMATION_CANCEL_FAILED");
      setConfirmation(null);
      await cancelRun();
    } catch {
      toastError(en ? "Unable to reject this action." : "Impossible de refuser cette action.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function resumeRun() {
    if (!runId || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ai/agent/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.reasonCode || body?.error || "AGENT_RESUME_FAILED");
      }
      await readTextStream(response, (chunk) => setAnswer((current) => current + chunk));
      await refreshRun(runId);
    } catch (error) {
      toastError(error instanceof Error ? error.message : (en ? "Unable to resume the agent." : "Impossible de reprendre l’agent."));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] right-3 z-[960] sm:bottom-5 sm:right-24" data-ai-agent-run-dock>
      <section className="flex max-h-[min(74vh,680px)] w-[min(calc(100vw-1.5rem),29rem)] flex-col overflow-hidden rounded-3xl border border-dtsc-border bg-dtsc-surface shadow-2xl shadow-black/15" aria-live="polite">
        <header className="flex items-center gap-3 border-b border-dtsc-border/70 px-4 py-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600"><Bot className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-black text-dtsc-ink">{en ? "DTSC controlled agent" : "Agent DTSC contrôlé"}</strong>
            <span className="block truncate text-[0.68rem] font-semibold text-dtsc-muted">{snapshot ? statusLabel(snapshot.status, en) : (en ? "Opt-in multi-step execution" : "Exécution multi-étapes sur demande")}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setOpen(false)} aria-label={en ? "Close agent mode" : "Fermer le mode agent"}><X className="h-4 w-4" /></Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.045] p-3 text-xs leading-relaxed text-dtsc-muted">
            <strong className="text-dtsc-ink">{en ? "Human-controlled by design." : "Contrôlé par l’humain par conception."}</strong>{" "}
            {en ? "The agent can analyze and use certified tools, but sensitive mutations require an explicit approval control. Private chain-of-thought is never displayed." : "L’agent peut analyser et utiliser des outils certifiés, mais les mutations sensibles exigent une validation explicite. La chaîne de pensée privée n’est jamais affichée."}
          </div>

          {answer ? (
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-ink">
              <Streamdown>{answer}</Streamdown>
            </div>
          ) : null}

          {snapshot ? (
            <div className="rounded-2xl border border-dtsc-border bg-dtsc-page/80">
              <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                <span className={cn("h-2.5 w-2.5 rounded-full", snapshot.status === "FAILED" || snapshot.status === "BUDGET_EXHAUSTED" ? "bg-rose-500" : snapshot.status === "COMPLETED" ? "bg-emerald-500" : "bg-cyan-500")} />
                <span className="flex-1 text-xs font-black text-dtsc-ink">{statusLabel(snapshot.status, en)}</span>
                <span className="text-[0.68rem] font-semibold text-dtsc-muted">{snapshot.currentStep}/{snapshot.limits.maxSteps}</span>
                {detailsOpen ? <ChevronUp className="h-4 w-4 text-dtsc-muted" /> : <ChevronDown className="h-4 w-4 text-dtsc-muted" />}
              </button>
              {detailsOpen ? (
                <div className="border-t border-dtsc-border/70 p-3">
                  <div className="grid grid-cols-2 gap-2 text-[0.68rem] font-semibold text-dtsc-muted">
                    <span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" /> {snapshot.usage.totalTokens}/{snapshot.limits.maxTokens} tokens</span>
                    <span className="inline-flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> {snapshot.toolCallCount}/{snapshot.limits.maxToolCalls} {en ? "tools" : "outils"}</span>
                  </div>
                  {latestSteps.length ? (
                    <div className="mt-3 grid gap-1.5">
                      {latestSteps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 rounded-xl bg-dtsc-surface px-2.5 py-2 text-[0.7rem]">
                          {step.status === "COMPLETED" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-500" />}
                          <span className="min-w-0 flex-1 truncate font-bold text-dtsc-ink">{stepLabel(step, en)}</span>
                          {step.totalTokens ? <span className="text-dtsc-muted">{step.totalTokens} t</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {confirmation ? (
            <div className="rounded-2xl border border-amber-400/35 bg-amber-400/10 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs font-black text-dtsc-ink">{en ? "Sensitive action awaiting your approval" : "Action sensible en attente de votre validation"}</strong>
                  <p className="mt-1 text-xs leading-5 text-dtsc-muted">{en ? `Tool: ${confirmation.toolCode}` : `Outil : ${confirmation.toolCode}`}{confirmation.preview?.subject ? ` · ${confirmation.preview.subject}` : ""}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void confirmAction()} disabled={confirmBusy}>{confirmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}{en ? "Approve" : "Valider"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void rejectAction()} disabled={confirmBusy}>{en ? "Reject" : "Refuser"}</Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-dtsc-border/70 bg-dtsc-surface p-3">
          {snapshot?.status === "READY_TO_RESUME" ? (
            <Button type="button" onClick={() => void resumeRun()} disabled={busy} className="w-full rounded-xl">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{en ? "Resume agent" : "Reprendre l’agent"}
            </Button>
          ) : (
            <div className="grid gap-2">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={10000} disabled={isActive} placeholder={en ? "Describe the goal for the agent…" : "Décrivez l’objectif à confier à l’agent…"} className="min-h-16 resize-none rounded-2xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink outline-none focus:border-cyan-400" />
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => void startAgent()} disabled={!prompt.trim() || busy || isActive || !canStart} className="flex-1 rounded-xl">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{en ? "Start controlled agent" : "Démarrer l’agent contrôlé"}
                </Button>
                {isActive && runId ? <Button type="button" variant="outline" size="icon" onClick={() => void cancelRun()} disabled={confirmBusy} className="rounded-xl" aria-label={en ? "Stop agent" : "Arrêter l’agent"}><CircleStop className="h-4 w-4" /></Button> : null}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
