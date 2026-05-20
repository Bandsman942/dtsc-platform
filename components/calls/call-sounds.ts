"use client";

type CallSoundKind = "incoming" | "connected" | "left" | "ended" | "warning";

const SOUND_PATTERNS: Record<CallSoundKind, Array<{ frequency: number; duration: number }>> = {
  incoming: [
    { frequency: 660, duration: 0.1 },
    { frequency: 880, duration: 0.12 },
  ],
  connected: [{ frequency: 740, duration: 0.12 }],
  left: [{ frequency: 420, duration: 0.1 }],
  ended: [
    { frequency: 360, duration: 0.12 },
    { frequency: 240, duration: 0.12 },
  ],
  warning: [
    { frequency: 220, duration: 0.08 },
    { frequency: 180, duration: 0.08 },
  ],
};

export async function playCallSound(kind: CallSoundKind, volume = 45) {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const AudioContextConstructor = browserWindow?.AudioContext || browserWindow?.webkitAudioContext;
  if (!AudioContextConstructor || volume <= 0) {
    return;
  }

  try {
    const context = new AudioContextConstructor();
    if (context.state === "suspended") {
      await context.resume();
    }
    const normalizedVolume = Math.min(Math.max(volume, 0), 100) / 100;
    let startsAt = context.currentTime;
    for (const step of SOUND_PATTERNS[kind]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(step.frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(0.08 * normalizedVolume, startsAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + step.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + step.duration + 0.03);
      startsAt += step.duration + 0.04;
    }
    window.setTimeout(() => {
      void context.close().catch(() => undefined);
    }, Math.ceil((startsAt - context.currentTime + 0.2) * 1000));
  } catch {
    // Browsers can block sounds until a user gesture. Calls keep working without audio cues.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
