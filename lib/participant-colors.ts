export type ParticipantColor = {
  textClassName: string;
  bgClassName: string;
  borderClassName: string;
  hex: string;
};

const participantPalette: ParticipantColor[] = [
  { textClassName: "text-blue-700", bgClassName: "bg-blue-100", borderClassName: "border-blue-300", hex: "#1d4ed8" },
  { textClassName: "text-emerald-700", bgClassName: "bg-emerald-100", borderClassName: "border-emerald-300", hex: "#047857" },
  { textClassName: "text-violet-700", bgClassName: "bg-violet-100", borderClassName: "border-violet-300", hex: "#6d28d9" },
  { textClassName: "text-orange-700", bgClassName: "bg-orange-100", borderClassName: "border-orange-300", hex: "#c2410c" },
  { textClassName: "text-cyan-700", bgClassName: "bg-cyan-100", borderClassName: "border-cyan-300", hex: "#0e7490" },
  { textClassName: "text-rose-700", bgClassName: "bg-rose-100", borderClassName: "border-rose-300", hex: "#be123c" },
  { textClassName: "text-indigo-700", bgClassName: "bg-indigo-100", borderClassName: "border-indigo-300", hex: "#4338ca" },
  { textClassName: "text-teal-700", bgClassName: "bg-teal-100", borderClassName: "border-teal-300", hex: "#0f766e" },
  { textClassName: "text-amber-700", bgClassName: "bg-amber-100", borderClassName: "border-amber-300", hex: "#b45309" },
  { textClassName: "text-slate-700", bgClassName: "bg-slate-200", borderClassName: "border-slate-300", hex: "#334155" },
];

export function getParticipantColor(seed: string | null | undefined): ParticipantColor {
  const value = seed || "dtsc-participant";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return participantPalette[hash % participantPalette.length];
}
