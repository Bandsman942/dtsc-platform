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

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] right-3 z-[80] sm:bottom-5 sm:right-5" data-ai-agent-run-dock>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-12 items-center gap-2 rounded-full border border-cyan-500/25 bg-dtsc-surface px-4 text-sm font-black text-dtsc-ink shadow-xl shadow-black/10 backdrop-blur"
          aria-label={en ? "Open DTSC agent mode" : "Ouvrir le mode agent DTSC"}
        >
          <Bot className="h-4 w-4 text-cyan-600" />
          {en ? "Agent mode" : "Mode agent"}
          {isActive ? <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" /> : null}
        </button>
      ) : (
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
                  <span className="text-[0.65rem] font-semibold text-dtsc-muted">{snapshot.currentStep}/{snapshot.limits.maxSteps} {en ? "steps" : "étapes"}</span>
                  {detailsOpen ? <ChevronUp className="h-4 w-4 text-dtsc-muted" /> : <ChevronDown className="h-4 w-4 text-dtsc-muted" />}
                </button>
                {detailsOpen ? (
                  <div className="border-t border-dtsc-border/70 px-3 py-3">
                    <div className="grid grid-cols-2 gap-2 text-[0.68rem] font-semibold text-dtsc-muted">
                      <div className="rounded-xl bg-dtsc-soft px-2.5 py-2"><Wrench className="mb-1 h-3.5 w-3.5" />{snapshot.toolCallCount}/{snapshot.limits.maxToolCalls} {en ? "tool calls" : "appels outils"}</div>
                      <div className="rounded-xl bg-dtsc-soft px-2.5 py-2"><Coins className="mb-1 h-3.5 w-3.5" />{snapshot.usage.totalTokens}/{snapshot.limits.maxTokens} tokens · ${snapshot.usage.estimatedCost.toFixed(4)}</div>
                    </div>
                    {latestSteps.length ? (
                      <div className="mt-3 space-y-1.5">
                        {latestSteps.map((step) => (
                          <div key={step.id} className="flex items-start gap-2 rounded-xl border border-dtsc-border/70 bg-dtsc-surface px-2.5 py-2">
                            <CheckCircle2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", step.status === "FAILED" ? "text-rose-500" : "text-cyan-600")} />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-[0.7rem] font-black text-dtsc-ink">{stepLabel(step, en)}</span>
                              <span className="block text-[0.63rem] font-semibold text-dtsc-muted">{step.status}{step.durationMs ? ` · ${step.durationMs} ms` : ""}{step.reasonCode ? ` · ${step.reasonCode}` : ""}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {confirmation ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-xs font-black text-dtsc-ink">{en ? "Explicit approval required" : "Validation explicite requise"}</strong>
                    <p className="mt-1 text-[0.69rem] leading-relaxed text-dtsc-muted">{confirmation.preview?.subject || confirmation.toolCode}. {en ? "Typing yes in chat cannot authorize this action." : "Écrire oui dans le chat ne peut pas autoriser cette action."}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={confirmBusy} onClick={() => void rejectAction()}>{en ? "Reject" : "Refuser"}</Button>
                  <Button type="button" disabled={confirmBusy} onClick={() => void confirmAction()}>{confirmBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}{en ? "Approve" : "Valider"}</Button>
                </div>
              </div>
            ) : null}

            {snapshot?.status === "READY_TO_RESUME" ? (
              <Button type="button" className="w-full rounded-xl" disabled={busy} onClick={() => void resumeRun()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}{en ? "Resume after approval" : "Reprendre après validation"}</Button>
            ) : null}
          </div>

          <footer className="border-t border-dtsc-border/70 bg-dtsc-surface p-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              maxLength={8000}
              disabled={busy}
              placeholder={variant === "enterprise" ? (en ? "Ask the company agent to analyze or prepare an action…" : "Demandez à l’agent entreprise d’analyser ou préparer une action…") : (en ? "Give DTSC Agent a multi-step task…" : "Confiez une tâche multi-étapes à l’Agent DTSC…")}
              className="w-full resize-none rounded-2xl border border-dtsc-border bg-dtsc-page px-3 py-2.5 text-sm text-dtsc-ink outline-none ring-cyan-500/30 placeholder:text-dtsc-muted focus:ring-2"
            />
            <div className="mt-2 flex items-center gap-2">
              {isActive && runId ? <Button type="button" variant="outline" className="rounded-xl" disabled={confirmBusy} onClick={() => void cancelRun()}><CircleStop className="mr-1.5 h-4 w-4" />{en ? "Cancel run" : "Annuler"}</Button> : null}
              <Button type="button" className="ml-auto rounded-xl" disabled={!prompt.trim() || busy || !canStart} onClick={() => void startAgent()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}{en ? "Run agent" : "Lancer l’agent"}</Button>
            </div>
          </footer>
        </section>
      )}
    </div>,
    document.body,
  );
}
