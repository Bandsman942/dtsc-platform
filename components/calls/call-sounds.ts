"use client";

// Original DTSC ringtones generated locally through Web Audio. No third-party music
// files are downloaded or streamed; browsers may require a user gesture first.
export type CallRingtone = "CLASSIC" | "SOFT" | "DIGITAL" | "MELODIC";
type CallSoundKind = "incoming" | "connected" | "left" | "ended" | "warning";

type Note = { frequency: number; duration: number; rest?: number };
const ringtoneNotes: Record<CallRingtone, Note[]> = {
  CLASSIC: [
    { frequency: 523.25, duration: .26, rest: .08 },
    { frequency: 659.25, duration: .26, rest: .08 },
    { frequency: 783.99, duration: .32, rest: .1 },
    { frequency: 659.25, duration: .26, rest: .1 },
    { frequency: 523.25, duration: .36, rest: .55 },
  ],
  SOFT: [
    { frequency: 440, duration: .44, rest: .14 },
    { frequency: 523.25, duration: .42, rest: .14 },
    { frequency: 659.25, duration: .54, rest: .26 },
    { frequency: 523.25, duration: .4, rest: .7 },
  ],
  DIGITAL: [
    { frequency: 880, duration: .18, rest: .07 },
    { frequency: 659.25, duration: .2, rest: .06 },
    { frequency: 1046.5, duration: .22, rest: .09 },
    { frequency: 783.99, duration: .3, rest: .13 },
    { frequency: 1046.5, duration: .24, rest: .5 },
  ],
  MELODIC: [
    { frequency: 392, duration: .32, rest: .07 },
    { frequency: 493.88, duration: .32, rest: .06 },
    { frequency: 587.33, duration: .34, rest: .07 },
    { frequency: 783.99, duration: .4, rest: .08 },
    { frequency: 587.33, duration: .32, rest: .06 },
    { frequency: 493.88, duration: .34, rest: .08 },
    { frequency: 440, duration: .48, rest: .7 },
  ],
};

const eventNotes: Record<Exclude<CallSoundKind, "incoming">, Note[]> = {
  connected: [{ frequency: 740, duration: .13 }],
  left: [{ frequency: 420, duration: .1 }],
  ended: [{ frequency: 360, duration: .12, rest: .05 }, { frequency: 240, duration: .12 }],
  warning: [{ frequency: 220, duration: .09, rest: .04 }, { frequency: 180, duration: .1 }],
};

let ringingContext: AudioContext | null = null;
let ringingTimeout: number | null = null;

function makeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = window.AudioContext || window.webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

function schedule(context: AudioContext, notes: Note[], volume: number, maxSeconds: number, repeat: boolean) {
  const gainLevel = 0.09 * Math.max(0, Math.min(volume, 100)) / 100;
  let startsAt = context.currentTime + .02;
  const endAt = startsAt + maxSeconds;
  do {
    for (const note of notes) {
      if (startsAt + note.duration > endAt) break;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(gainLevel, 0.0002), startsAt + .04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + note.duration + .025);
      startsAt += note.duration + (note.rest || 0);
    }
  } while (repeat && startsAt + notes[0].duration < endAt);
}

export function stopCallRingtone() {
  if (ringingTimeout !== null && typeof window !== "undefined") window.clearTimeout(ringingTimeout);
  ringingTimeout = null;
  const context = ringingContext;
  ringingContext = null;
  if (context) void context.close().catch(() => undefined);
}

export async function playCallSound(kind: CallSoundKind, volume = 45, ringtone: CallRingtone = "CLASSIC") {
  if (volume <= 0) return;
  if (kind !== "incoming") stopCallRingtone();
  if (kind === "incoming" && ringingContext) return;
  const context = makeContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
    if (context.state === "suspended") { void context.close(); return; }
    if (kind === "incoming") {
      ringingContext = context;
      schedule(context, ringtoneNotes[ringtone] || ringtoneNotes.CLASSIC, volume, 18, true);
      ringingTimeout = window.setTimeout(stopCallRingtone, 18_500);
      return;
    }
    const events = eventNotes[kind];
    schedule(context, events, volume, 1, false);
    window.setTimeout(() => { void context.close().catch(() => undefined); }, 1300);
  } catch {
    void context.close().catch(() => undefined);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
