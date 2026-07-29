export type ParticipantColor = {
  textClassName: string;
  bgClassName: string;
  borderClassName: string;
  bubbleClassName: string;
  hex: string;
};

const participantPalette: ParticipantColor[] = [
  { textClassName: "text-blue-700", bgClassName: "bg-blue-100", borderClassName: "border-blue-300", bubbleClassName: "border-blue-200 bg-blue-50 text-slate-900 dark:border-blue-400/35 dark:bg-blue-950/55 dark:text-blue-50", hex: "#1d4ed8" },
  { textClassName: "text-emerald-700", bgClassName: "bg-emerald-100", borderClassName: "border-emerald-300", bubbleClassName: "border-emerald-200 bg-emerald-50 text-slate-900 dark:border-emerald-400/35 dark:bg-emerald-950/55 dark:text-emerald-50", hex: "#047857" },
  { textClassName: "text-violet-700", bgClassName: "bg-violet-100", borderClassName: "border-violet-300", bubbleClassName: "border-violet-200 bg-violet-50 text-slate-900 dark:border-violet-400/35 dark:bg-violet-950/55 dark:text-violet-50", hex: "#6d28d9" },
  { textClassName: "text-orange-700", bgClassName: "bg-orange-100", borderClassName: "border-orange-300", bubbleClassName: "border-orange-200 bg-orange-50 text-slate-900 dark:border-orange-400/35 dark:bg-orange-950/55 dark:text-orange-50", hex: "#c2410c" },
  { textClassName: "text-cyan-700", bgClassName: "bg-cyan-100", borderClassName: "border-cyan-300", bubbleClassName: "border-cyan-200 bg-cyan-50 text-slate-900 dark:border-cyan-400/35 dark:bg-cyan-950/55 dark:text-cyan-50", hex: "#0e7490" },
  { textClassName: "text-rose-700", bgClassName: "bg-rose-100", borderClassName: "border-rose-300", bubbleClassName: "border-rose-200 bg-rose-50 text-slate-900 dark:border-rose-400/35 dark:bg-rose-950/55 dark:text-rose-50", hex: "#be123c" },
  { textClassName: "text-indigo-700", bgClassName: "bg-indigo-100", borderClassName: "border-indigo-300", bubbleClassName: "border-indigo-200 bg-indigo-50 text-slate-900 dark:border-indigo-400/35 dark:bg-indigo-950/55 dark:text-indigo-50", hex: "#4338ca" },
  { textClassName: "text-teal-700", bgClassName: "bg-teal-100", borderClassName: "border-teal-300", bubbleClassName: "border-teal-200 bg-teal-50 text-slate-900 dark:border-teal-400/35 dark:bg-teal-950/55 dark:text-teal-50", hex: "#0f766e" },
  { textClassName: "text-amber-700", bgClassName: "bg-amber-100", borderClassName: "border-amber-300", bubbleClassName: "border-amber-200 bg-amber-50 text-slate-900 dark:border-amber-400/35 dark:bg-amber-950/55 dark:text-amber-50", hex: "#b45309" },
  { textClassName: "text-slate-700", bgClassName: "bg-slate-200", borderClassName: "border-slate-300", bubbleClassName: "border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-500/35 dark:bg-slate-800/75 dark:text-slate-50", hex: "#334155" },
];

export function getParticipantColor(seed: string | null | undefined): ParticipantColor {
  const value = seed || "dtsc-participant";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return participantPalette[hash % participantPalette.length];
}
