"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlarmClockCheck, Archive, Gauge, Link2, Plus, RefreshCcw, ShieldAlert } from "lucide-react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { toastError, toastInfo, toastSuccess } from "@/lib/client-toast";
import { formatEnumLabelForLocale } from "@/lib/labels-i18n";
import { getOperationalSlaAdminCopy } from "@/lib/operational-sla-i18n";
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
type SlaCopy = ReturnType<typeof getOperationalSlaAdminCopy>;

export function OperationalSlaPanel() {
  const appLocale = useAppLocale();
  const locale = String(appLocale || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
  const copy = getOperationalSlaAdminCopy(locale);
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
    } else toastError(body?.message || copy.loadError);
    setLoading(false);
  }, [copy.loadError]);

  const loadTargets = useCallback(async (objectType: OperationalSlaObjectType) => {
    setTargetsLoading(true);
    const response = await fetch(`/api/operations/sla?targetObjectType=${encodeURIComponent(objectType)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { targets?: SlaTarget[]; message?: string } | null;
    if (response.ok && body) setTargets(body.targets || []);
    else {
      setTargets([]);
      toastError(body?.message || copy.binding.targetLoadError);
    }
    setTargetsLoading(false);
  }, [copy.binding.targetLoadError]);

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
      toastSuccess(copy.policy.created);
      formElement.reset();
      setPolicyObjectType("TASK");
      await load();
    } else toastError(body?.message || copy.policy.createError);
    setSaving(false);
  }

  async function bindInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bindingObjectId || !bindingPolicyId) {
      toastError(copy.binding.selectError);
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
      toastSuccess(copy.binding.started);
      setBindingObjectId("");
      setBindingPolicyId("");
      await Promise.all([load(), loadTargets(bindingObjectType)]);
    } else toastError(body?.message || copy.binding.startError);
    setSaving(false);
  }

  async function evaluate() {
    setSaving(true);
    const response = await fetch("/api/operations/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "EVALUATE" }) });
    const body = (await response.json().catch(() => null)) as { message?: string; results?: unknown[] } | null;
    if (response.ok) {
      toastInfo(copy.evaluationSuccess(body?.results?.length || 0));
      await load();
    } else toastError(body?.message || copy.evaluationError);
    setSaving(false);
  }

  async function archive(policy: SlaPolicy) {
    const confirmation = await confirmSensitiveAction({
      title: copy.archive.title,
      description: copy.archive.description(policy.name),
      confirmLabel: copy.archive.confirm,
      tone: "danger",
    });
    if (!confirmation.confirmed) return;

    setSaving(true);
    const response = await fetch("/api/operations/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ARCHIVE_POLICY", policyId: policy.id }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      toastSuccess(copy.archive.success);
      await load();
    } else toastError(body?.message || copy.archive.error);
    setSaving(false);
  }

  const labelFor = (value: string) => displayReference(value, locale, copy);

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-600"><Gauge className="h-4 w-4" /> {copy.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-black text-dtsc-ink">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{copy.description}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void evaluate()} disabled={saving} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"><RefreshCcw className="h-4 w-4" /> {copy.evaluateNow}</Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label={copy.metrics.running} value={metrics.running} icon={AlarmClockCheck} />
        <Metric label={copy.metrics.warning} value={metrics.warning} icon={ShieldAlert} />
        <Metric label={copy.metrics.breached} value={metrics.breached} icon={Gauge} />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid min-w-0 gap-4 self-start">
          <form onSubmit={createPolicy} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div>
              <h3 className="font-black text-dtsc-ink">{copy.policy.title}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.policy.description}</p>
            </div>
            <FormField label={copy.policy.name} hint={copy.policy.nameHint}><Input name="name" required minLength={3} maxLength={160} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <FormField label={copy.policy.objectType} hint={copy.policy.objectTypeHint}>
                <select name="objectType" value={policyObjectType} onChange={(event) => setPolicyObjectType(event.target.value as OperationalSlaObjectType)} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                  {OPERATIONAL_SLA_OBJECT_TYPES.map((value) => <option key={value} value={value}>{copy.objectTypes[value]}</option>)}
                </select>
              </FormField>
              <FormField label={copy.policy.priority} hint={policyReference?.priorities.length ? copy.policy.priorityHint : copy.policy.priorityUnavailableHint}>
                <select name="priority" disabled={!policyReference?.priorities.length} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                  <option value="">{copy.policy.allPriorities}</option>
                  {(policyReference?.priorities || []).map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
                </select>
              </FormField>
              <FormField label={copy.policy.startStatus} hint={copy.policy.startStatusHint}>
                <select name="startStatus" className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                  <option value="">{copy.policy.anyStartStatus}</option>
                  {(policyReference?.statuses || []).map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
                </select>
              </FormField>
              <FormField label={copy.policy.targetMinutes} hint={copy.policy.targetMinutesHint}><Input name="targetMinutes" type="number" min={5} max={525600} defaultValue={1440} required className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
              <FormField label={copy.policy.warningMinutes} hint={copy.policy.warningMinutesHint}><Input name="warningMinutes" type="number" min={1} max={525599} defaultValue={120} className="h-12 rounded-xl bg-dtsc-surface" /></FormField>
            </div>
            <FormField label={copy.policy.stopStatuses} hint={copy.policy.stopStatusesHint}>
              <div className="grid max-h-56 min-w-0 gap-2 overflow-y-auto rounded-xl border border-dtsc-border bg-dtsc-surface p-3 sm:grid-cols-2">
                {(policyReference?.statuses || []).map((status) => (
                  <label key={status} className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-sm text-dtsc-ink hover:bg-dtsc-page">
                    <input type="checkbox" name="stopStatuses" value={status} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{labelFor(status)}</span>
                  </label>
                ))}
              </div>
            </FormField>
            <Button type="submit" disabled={saving} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> {copy.policy.create}</Button>
          </form>

          <form onSubmit={bindInstance} className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <div>
              <h3 className="flex items-center gap-2 font-black text-dtsc-ink"><Link2 className="h-4 w-4 text-cyan-600" /> {copy.binding.title}</h3>
              <p className="mt-1 text-sm leading-6 text-dtsc-muted">{copy.binding.description}</p>
            </div>
            <FormField label={copy.binding.objectType} hint={copy.binding.objectTypeHint}>
              <select value={bindingObjectType} onChange={(event) => setBindingObjectType(event.target.value as OperationalSlaObjectType)} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
                {OPERATIONAL_SLA_OBJECT_TYPES.map((value) => <option key={value} value={value}>{copy.objectTypes[value]}</option>)}
              </select>
            </FormField>
            <FormField label={copy.binding.target} hint={copy.binding.targetHint}>
              <select value={bindingObjectId} onChange={(event) => { setBindingObjectId(event.target.value); setBindingPolicyId(""); }} disabled={targetsLoading} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                <option value="">{targetsLoading ? copy.binding.loading : copy.binding.selectTarget}</option>
                {targets.map((target) => <option key={target.id} value={target.id}>{target.title} · {labelFor(target.status)}{target.priority ? ` · ${labelFor(target.priority)}` : ""}</option>)}
              </select>
            </FormField>
            <FormField label={copy.binding.policy} hint={copy.binding.policyHint}>
              <select value={bindingPolicyId} onChange={(event) => setBindingPolicyId(event.target.value)} disabled={!bindingObjectId} className="h-12 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink disabled:opacity-60">
                <option value="">{copy.binding.selectPolicy}</option>
                {matchingPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {formatDuration(policy.targetMinutes, locale)}</option>)}
              </select>
            </FormField>
            {selectedTarget && !matchingPolicies.length ? <p role="status" className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{copy.binding.noMatch(labelFor(selectedTarget.status), selectedTarget.priority ? labelFor(selectedTarget.priority) : null)}</p> : null}
            <Button type="submit" disabled={saving || !bindingObjectId || !bindingPolicyId} className="rounded-xl bg-dtsc-blue text-white"><AlarmClockCheck className="h-4 w-4" /> {copy.binding.start}</Button>
            <p className="text-xs leading-5 text-dtsc-muted">{copy.binding.reference(copy.objectTypes[bindingObjectType])}</p>
          </form>
        </div>

        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">{copy.policies.title}</h3>
          <div className="mt-4 max-h-[76dvh] space-y-3 overflow-y-auto pr-1">
            {policies.map((policy) => {
              const reference = getOperationalSlaReference(policy.objectType);
              const stops = stringArray(policy.stopStatusesJson);
              const invalid = Boolean(
                policy.priority && !reference?.priorities.includes(policy.priority)
                || policy.startStatus && !reference?.statuses.includes(policy.startStatus)
                || stops.some((status) => !reference?.statuses.includes(status)),
              );
              const objectLabel = isObjectType(policy.objectType) ? copy.objectTypes[policy.objectType] : policy.objectType;
              return (
                <article key={policy.id} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{objectLabel}</span>
                        {policy.priority ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">{copy.policies.priority}: {labelFor(policy.priority)}</span> : null}
                        {policy.startStatus ? <span className="rounded-full bg-dtsc-page px-2 py-1 text-xs font-black text-dtsc-muted">{copy.policies.start}: {labelFor(policy.startStatus)}</span> : null}
                      </div>
                      <h4 className="mt-2 break-words font-black text-dtsc-ink">{policy.name}</h4>
                      <p className="mt-2 text-xs leading-5 text-dtsc-muted">{copy.policies.target}: {formatDuration(policy.targetMinutes, locale)} · {copy.policies.warning} {policy.warningMinutes ? `${formatDuration(policy.warningMinutes, locale)} ${copy.policies.before}` : copy.policies.warningDisabled} · {instances.filter((instance) => instance.policyId === policy.id).length} {copy.policies.tracking}</p>
                      <p className="mt-1 text-xs leading-5 text-dtsc-muted">{copy.policies.stop}: {stops.length ? stops.map(labelFor).join(", ") : copy.policies.noAutomaticStop}</p>
                      {invalid ? <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-2 py-1 text-xs leading-5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{copy.policies.legacyWarning}</p> : null}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void archive(policy)} disabled={saving} className="shrink-0 text-red-600" aria-label={copy.policies.archiveAria(policy.name)}><Archive className="h-4 w-4" /></Button>
                  </div>
                </article>
              );
            })}
            {!policies.length && !loading ? <p className="rounded-xl border border-dashed border-dtsc-border p-5 text-center text-sm text-dtsc-muted">{copy.policies.empty}</p> : null}
            {loading ? <p className="text-sm text-dtsc-muted">{copy.policies.loading}</p> : null}
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

function displayReference(value: string, locale: "fr" | "en", copy: SlaCopy) {
  const translated = copy.referenceLabels[value as keyof typeof copy.referenceLabels];
  if (translated) return translated;
  if (!value.includes("_") && /[^A-Z]/.test(value)) return value;
  return formatEnumLabelForLocale(value, locale);
}

function formatDuration(minutes: number, locale: "fr" | "en") {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round((minutes / 1440) * 10) / 10} ${locale === "en" ? "d" : "j"}`;
}

function isObjectType(value: string): value is OperationalSlaObjectType {
  return (OPERATIONAL_SLA_OBJECT_TYPES as readonly string[]).includes(value);
}
