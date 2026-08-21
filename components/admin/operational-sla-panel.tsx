"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlarmClockCheck, Archive, Gauge, Link2, Plus, RefreshCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";
import { formatEnumLabel } from "@/lib/labels";
import {
  getOperationalSlaReference,
  OPERATIONAL_SLA_OBJECT_TYPES,
  type OperationalSlaObjectType,
} from "@/lib/operational-sla-reference";

type SlaPolicy = {
  id: string;
  organizationId: string | null;
  name: string;
  objectType: string;
  priority: string | null;
  startStatus: string | null;
  stopStatusesJson: unknown;
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
  completedAt?: string | null;
};
type SlaTarget = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
};

export function OperationalSlaPanel() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [instances, setInstances] = useState<SlaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyObjectType, setPolicyObjectType] = useState<OperationalSlaObjectType>("TASK");
  const [bindingObjectType, setBindingObjectType] = useState<OperationalSlaObjectType>("TASK");
  const [bindingObjectId, setBindingObjectId] = useState("");
  const [bindingPolicyId, setBindingPolicyId] = useState("");
  const [targets, setTargets] = useState<SlaTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

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

  const loadTargets = useCallback(async (objectType: OperationalSlaObjectType) => {
    setTargetsLoading(true);
    const response = await fetch(`/api/operations/sla?targetObjectType=${encodeURIComponent(objectType)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { targets?: SlaTarget[]; message?: string } | null;
    if (response.ok && body) setTargets(body.targets || []);
    else {
      setTargets([]);
      toastError(body?.message || "Impossible de charger les objets accessibles pour ce type de travail.");
    }
    setTargetsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setBindingObjectId("");
    setBindingPolicyId("");
    void loadTargets(bindingObjectType);
  }, [bindingObjectType, loadTargets]);

  const metrics = useMemo(() => ({
    running: instances.filter((instance) => instance.status === "RUNNING").length,
    warning: instances.filter((instance) => instance.status === "WARNING").length,
    breached: instances.filter((instance) => instance.status === "BREACHED").length,
  }), [instances]);

  const policyReference = getOperationalSlaReference(policyObjectType);
  const bindingReference = getOperationalSlaReference(bindingObjectType);
  const selectedTarget = targets.find((target) => target.id === bindingObjectId) || null;
  const matchingPolicies = useMemo(() => policies.filter((policy) => {
    if (!policy.isActive || policy.objectType !== bindingObjectType) return false;
    if (!selectedTarget) return true;
    const reference = getOperationalSlaReference(policy.objectType);
    if (!reference) return false;
    if (policy.priority && reference.priorities.includes(policy.priority) && selectedTarget.priority !== policy.priority) return false;
    if (policy.startStatus && reference.statuses.includes(policy.startStatus) && selectedTarget.status !== policy.startStatus) return false;
    const validStops = stringArray(policy.stopStatusesJson).filter((status) => reference.statuses.includes(status));
    return !validStops.includes(selectedTarget.status);
  }), [bindingObjectType, policies, selectedTarget]);

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/operations/sla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_POLICY",
        name: String(form.get("name") || ""),
        objectType: policyObjectType,
        priority: String(form.get("priority") || ""),
        startStatus: String(form.get("startStatus") || ""),
        stopStatuses: form.getAll("stopStatuses").map(String),
        targetMinutes: Number(form.get("targetMinutes") || 60),
        warningMinutes: form.get("warningMinutes") ? Number(form.get("warningMinutes")) : undefined,
        escalationUserIds: [],
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      toastSuccess("Règle de délai créée avec ses filtres métier.");
      formElement.reset();
      setPolicyObjectType("TASK");
      await load();
    } else toastError(body?.message || "La règle n’a pas pu être créée.");
    setSaving(false);
  }

  async function bindInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bindingObjectId || !bindingPolicyId) {
      toastError("Sélectionnez un objet et une politique compatibles.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/operations/sla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "BIND_INSTANCE", objectType: bindingObjectType, objectId: bindingObjectId, policyId: bindingPolicyId }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      toastSuccess("Suivi SLA démarré sur l’objet sélectionné.");
      setBindingObjectId("");
      setBindingPolicyId("");
      await Promise.all([load(), loadTargets(bindingObjectType)]);
    } else toastError(body?.message || "Le suivi SLA n’a pas pu être démarré.");
    setSaving(false);
  }

  async function evaluate() {
    setSaving(true);
    const response = await fetch("/api/operations/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "EVALUATE" }) });
    const body = (await response.json().catch(() => null)) as { message?: string; results?: unknown[] } | null;
    if (response.ok) {
      toastInfo(`${body?.results?.length || 0} suivi(s) de délai vérifié(s). Les statuts d’arrêt atteints sont clôturés automatiquement.`);
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
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">Définissez des délais par workflow, priorité et statut. Le suivi ne démarre que si les filtres de la règle correspondent réellement à l’objet, puis se clôt automatiquement lorsqu’un statut d’arrêt est atteint.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void evaluate()} disabled={saving} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><RefreshCcw className="h-4 w-4" /> Évaluer maintenant</Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="En cours" value={metrics.running} icon={AlarmClockCheck} />
        <Metric label="À surveiller" value={metrics.warning} icon={ShieldAlert} />
        <Metric label="Dépassé" value={metrics.breached} icon={Gauge} />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid min-w-0 gap-4 self-start">
          <form onSubmit={createPolicy} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div>
              <h3 className="font-black text-dtsc-ink">Nouvelle règle de délai</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">Les priorités et statuts proposés proviennent maintenant du workflow réel du type sélectionné. Aucun code libre n’est demandé.</p>
            </div>
            <FormField label="Nom" hint="Nom professionnel de la règle, visible dans le suivi et l’audit."><Input name="name" required minLength={3} maxLength={160} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <FormField label="Type de travail" hint="Le référentiel de priorités et de statuts s’adapte automatiquement à ce workflow.">
                <select name="objectType" value={policyObjectType} onChange={(event) => setPolicyObjectType(event.target.value as OperationalSlaObjectType)} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                  {OPERATIONAL_SLA_OBJECT_TYPES.map((value) => <option key={value} value={value}>{getOperationalSlaReference(value)?.label || value}</option>)}
                </select>
              </FormField>
              <FormField label="Priorité ciblée" hint={policyReference?.priorities.length ? "Optionnel : la règle ne pourra démarrer que sur cette priorité." : "Ce workflow n’a pas de priorité canonique à filtrer."}>
                <select name="priority" disabled={!policyReference?.priorities.length} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                  <option value="">Toutes les priorités</option>
                  {(policyReference?.priorities || []).map((value) => <option key={value} value={value}>{displayReference(value)}</option>)}
                </select>
              </FormField>
              <FormField label="Statut de démarrage" hint="Optionnel : si renseigné, le suivi ne démarre que lorsque l’objet se trouve exactement dans ce statut.">
                <select name="startStatus" className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                  <option value="">Tout statut de départ</option>
                  {(policyReference?.statuses || []).map((value) => <option key={value} value={value}>{displayReference(value)}</option>)}
                </select>
              </FormField>
              <FormField label="Objectif en minutes" hint="Durée maximale autorisée entre le démarrage effectif du suivi et son échéance."><Input name="targetMinutes" type="number" min={5} max={525600} defaultValue={1440} required className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
              <FormField label="Avertissement avant échéance" hint="Nombre de minutes avant l’échéance auquel le suivi passe en état d’avertissement."><Input name="warningMinutes" type="number" min={1} max={525599} defaultValue={120} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
            </div>
            <FormField label="Statuts qui clôturent le suivi" hint="Cochez un ou plusieurs statuts métier : l’évaluation SLA marquera automatiquement l’instance comme terminée dès qu’un de ces statuts est atteint.">
              <div className="grid max-h-56 min-w-0 gap-2 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2">
                {(policyReference?.statuses || []).map((status) => (
                  <label key={status} className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-sm text-dtsc-ink hover:bg-dtsc-page">
                    <input type="checkbox" name="stopStatuses" value={status} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{displayReference(status)}</span>
                  </label>
                ))}
              </div>
            </FormField>
            <Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Créer la règle</Button>
          </form>

          <form onSubmit={bindInstance} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div>
              <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Link2 className="h-4 w-4 text-cyan-600" /> Démarrer un suivi</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">Sélectionnez un objet visible puis une règle compatible. Le serveur revalide l’accès, la priorité et le statut avant de démarrer le chrono.</p>
            </div>
            <FormField label="Type de travail" hint="Changez le type pour charger uniquement les objets que vous avez le droit de consulter.">
              <select value={bindingObjectType} onChange={(event) => setBindingObjectType(event.target.value as OperationalSlaObjectType)} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                {OPERATIONAL_SLA_OBJECT_TYPES.map((value) => <option key={value} value={value}>{getOperationalSlaReference(value)?.label || value}</option>)}
              </select>
            </FormField>
            <FormField label="Objet à suivre" hint="La liste contient au maximum les objets accessibles du workflow sélectionné ; aucun identifiant interne n’est à recopier.">
              <select value={bindingObjectId} onChange={(event) => { setBindingObjectId(event.target.value); setBindingPolicyId(""); }} disabled={targetsLoading} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                <option value="">{targetsLoading ? "Chargement…" : "Sélectionner un objet"}</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.title} · {displayReference(target.status)}{target.priority ? ` · ${displayReference(target.priority)}` : ""}</option>)}
              </select>
            </FormField>
            <FormField label="Règle compatible" hint="Les règles valides pour le type, la priorité et le statut actuels de l’objet sont proposées en priorité.">
              <select value={bindingPolicyId} onChange={(event) => setBindingPolicyId(event.target.value)} disabled={!bindingObjectId} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                <option value="">Sélectionner une règle</option>
                {matchingPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {formatDuration(policy.targetMinutes)}</option>)}
              </select>
            </FormField>
            {selectedTarget && !matchingPolicies.length ? <p role="status" className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Aucune règle active ne correspond actuellement au statut {displayReference(selectedTarget.status)}{selectedTarget.priority ? ` et à la priorité ${displayReference(selectedTarget.priority)}` : ""}. Créez ou ajustez une règle avant de démarrer le suivi.</p> : null}
            <Button type="submit" disabled={saving || !bindingObjectId || !bindingPolicyId} className="rounded-xl bg-dtsc-blue text-white"><AlarmClockCheck className="h-4 w-4" /> Démarrer le suivi</Button>
            <p className="text-xs leading-5 text-dtsc-muted">Référentiel actuel : {bindingReference?.label || bindingObjectType}. Les filtres historiques non reconnus restent lisibles mais ne deviennent jamais de nouveaux choix autorisés.</p>
          </form>
        </div>

        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">Politiques actives</h3>
          <div className="mt-4 max-h-[76dvh] space-y-3 overflow-y-auto pr-1">
            {policies.map((policy) => {
              const reference = getOperationalSlaReference(policy.objectType);
              const stops = stringArray(policy.stopStatusesJson);
              const invalid = Boolean(
                policy.priority && !reference?.priorities.includes(policy.priority)
                || policy.startStatus && !reference?.statuses.includes(policy.startStatus)
                || stops.some((status) => !reference?.statuses.includes(status)),
              );
              return (
                <article key={policy.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{reference?.label || policy.objectType}</span>
                        {policy.priority ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">Priorité : {displayReference(policy.priority)}</span> : null}
                        {policy.startStatus ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">Départ : {displayReference(policy.startStatus)}</span> : null}
                      </div>
                      <h4 className="mt-2 break-words font-black text-dtsc-ink">{policy.name}</h4>
                      <p className="mt-2 text-xs leading-5 text-dtsc-muted">Objectif : {formatDuration(policy.targetMinutes)} · avertissement {policy.warningMinutes ? `${formatDuration(policy.warningMinutes)} avant` : "désactivé"} · {instances.filter((instance) => instance.policyId === policy.id).length} suivi(s)</p>
                      <p className="mt-1 text-xs leading-5 text-dtsc-muted">Arrêt : {stops.length ? stops.map(displayReference).join(", ") : "aucun statut automatique"}</p>
                      {invalid ? <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-2 py-1 text-xs leading-5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">Cette règle contient une ancienne valeur hors référentiel. Elle reste lisible pour compatibilité, mais cette valeur historique est ignorée par le moteur.</p> : null}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void archive(policy)} disabled={saving} className="shrink-0 text-red-600" aria-label={`Archiver ${policy.name}`}><Archive className="h-4 w-4" /></Button>
                  </div>
                </article>
              );
            })}
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

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function displayReference(value: string) {
  if (!value.includes("_") && /[^A-Z]/.test(value)) return value;
  return formatEnumLabel(value);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round((minutes / 1440) * 10) / 10} j`;
}
