"use client";

import { CalendarClock, FileText, Headphones, Video } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatUserDateTime, type UserDatePreferences } from "@/lib/user-format";

export type CollaborationMeetingLinkView = {
  id: string;
  meetingId: string;
  groupId: string;
  callType: string;
  scheduledAt: string;
  availableFrom: string;
  status: string;
  lastCallId?: string | null;
  canJoin: boolean;
};

export type CollaborationMeetingFollowUpView = {
  id: string;
  meetingId: string;
  callId: string;
  status: string;
  minutesId?: string | null;
  summary?: string | null;
  meetingTitle?: string | null;
  canCreateMinutes: boolean;
};

export function CollaborationMeetingMessageContent({
  messageType,
  content,
  meetingLink,
  meetingFollowUp,
  preferences,
  onChanged,
  onError,
}: {
  messageType: string;
  content: string;
  meetingLink?: CollaborationMeetingLinkView | null;
  meetingFollowUp?: CollaborationMeetingFollowUpView | null;
  preferences: UserDatePreferences;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const english = preferences.locale === "en";
  const [joining, setJoining] = useState(false);
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [savingMinutes, setSavingMinutes] = useState(false);

  if (messageType === "MEETING_LINK" && meetingLink) {
    const closed = meetingLink.status === "CANCELED" || meetingLink.status === "COMPLETED";
    const Icon = meetingLink.callType === "VIDEO" ? Video : Headphones;
    return (
      <div className="min-w-[min(19rem,78vw)] rounded-xl border border-cyan-400/35 bg-cyan-400/8 p-3 text-dtsc-ink">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/14 text-cyan-700 dark:text-cyan-200"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-200">{english ? "Scheduled meeting" : "Réunion planifiée"}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-dtsc-ink">{content}</p>
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-dtsc-muted"><CalendarClock className="h-3.5 w-3.5" />{formatUserDateTime(meetingLink.scheduledAt, preferences, { second: undefined })}</p>
          </div>
        </div>
        <Button
          type="button"
          className="mt-3 w-full"
          disabled={!meetingLink.canJoin || joining || closed}
          onClick={() => void joinMeeting()}
        >
          {joining ? (english ? "Opening…" : "Ouverture…") : closed ? (english ? "Meeting ended" : "Réunion terminée") : meetingLink.canJoin ? (english ? "Join meeting" : "Rejoindre la réunion") : (english ? "Available at scheduled time" : "Disponible à l’heure planifiée")}
        </Button>
      </div>
    );
  }

  if (messageType === "MEETING_MINUTES_PROMPT" && meetingFollowUp) {
    const alreadyCreated = Boolean(meetingFollowUp.minutesId);
    return (
      <>
        <div className="min-w-[min(19rem,78vw)] rounded-xl border border-amber-400/35 bg-amber-400/8 p-3 text-dtsc-ink">
          <div className="flex items-start gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-200"><FileText className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-200">{english ? "Meeting follow-up" : "Suivi de réunion"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5">{content}</p></div></div>
          {meetingFollowUp.canCreateMinutes ? <Button type="button" variant={alreadyCreated ? "outline" : "default"} className="mt-3 w-full" onClick={() => setMinutesOpen(true)}>{alreadyCreated ? (english ? "Update minutes" : "Mettre à jour le compte-rendu") : (english ? "Write minutes" : "Rédiger le compte-rendu")}</Button> : null}
        </div>
        <Dialog open={minutesOpen} title={english ? "Meeting minutes" : "Compte-rendu de réunion"} description={meetingFollowUp.meetingTitle || undefined} onClose={() => setMinutesOpen(false)} className="h-[92dvh] max-w-3xl">
          <form onSubmit={saveMinutes} className="grid gap-4">
            <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{english ? "Detailed minutes" : "Compte-rendu détaillé"}<textarea name="content" minLength={10} maxLength={10000} required defaultValue="" className="min-h-[45dvh] resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-ink" placeholder={english ? "Decisions, discussions, actions, owners, deadlines…" : "Décisions, échanges, actions, responsables, échéances…"} /></label>
            <label className="grid gap-1 text-sm font-bold text-dtsc-ink">{english ? "Summary published in the group (optional)" : "Résumé publié dans le groupe (optionnel)"}<textarea name="summary" maxLength={2000} defaultValue={meetingFollowUp.summary || ""} className="min-h-28 resize-y rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm leading-6 text-dtsc-ink" placeholder={english ? "Leave empty to derive a concise summary from the minutes." : "Laissez vide pour générer un résumé concis à partir du compte-rendu."} /></label>
            <Button type="submit" disabled={savingMinutes}>{savingMinutes ? (english ? "Saving…" : "Enregistrement…") : (english ? "Save minutes" : "Enregistrer le compte-rendu")}</Button>
          </form>
        </Dialog>
      </>
    );
  }

  if (messageType === "MEETING_SUMMARY") {
    return <div className="min-w-[min(19rem,78vw)] rounded-xl border border-emerald-400/35 bg-emerald-400/8 p-3 text-dtsc-ink"><p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-200">{english ? "Meeting summary" : "Résumé de réunion"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{content}</p></div>;
  }

  return null;

  async function joinMeeting() {
    if (!meetingLink || joining) return;
    setJoining(true);
    const response = await fetch(`/api/collaborators/meeting-links/${encodeURIComponent(meetingLink.id)}/join`, { method: "POST" });
    const body = await response.json().catch(() => null) as { call?: { id?: string }; message?: string } | null;
    setJoining(false);
    if (!response.ok || !body?.call?.id) {
      onError(body?.message || (english ? "Unable to join this meeting." : "Impossible de rejoindre cette réunion."));
      await onChanged();
      return;
    }
    window.location.assign(`/collaborators?groupId=${encodeURIComponent(meetingLink.groupId)}&joinCall=${encodeURIComponent(body.call.id)}`);
  }

  async function saveMinutes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meetingFollowUp || savingMinutes) return;
    const form = new FormData(event.currentTarget);
    setSavingMinutes(true);
    const response = await fetch(`/api/collaborators/calls/${encodeURIComponent(meetingFollowUp.callId)}/minutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: String(form.get("content") || ""), summary: String(form.get("summary") || "") }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setSavingMinutes(false);
    if (!response.ok) {
      onError(body?.message || (english ? "Unable to save meeting minutes." : "Impossible d’enregistrer le compte-rendu."));
      return;
    }
    setMinutesOpen(false);
    await onChanged();
  }
}
