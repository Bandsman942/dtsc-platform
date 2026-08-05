"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Flag = {
  id: string;
  code: string;
  descriptionFr: string;
  descriptionEn: string;
  status: string;
  audience: string;
  environment: string;
  rolloutPercentage: number;
};

export function FeatureFlagManager({ flags, canManage, locale = "fr" }: { flags: Flag[]; canManage: boolean; locale?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/feature-flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, rolloutPercentage: Number(values.rolloutPercentage || 0), organizationIds: [], userIds: [] }) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    setMessage(response.ok ? (locale === "en" ? "Feature flag created." : "Feature flag créée.") : body?.reasonCode || body?.error || "Erreur");
    if (response.ok) { form.reset(); router.refresh(); }
  }

  async function changeStatus(flag: Flag, status: string) {
    const reason = window.prompt(locale === "en" ? "Reason for this sensitive change" : "Motif de ce changement sensible");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/admin/feature-flags/${flag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, rolloutPercentage: status === "ENABLED" ? Math.max(flag.rolloutPercentage, 100) : flag.rolloutPercentage, reason }) });
    const body = await response.json().catch(() => null);
    setBusy(false);
    setMessage(response.ok ? (locale === "en" ? "Feature flag updated." : "Feature flag mise à jour.") : body?.reasonCode || body?.error || "Erreur");
    if (response.ok) router.refresh();
  }

  return <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Feature flags</p><h2 className="mt-1 text-xl font-black text-dtsc-ink">{locale === "en" ? "Global capabilities" : "Capacités globales pilotées"}</h2></div>{message ? <p role="status" className="rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-bold text-dtsc-blue">{message}</p> : null}</div>
    {canManage ? <form onSubmit={createFlag} className="mt-4 grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2 xl:grid-cols-4">
      <Input name="code" required pattern="[A-Z0-9_]+" placeholder="FEATURE_CODE" />
      <Input name="descriptionFr" required placeholder="Description française" />
      <Input name="descriptionEn" required placeholder="English description" />
      <select name="environment" defaultValue="PRODUCTION" className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm"><option>DEVELOPMENT</option><option>PREVIEW</option><option>PRODUCTION</option></select>
      <select name="audience" defaultValue="INTERNAL" className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm"><option>INTERNAL</option><option>ALL_USERS</option><option>ORGANIZATIONS</option><option>USERS</option></select>
      <Input name="rolloutPercentage" type="number" min={0} max={100} defaultValue={0} />
      <Input name="reason" required minLength={3} placeholder="Motif" />
      <Button disabled={busy} className="rounded-xl bg-[#002b5b] text-white">{locale === "en" ? "Create" : "Créer"}</Button>
    </form> : null}
    <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-dtsc-border"><table className="w-full min-w-[58rem] text-left text-sm"><thead className="bg-dtsc-page text-xs uppercase tracking-[0.1em] text-dtsc-muted"><tr><th className="px-3 py-3">Code</th><th className="px-3 py-3">Statut</th><th className="px-3 py-3">Audience</th><th className="px-3 py-3">Environnement</th><th className="px-3 py-3">Déploiement</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-dtsc-border">{flags.map((flag) => <tr key={flag.id}><td className="break-all px-3 py-3 font-black text-dtsc-ink">{flag.code}</td><td className="px-3 py-3">{flag.status}</td><td className="px-3 py-3">{flag.audience}</td><td className="px-3 py-3">{flag.environment}</td><td className="px-3 py-3">{flag.rolloutPercentage}%</td><td className="px-3 py-3">{canManage ? <div className="flex gap-2"><button disabled={busy || flag.status === "ENABLED"} onClick={() => changeStatus(flag, "ENABLED")} className="rounded-lg border border-dtsc-border px-2 py-1 font-bold">Activer</button><button disabled={busy || flag.status === "DISABLED"} onClick={() => changeStatus(flag, "DISABLED")} className="rounded-lg border border-dtsc-border px-2 py-1 font-bold">Désactiver</button></div> : "—"}</td></tr>)}</tbody></table></div>
    {!flags.length ? <p className="mt-4 rounded-2xl border border-dashed border-dtsc-border p-5 text-sm text-dtsc-muted">{locale === "en" ? "No persisted feature flag." : "Aucune feature flag persistée."}</p> : null}
  </section>;
}
