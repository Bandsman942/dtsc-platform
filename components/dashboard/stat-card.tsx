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
    <div className="dtsc-card dtsc-card-hover p-6" title={title || helper}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-dtsc-muted">{label}</p>
        <div className="rounded-xl bg-dtsc-soft p-3 text-dtsc-blue">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-dtsc-ink">{value}</p>
      <p className="mt-1 text-sm text-dtsc-muted">{helper}</p>
    </div>
  );
}
