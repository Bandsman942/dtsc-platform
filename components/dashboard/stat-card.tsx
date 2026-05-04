import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="dtsc-card dtsc-card-hover p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <div className="rounded-xl bg-[#d5e3fd] p-3 text-[#002b5b]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-[#001736]">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}
