"use client";

import { Mic, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type VoicePayload = { blob: Blob; durationMs: number; waveform: number[] };
type VoiceCapabilities = { enabled: boolean; maxDurationSeconds: number; maxFileSizeBytes: number };
type AiDraftAction = "REWRITE" | "PROFESSIONAL" | "SHORTEN" | "FRIENDLY" | "PROPOSE_REPLY";

const DEFAULT_VOICE_CAPABILITIES: VoiceCapabilities = {
  enabled: true,
  maxDurationSeconds: 300,
  maxFileSizeBytes: 16 * 1024 * 1024,
};

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

export function VoiceConversationComposer({
  value,
  onChange,
  onSendText,
  onSendVoice,
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? "auto" : "hidden";
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

  async function runAiAction(action: AiDraftAction) {
    if (aiBusy || disabled || sending) return;
    if (action === "PROPOSE_REPLY" && !replyContext.trim()) {
      onError?.("Ajoutez le message auquel vous souhaitez répondre.");
      return;
    }
    if (action !== "PROPOSE_REPLY" && !value.trim()) {
      onError?.("Écrivez d’abord un brouillon pour que l’IA puisse l’améliorer.");
      return;
    }

    setAiBusy(true);
    try {
      const response = await fetch("/api/collaborators/ai/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, draft: value, context: replyContext }),
      });
      const body = await response.json().catch(() => null) as { content?: string; message?: string } | null;
      if (!response.ok || !body?.content) {
        throw new Error(body?.message || "L’IA n’a pas pu préparer le message.");
      }
      onChange(body.content);
      setAiOpen(false);
      if (action === "PROPOSE_REPLY") setReplyContext("");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "L’IA n’a pas pu préparer le message.");
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
          // Some mobile browsers do not expose the microphone permission through Permissions API.
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
          <form onSubmit={(event) => { event.preventDefault(); if (value.trim()) void onSendText(); }} className="flex min-w-0 items-end gap-2 rounded-[1.35rem] border border-dtsc-border bg-dtsc-page p-1.5 shadow-[0_4px_20px_rgba(0,43,91,0.05)]">
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
              className="min-h-11 max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base leading-6 text-dtsc-ink outline-none placeholder:text-dtsc-muted"
              disabled={disabled || sending}
              aria-label={placeholder}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full text-cyan-600"
              disabled={disabled || sending || aiBusy}
              onClick={() => setAiOpen(true)}
              aria-label="Ouvrir le copilote IA DTSC"
              title="Copilote IA DTSC"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
            {value.trim() ? (
              <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full bg-[#002b5b] text-white" disabled={disabled || sending} aria-label={labels?.send || "Envoyer"}>
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full bg-[#002b5b] text-white"
                disabled={disabled || sending || !voiceCapabilities.enabled}
                onClick={() => void startRecording()}
                aria-label={labels?.record || "Enregistrer un vocal"}
                title={voiceCapabilities.enabled ? labels?.record || "Enregistrer un vocal" : "Messages vocaux désactivés"}
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </form>
        )}
      </div>

      <Dialog
        open={aiOpen}
        onClose={() => !aiBusy && setAiOpen(false)}
        title="Copilote IA DTSC"
        description="L’IA prépare le texte dans votre zone de saisie. Vous relisez et vous décidez toujours de l’envoi."
        className="max-h-[92dvh] max-w-lg overflow-y-auto"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("REWRITE")}>Reformuler</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("PROFESSIONAL")}>Professionnaliser</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("SHORTEN")}>Raccourcir</Button>
            <Button type="button" variant="outline" disabled={aiBusy || !value.trim()} onClick={() => void runAiAction("FRIENDLY")}>Plus chaleureux</Button>
          </div>

          <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
            <label className="text-sm font-black text-dtsc-ink" htmlFor="dtsc-ai-reply-context">Proposer une réponse</label>
            <p className="mt-1 text-xs leading-5 text-dtsc-muted">Collez ici le message reçu si vous voulez que l’IA prépare une réponse. Votre brouillon actuel peut servir d’intention.</p>
            <textarea
              id="dtsc-ai-reply-context"
              value={replyContext}
              onChange={(event) => setReplyContext(event.target.value)}
              rows={5}
              maxLength={6000}
              placeholder="Message reçu…"
              className="mt-3 w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm leading-6 text-dtsc-ink outline-none focus:border-cyan-400"
              disabled={aiBusy}
            />
            <Button type="button" className="mt-3 w-full" disabled={aiBusy || !replyContext.trim()} onClick={() => void runAiAction("PROPOSE_REPLY")}>
              <Sparkles className="mr-2 h-4 w-4" />
              {aiBusy ? "Préparation…" : "Préparer la réponse"}
            </Button>
          </div>

          <p className="text-xs leading-5 text-dtsc-muted">Le copilote ne lit pas automatiquement les conversations privées et n’envoie aucun message à votre place. Cette limite évite qu’un mode agent contourne le contrôle utilisateur ou les permissions de DTSC.</p>
        </div>
      </Dialog>
    </>
  );
}
