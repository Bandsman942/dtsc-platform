"use client";

import { Bot, Mic, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { collaborationExperienceT } from "@/lib/collaboration-experience-i18n";
import { cn } from "@/lib/utils";

type VoicePayload = { blob: Blob; durationMs: number; waveform: number[] };
type VoiceCapabilities = { enabled: boolean; maxDurationSeconds: number; maxFileSizeBytes: number };
type AiDraftAction = "REWRITE" | "PROFESSIONAL" | "SHORTEN" | "FRIENDLY" | "PROPOSE_REPLY" | "SUMMARY" | "NEXT_ACTIONS";

const DEFAULT_VOICE_CAPABILITIES: VoiceCapabilities = {
  enabled: true,
  maxDurationSeconds: 300,
  maxFileSizeBytes: 16 * 1024 * 1024,
};
const MAX_COMPOSER_HEIGHT = 176;

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
    "audio/ogg",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function microphoneErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "L’accès au microphone a été refusé. Autorisez le microphone pour app.dtsc-platform.com dans les paramètres du navigateur, puis réessayez.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Aucun microphone utilisable n’a été détecté sur cet appareil.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Le microphone est déjà utilisé ou bloqué par une autre application. Fermez l’autre enregistrement ou appel, puis réessayez.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Le microphone ne prend pas en charge les paramètres demandés. Rechargez la page et réessayez.";
  }
  if (name === "AbortError") return "L’ouverture du microphone a été interrompue. Réessayez.";
  return "Le microphone n’a pas pu être ouvert. Vérifiez l’autorisation du navigateur et la disponibilité du microphone.";
}

async function readTextResponse(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    content += decoder.decode(value, { stream: true });
  }
  content += decoder.decode();
  return content.trim();
}

function findActiveConversationId(explicitGroupId?: string | null) {
  if (explicitGroupId) return explicitGroupId;
  if (typeof document === "undefined") return "";
  return document.querySelector<HTMLElement>("[data-conversation-id][aria-current='true']")?.dataset.conversationId || "";
}

export function VoiceConversationComposer({
  value,
  onChange,
  onSendText,
  onSendVoice,
  groupId,
  placeholder = "Écrire un message…",
  disabled = false,
  sending = false,
  before,
  onError,
  labels,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSendText: () => Promise<void> | void;
  onSendVoice: (payload: VoicePayload) => Promise<void> | void;
  groupId?: string | null;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  before?: ReactNode;
  onError?: (message: string) => void;
  labels?: { record?: string; cancel?: string; send?: string; recording?: string };
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceCapabilities, setVoiceCapabilities] = useState<VoiceCapabilities>(DEFAULT_VOICE_CAPABILITIES);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [replyContext, setReplyContext] = useState("");
  const [agentInstruction, setAgentInstruction] = useState("");
  const [activeAiGroupId, setActiveAiGroupId] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const aiLocale = labels?.send === "Send" ? "en" : "fr";
  const aiT = (key: Parameters<typeof collaborationExperienceT>[1]) => collaborationExperienceT(aiLocale, key);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/collaborators/voice-settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ voice?: VoiceCapabilities }>;
      })
      .then((body) => {
        if (!cancelled && body?.voice) setVoiceCapabilities(body.voice);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* already stopping */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    if (!recording) return;
    const maxDurationMs = voiceCapabilities.maxDurationSeconds * 1000;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setRecordingMs(elapsed);
      if (elapsed >= maxDurationMs) {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          cancelledRef.current = false;
          try { recorder.requestData(); } catch { /* optional flush */ }
          recorder.stop();
        }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, voiceCapabilities.maxDurationSeconds]);

  function openAiCopilot() {
    setActiveAiGroupId(findActiveConversationId(groupId));
    setAiOpen(true);
  }

  async function runAiAction(action: AiDraftAction) {
    if (aiBusy || disabled || sending) return;
    const resolvedGroupId = activeAiGroupId || findActiveConversationId(groupId);
    if (action === "PROPOSE_REPLY" && !resolvedGroupId && !replyContext.trim()) {
      onError?.(aiT("aiReplyContextRequired"));
      return;
    }
    if ((action === "SUMMARY" || action === "NEXT_ACTIONS") && !resolvedGroupId) {
      onError?.(aiT("aiGroupContextRequired"));
      return;
    }
    if (!["PROPOSE_REPLY", "SUMMARY", "NEXT_ACTIONS"].includes(action) && !value.trim()) {
      onError?.(aiT("aiDraftRequired"));
      return;
    }

    setAiBusy(true);
    try {
      const response = await fetch("/api/collaborators/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, draft: value, context: replyContext, groupId: resolvedGroupId || undefined }),
      });
      const body = await response.json().catch(() => null) as { content?: string; message?: string } | null;
      if (!response.ok || !body?.content) throw new Error(body?.message || aiT("aiComposeError"));
      onChange(body.content);
      setAiOpen(false);
      if (action === "PROPOSE_REPLY") setReplyContext("");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : aiT("aiComposeError"));
    } finally {
      setAiBusy(false);
    }
  }

  async function runAgent() {
    if (aiBusy || disabled || sending) return;
    const resolvedGroupId = activeAiGroupId || findActiveConversationId(groupId);
    if (!resolvedGroupId) return onError?.(aiT("aiGroupContextRequired"));
    if (!agentInstruction.trim()) return onError?.(aiT("aiDraftRequired"));
    setAiBusy(true);
    try {
      const response = await fetch("/api/collaborators/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: resolvedGroupId, instruction: agentInstruction.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || aiT("aiComposeError"));
      }
      const content = await readTextResponse(response);
      if (!content) throw new Error(aiT("aiComposeError"));
      onChange(content);
      setAgentInstruction("");
      setAiOpen(false);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : aiT("aiComposeError"));
    } finally {
      setAiBusy(false);
    }
  }

  async function startRecording() {
    if (disabled || sending || recording) return;
    if (!voiceCapabilities.enabled) {
      onError?.("Les messages vocaux sont désactivés par l’administrateur.");
      return;
    }
    if (typeof window === "undefined" || !window.isSecureContext) {
      onError?.("Le microphone exige une connexion HTTPS sécurisée. Ouvrez l’application depuis app.dtsc-platform.com.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("L’enregistrement vocal n’est pas pris en charge par ce navigateur. Mettez le navigateur à jour ou utilisez Chrome, Samsung Internet, Edge ou Safari récent.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (permission.state === "denied") {
            onError?.("Le microphone est bloqué pour ce site. Réactivez-le dans Paramètres du navigateur > Autorisations du site > Microphone.");
            return;
          }
        } catch {
          // Some mobile browsers do not expose microphone permission through Permissions API.
        }
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== "live") throw new DOMException("Microphone unavailable", "NotReadableError");

      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      setRecordingMs(0);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", (event) => {
        cancelledRef.current = true;
        onError?.(`L’enregistrement vocal a été interrompu${event.error?.message ? ` : ${event.error.message}` : "."}`);
      });
      recorder.addEventListener("stop", () => {
        const durationMs = Math.min(Date.now() - startedAtRef.current, voiceCapabilities.maxDurationSeconds * 1000);
        const chunks = [...chunksRef.current];
        const wasCancelled = cancelledRef.current || !mountedRef.current;
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        if (mountedRef.current) {
          setRecording(false);
          setRecordingMs(0);
        }
        if (wasCancelled || !chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
        if (blob.size <= 0 || durationMs < 250) {
          onError?.("Le message vocal est vide ou trop court. Maintenez l’enregistrement un peu plus longtemps.");
          return;
        }
        if (blob.size > voiceCapabilities.maxFileSizeBytes) {
          const maxMb = Math.max(1, Math.floor(voiceCapabilities.maxFileSizeBytes / (1024 * 1024)));
          onError?.(`Le message vocal dépasse la limite de ${maxMb} Mo.`);
          return;
        }
        void Promise.resolve(onSendVoice({ blob, durationMs, waveform: [] })).catch((error) => {
          onError?.(error instanceof Error ? error.message : "Le message vocal n’a pas pu être envoyé.");
        });
      }, { once: true });

      recorder.start(250);
      setRecording(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setRecordingMs(0);
      onError?.(microphoneErrorMessage(error));
    }
  }

  function finishRecording(cancelled: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = cancelled;
    if (!cancelled) {
      try { recorder.requestData(); } catch { /* optional flush */ }
    }
    try { recorder.stop(); } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setRecordingMs(0);
      if (!cancelled) onError?.("L’enregistrement n’a pas pu être finalisé. Réessayez.");
    }
  }

  return (
    <>
      <div className={cn("shrink-0 border-t border-dtsc-border bg-dtsc-surface px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4", className)}>
        {before}
        {recording ? (
          <div className="flex min-w-0 items-center gap-2 rounded-[1.35rem] border border-dtsc-border bg-dtsc-page p-1.5 shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
            <span className="ml-2 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-bold text-dtsc-ink">{labels?.recording || "Enregistrement"} · {formatDuration(recordingMs)} / {formatDuration(voiceCapabilities.maxDurationSeconds * 1000)}</span>
            <Button type="button" variant="outline" size="icon" onClick={() => finishRecording(true)} className="h-11 w-11 shrink-0 rounded-full" aria-label={labels?.cancel || "Annuler"}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" onClick={() => finishRecording(false)} className="h-11 w-11 shrink-0 rounded-full bg-[#002b5b] text-white" aria-label={labels?.send || "Envoyer"}>
              <Square className="h-4 w-4 fill-current" />
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event) => { event.preventDefault(); if (value.trim()) void onSendText(); }}
            className="min-w-0 rounded-[1.55rem] border border-dtsc-border bg-dtsc-page p-2 shadow-[0_8px_28px_rgba(0,43,91,0.08)] focus-within:border-cyan-400/60 focus-within:shadow-[0_10px_34px_rgba(6,182,212,0.10)]"
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && value.trim()) {
                  event.preventDefault();
                  void onSendText();
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="max-h-44 min-h-12 w-full resize-none bg-transparent px-3 py-2.5 text-base leading-6 text-dtsc-ink outline-none placeholder:text-dtsc-muted"
              disabled={disabled || sending}
              aria-label={placeholder}
            />
            <div className="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-dtsc-border/70 px-1 pt-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full text-cyan-600"
                disabled={disabled || sending || aiBusy}
                onClick={openAiCopilot}
                aria-label={aiT("aiCopilot")}
                title={aiT("aiCopilot")}
              >
                <Sparkles className="h-5 w-5" />
              </Button>
              <div className="flex min-w-0 items-center gap-1.5">
                {value.trim() ? (
                  <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full bg-[#002b5b] text-white" disabled={disabled || sending} aria-label={labels?.send || "Envoyer"}>
                    <Send className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full bg-[#002b5b] text-white"
                    disabled={disabled || sending || !voiceCapabilities.enabled}
                    onClick={() => void startRecording()}
                    aria-label={labels?.record || "Enregistrer un vocal"}
                    title={voiceCapabilities.enabled ? labels?.record || "Enregistrer un vocal" : "Messages vocaux désactivés"}
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      <Dialog
        open={aiOpen}
        onClose={() => !aiBusy && setAiOpen(false)}
        title={aiT("aiCopilot")}
        description={aiT("aiCopilotDescription")}
        className="max-h-[92dvh] max-w-lg overflow-y-auto"
      >
        <div className="grid gap-4">
          {activeAiGroupId ? (
            <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/8 p-3">
              <strong className="text-sm text-dtsc-ink">{aiT("aiThreadContext")}</strong>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">{aiT("aiThreadContextHelp")}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button type="button" variant="outline" disabled={aiBusy} onClick={() => void runAiAction("PROPOSE_REPLY")}>{aiT("aiProposeReply")}</Button>
                <Button type="button" variant="outline" disabled={aiBusy} onClick={() => void runAiAction("SUMMARY")}>{aiT("aiSummarize")}</Button>
                <Button type="button" variant="outline" disabled={aiBusy} onClick={() => void runAiAction("NEXT_ACTIONS")}>{aiT("aiNextActions")}</Button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("REWRITE")}>{aiT("aiRewrite")}</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("PROFESSIONAL")}>{aiT("aiProfessional")}</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("SHORTEN")}>{aiT("aiShorten")}</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("FRIENDLY")}>{aiT("aiFriendly")}</Button>
          </div>

          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <label className="text-sm font-black text-dtsc-ink" htmlFor="dtsc-ai-reply-context">{aiT("aiProposeReply")}</label>
            <p className="mt-1 text-xs leading-5 text-dtsc-muted">{aiT("aiReplyHelp")}</p>
            <textarea
              id="dtsc-ai-reply-context"
              value={replyContext}
              onChange={(event) => setReplyContext(event.target.value)}
              rows={3}
              maxLength={6000}
              placeholder={aiT("aiReceivedMessage")}
              className="mt-3 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm leading-6 text-dtsc-ink outline-none focus:border-cyan-400"
              disabled={aiBusy}
            />
            <Button type="button" className="mt-3 w-full" disabled={aiBusy || (!activeAiGroupId && !replyContext.trim())} onClick={() => void runAiAction("PROPOSE_REPLY")}>
              <Sparkles className="mr-2 h-4 w-4" />
              {aiBusy ? aiT("aiPreparing") : aiT("aiPrepareReply")}
            </Button>
          </div>

          <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600"><Bot className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <strong className="text-sm text-dtsc-ink">{aiT("aiAgentMode")}</strong>
                <p className="mt-1 text-xs leading-5 text-dtsc-muted">{aiT("aiAgentDescription")}</p>
              </div>
            </div>
            <textarea
              value={agentInstruction}
              onChange={(event) => setAgentInstruction(event.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={aiT("aiAgentPlaceholder")}
              disabled={aiBusy || !activeAiGroupId}
              className="mt-3 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-ink outline-none focus:border-cyan-400 disabled:opacity-60"
            />
            <Button type="button" className="mt-3 w-full" disabled={aiBusy || !activeAiGroupId || !agentInstruction.trim()} onClick={() => void runAgent()}>
              <Bot className="mr-2 h-4 w-4" />
              {aiBusy ? aiT("aiAgentWorking") : aiT("aiRunAgent")}
            </Button>
          </div>

          <p className="text-xs leading-5 text-dtsc-muted">{aiT("aiPrivacyNote")}</p>
        </div>
      </Dialog>
    </>
  );
}
