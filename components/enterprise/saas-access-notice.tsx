import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function SaasAccessNotice({
  title,
  message,
  planLabel,
  subscriptionStatus,
}: {
  title: string;
  message: string;
  planLabel?: string | null;
  subscriptionStatus?: string | null;
}) {
  return (
    <section className="dtsc-panel p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/14 text-cyan-600">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Accès SaaS</p>
          <h1 className="mt-2 text-2xl font-black text-dtsc-ink">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-dtsc-muted">{message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {planLabel && <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">Plan: {planLabel}</span>}
            {subscriptionStatus && <span className="rounded-full bg-dtsc-page px-3 py-1 text-xs font-black text-dtsc-muted">Statut: {subscriptionStatus}</span>}
            <Link href="/support" className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-black text-white">
              Contacter le support
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
