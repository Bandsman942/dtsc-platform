"use client";

import { Mic, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VoicePayload = { blob: Blob; durationMs: number; waveform: number[] };
type VoiceCapabilities = { enabled: boolean; maxDurationSeconds: number; maxFileSizeBytes: number };

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
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
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
          recorder.stop();
        }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording, voiceCapabilities.maxDurationSeconds]);

  async function startRecording() {
    if (disabled || sending || recording) return;
    if (!voiceCapabilities.enabled) {
      onError?.("Les messages vocaux sont désactivés par l’administrateur.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError?.("L’enregistrement vocal n’est pas disponible sur ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      setRecordingMs(0);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const durationMs = Math.min(Date.now() - startedAtRef.current, voiceCapabilities.maxDurationSeconds * 1000);
        const chunks = chunksRef.current;
        const wasCancelled = cancelledRef.current;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setRecordingMs(0);
        if (wasCancelled || !chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
        if (blob.size <= 0) return;
        if (blob.size > voiceCapabilities.maxFileSizeBytes) {
          const maxMb = Math.max(1, Math.floor(voiceCapabilities.maxFileSizeBytes / (1024 * 1024)));
          onError?.(`Le message vocal dépasse la limite de ${maxMb} Mo.`);
          return;
        }
        void onSendVoice({ blob, durationMs, waveform: [] });
      });
      recorder.start(250);
      setRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      onError?.("Autorisez le microphone pour envoyer un message vocal.");
    }
  }

  function finishRecording(cancelled: boolean) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = cancelled;
    recorder.stop();
  }

  return (
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
  );
}
