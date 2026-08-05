"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Incident = { id: string; reference: string; title: string; service: string; severity: string; status: string; startedAt: string; impact?: string | null; ownerUserId?: string | null; resolvedAt?: string | null };

export function PlatformIncidentManager({ incidents, canManage, locale = "fr" }: { incidents: Incident[]; canManage: boolean; locale?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/admin/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, startedAt: new Date(String(values.startedAt)).toISOString() }) });
    const body = await response.json().catch(() => null); setBusy(false); setMessage(response.ok ? "Incident enregistré." : body?.reasonCode || body?.error || "Erreur");
    if (response.ok) { form.reset(); router.refresh(); }
  }
  async function updateStatus(incident: Incident, status: string) {
    const note = window.prompt(locale === "en" ? "Operational update" : "Mise à jour opérationnelle"); if (!note || note.trim().length < 3) return;
    const cause = status === "CLOSED" ? window.prompt(locale === "en" ? "Root cause" : "Cause racine") : undefined;
    setBusy(true); const response = await fetch(`/api/admin/incidents/${incident.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note, ...(cause ? { cause } : {}) }) });
    const body = await response.json().catch(() => null); setBusy(false); setMessage(response.ok ? "Incident mis à jour." : body?.reasonCode || body?.error || "Erreur"); if (response.ok) router.refresh();
  }
  return <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-600">Platform incidents</p><h2 className="mt-1 text-xl font-black text-dtsc-ink">{locale === "en" ? "Incident governance" : "Gouvernance des incidents"}</h2></div>{message ? <p role="status" className="rounded-xl bg-dtsc-soft px-3 py-2 text-sm font-bold text-dtsc-blue">{message}</p> : null}</div>
    {canManage ? <form onSubmit={create} className="mt-4 grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 md:grid-cols-2 xl:grid-cols-4"><Input name="title" required placeholder="Titre" /><Input name="service" required placeholder="Service" /><select name="severity" defaultValue="MEDIUM" className="rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><Input name="startedAt" required type="datetime-local" /><textarea name="description" required minLength={10} placeholder="Description" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm md:col-span-2" /><textarea name="impact" placeholder="Impact" className="min-h-24 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /><Button disabled={busy} className="self-end rounded-xl bg-[#002b5b] text-white">Créer</Button></form> : null}
    <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-dtsc-border"><table className="w-full min-w-[64rem] text-left text-sm"><thead className="bg-dtsc-page text-xs uppercase tracking-[.1em] text-dtsc-muted"><tr><th className="px-3 py-3">Référence</th><th className="px-3 py-3">Incident</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Sévérité</th><th className="px-3 py-3">Statut</th><th className="px-3 py-3">Début</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-dtsc-border">{incidents.map((incident) => <tr key={incident.id}><td className="px-3 py-3 font-black">{incident.reference}</td><td className="px-3 py-3"><p className="font-bold text-dtsc-ink">{incident.title}</p><p className="mt-1 max-w-sm text-xs text-dtsc-muted">{incident.impact || "Impact non renseigné"}</p></td><td className="px-3 py-3">{incident.service}</td><td className="px-3 py-3">{incident.severity}</td><td className="px-3 py-3">{incident.status}</td><td className="px-3 py-3">{new Date(incident.startedAt).toLocaleString()}</td><td className="px-3 py-3">{canManage ? <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => updateStatus(incident, "INVESTIGATING")} className="rounded-lg border px-2 py-1 font-bold">Investiguer</button><button disabled={busy} onClick={() => updateStatus(incident, "RESOLVED")} className="rounded-lg border px-2 py-1 font-bold">Résoudre</button><button disabled={busy} onClick={() => updateStatus(incident, "CLOSED")} className="rounded-lg border px-2 py-1 font-bold">Clôturer</button></div> : "—"}</td></tr>)}</tbody></table></div>{!incidents.length ? <p className="mt-4 rounded-2xl border border-dashed p-5 text-sm text-dtsc-muted">Aucun incident persistant.</p> : null}</section>;
}
