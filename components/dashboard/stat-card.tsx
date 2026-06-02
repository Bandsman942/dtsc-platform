import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  title,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  title?: string;
}) {
  return (
    <div className="dtsc-card dtsc-card-hover min-w-0 overflow-hidden p-4 sm:p-6" title={title || helper}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-dtsc-muted">{label}</p>
        <div className="rounded-xl bg-dtsc-soft p-3 text-dtsc-blue">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-5 break-words text-2xl font-black tracking-tight text-dtsc-ink sm:text-3xl">{value}</p>
      <p className="mt-1 break-words text-sm text-dtsc-muted">{helper}</p>
    </div>
  );
}
