"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlarmClockCheck, Archive, Gauge, Plus, RefreshCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";

const OBJECT_TYPES = ["CALENDAR_EVENT", "TASK", "OPERATION", "DEPARTMENT_REQUEST", "BLOCKER", "MEETING", "COLLAB_REQUEST"] as const;

type SlaPolicy = {
  id: string;
  organizationId: string | null;
  name: string;
  objectType: string;
  priority: string | null;
  startStatus: string | null;
  targetMinutes: number;
  warningMinutes: number | null;
  isActive: boolean;
  createdAt: string;
};
type SlaInstance = {
  id: string;
  policyId: string;
  objectType: string;
  objectId: string;
  responsibleUserId: string | null;
  startedAt: string;
  dueAt: string;
  status: string;
  warnedAt: string | null;
  breachedAt: string | null;
};

export function OperationalSlaPanel() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [instances, setInstances] = useState<SlaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/operations/sla", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { policies?: SlaPolicy[]; instances?: SlaInstance[]; message?: string } | null;
    if (response.ok && body) {
      setPolicies(body.policies || []);
      setInstances(body.instances || []);
    } else toastError(body?.message || "Impossible de charger les engagements de délai.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    running: instances.filter((instance) => instance.status === "RUNNING").length,
    warning: instances.filter((instance) => instance.status === "WARNING").length,
    breached: instances.filter((instance) => instance.status === "BREACHED").length,
  }), [instances]);

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/operations/sla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_POLICY",
        name: String(form.get("name") || ""),
        objectType: String(form.get("objectType") || "TASK"),
        targetMinutes: Number(form.get("targetMinutes") || 60),
        warningMinutes: form.get("warningMinutes") ? Number(form.get("warningMinutes")) : undefined,
        escalationUserIds: [],
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      toastSuccess("Règle de délai créée.");
      event.currentTarget.reset();
      await load();
    } else toastError(body?.message || "La règle n’a pas pu être créée.");
    setSaving(false);
  }

  async function evaluate() {
    setSaving(true);
    const response = await fetch("/api/operations/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "EVALUATE" }) });
    const body = (await response.json().catch(() => null)) as { message?: string; results?: unknown[] } | null;
    if (response.ok) {
      toastInfo(`${body?.results?.length || 0} suivi(s) de délai vérifié(s).`);
      await load();
    } else toastError(body?.message || "La vérification n’a pas pu être terminée.");
    setSaving(false);
  }

  async function archive(policy: SlaPolicy) {
    const confirmation = await confirmSensitiveAction({
      title: "Archiver cette règle de délai ?",
      description: `La règle « ${policy.name} » sera archivée et les suivis encore actifs associés seront clôturés.`,
      confirmLabel: "Archiver la règle",
      tone: "danger",
    });
    if (!confirmation.confirmed) return;

    setSaving(true);
    const response = await fetch("/api/operations/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ARCHIVE_POLICY", policyId: policy.id }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      toastSuccess("Règle de délai archivée.");
      await load();
    } else toastError(body?.message || "L’archivage n’a pas pu être effectué.");
    setSaving(false);
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-600"><Gauge className="h-4 w-4" /> SLA opérationnels avancés</p>
          <h2 className="mt-2 text-2xl font-black text-dtsc-ink">Règles, avertissements et dépassements</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Définissez des délais de traitement et suivez les éléments qui approchent ou dépassent leur échéance, sans modifier automatiquement leur statut métier.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void evaluate()} disabled={saving} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><RefreshCcw className="h-4 w-4" /> Évaluer maintenant</Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="En cours" value={metrics.running} icon={AlarmClockCheck} />
        <Metric label="À surveiller" value={metrics.warning} icon={ShieldAlert} />
        <Metric label="Dépassé" value={metrics.breached} icon={Gauge} />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={createPolicy} className="grid gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div>
            <h3 className="font-black text-dtsc-ink">Nouvelle règle de délai</h3>
            <p className="mt-1 text-sm leading-6 text-dtsc-muted">Cette version applique le délai au type de travail sélectionné. Les anciens filtres libres de priorité et de statut ont été retirés tant qu’ils ne sont pas reliés au moteur d’exécution : une règle affichée doit correspondre à un comportement réellement appliqué.</p>
          </div>
          <FormField label="Nom" hint="Nom professionnel de la règle, visible dans le suivi et l’audit."><Input name="name" required minLength={3} maxLength={160} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Type de travail" hint="Choisissez le domaine opérationnel auquel le délai doit réellement s’appliquer."><select name="objectType" className="h-12 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">{OBJECT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
            <FormField label="Objectif en minutes" hint="Durée maximale autorisée entre le démarrage du suivi et son échéance."><Input name="targetMinutes" type="number" min={5} max={525600} defaultValue={1440} required className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
            <FormField label="Avertissement avant échéance" hint="Nombre de minutes avant l’échéance auquel le suivi passe en état d’avertissement."><Input name="warningMinutes" type="number" min={1} max={525599} defaultValue={120} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
          </div>
          <Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Créer la règle</Button>
        </form>

        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">Politiques actives</h3>
          <div className="mt-4 max-h-[68dvh] space-y-3 overflow-y-auto pr-1">
            {policies.map((policy) => (
              <article key={policy.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-4">
                <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{policy.objectType}</span>{policy.priority ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">{policy.priority}</span> : null}</div><h4 className="mt-2 break-words font-black text-dtsc-ink">{policy.name}</h4><p className="mt-2 text-xs leading-5 text-dtsc-muted">Objectif : {formatDuration(policy.targetMinutes)} · avertissement {policy.warningMinutes ? `${formatDuration(policy.warningMinutes)} avant` : "désactivé"} · {instances.filter((instance) => instance.policyId === policy.id).length} suivi(s)</p></div><Button type="button" variant="ghost" size="icon" onClick={() => void archive(policy)} disabled={saving} className="shrink-0 text-red-600" aria-label={`Archiver ${policy.name}`}><Archive className="h-4 w-4" /></Button></div>
              </article>
            ))}
            {!policies.length && !loading ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">Aucune règle active.</p> : null}
            {loading ? <p className="text-sm text-dtsc-muted">Chargement…</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Gauge }) {
  return <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><Icon className="h-4 w-4 text-cyan-600" /></div><p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p></div>;
}
function formatDuration(minutes: number) { if (minutes < 60) return `${minutes} min`; if (minutes < 1440) return `${Math.round((minutes / 60) * 10) / 10} h`; return `${Math.round((minutes / 1440) * 10) / 10} j`; }
