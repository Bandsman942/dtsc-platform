"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, FilePenLine, HeartPulse, Plus, Stethoscope, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { translate } from "@/lib/i18n";

export type EnterpriseSectorRecordItem = {
  id: string;
  moduleCode: string;
  recordType: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string; email: string };
  assignedTo: { id: string; name: string; email: string } | null;
};

type HealthcareMember = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

type HealthcareModuleCode = "PATIENTS" | "APPOINTMENTS" | "QUALITY_INCIDENTS";
type HealthcareRecordType = "PATIENT_PROFILE" | "APPOINTMENT" | "QUALITY_INCIDENT";

type HealthcareFormState = {
  moduleCode: HealthcareModuleCode;
  recordType: HealthcareRecordType;
  title: string;
  summary: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  patientCode: string;
  patientName: string;
  contactPhone: string;
  appointmentDate: string;
  appointmentType: string;
  careTeam: string;
  incidentType: string;
  severity: string;
  confidentialityLevel: string;
  insuranceProvider: string;
  notes: string;
};

const submodules: Array<{
  code: HealthcareModuleCode;
  type: HealthcareRecordType;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Stethoscope;
}> = [
  {
    code: "PATIENTS",
    type: "PATIENT_PROFILE",
    titleKey: "enterpriseHealthcare.patients",
    descriptionKey: "enterpriseHealthcare.patientsDescription",
    icon: Stethoscope,
  },
  {
    code: "APPOINTMENTS",
    type: "APPOINTMENT",
    titleKey: "enterpriseHealthcare.appointments",
    descriptionKey: "enterpriseHealthcare.appointmentsDescription",
    icon: CalendarClock,
  },
  {
    code: "QUALITY_INCIDENTS",
    type: "QUALITY_INCIDENT",
    titleKey: "enterpriseHealthcare.qualityIncidents",
    descriptionKey: "enterpriseHealthcare.qualityIncidentsDescription",
    icon: AlertTriangle,
  },
];

const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Actif",
  SCHEDULED: "Planifié",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
  ARCHIVED: "Archivé",
};

const priorityLabels: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

function payloadText(record: EnterpriseSectorRecordItem, key: string) {
  const value = record.payloadJson?.[key];
  return typeof value === "string" ? value : "";
}

function defaultForm(moduleCode: HealthcareModuleCode): HealthcareFormState {
  const submodule = submodules.find((item) => item.code === moduleCode) || submodules[0];
  return {
    moduleCode: submodule.code,
    recordType: submodule.type,
    title: "",
    summary: "",
    status: moduleCode === "APPOINTMENTS" ? "SCHEDULED" : "ACTIVE",
    priority: "NORMAL",
    assignedToUserId: "",
    patientCode: "",
    patientName: "",
    contactPhone: "",
    appointmentDate: "",
    appointmentType: "",
    careTeam: "",
    incidentType: "",
    severity: "MEDIUM",
    confidentialityLevel: "CONFIDENTIAL",
    insuranceProvider: "",
    notes: "",
  };
}

function formFromRecord(record: EnterpriseSectorRecordItem): HealthcareFormState {
  const moduleCode = record.moduleCode as HealthcareModuleCode;
  return {
    ...defaultForm(moduleCode),
    moduleCode,
    recordType: record.recordType as HealthcareRecordType,
    title: record.title,
    summary: record.summary || "",
    status: record.status,
    priority: record.priority,
    assignedToUserId: record.assignedTo?.id || "",
    patientCode: payloadText(record, "patientCode"),
    patientName: payloadText(record, "patientName"),
    contactPhone: payloadText(record, "contactPhone"),
    appointmentDate: payloadText(record, "appointmentDate"),
    appointmentType: payloadText(record, "appointmentType"),
    careTeam: payloadText(record, "careTeam"),
    incidentType: payloadText(record, "incidentType"),
    severity: payloadText(record, "severity") || "MEDIUM",
    confidentialityLevel: payloadText(record, "confidentialityLevel") || "CONFIDENTIAL",
    insuranceProvider: payloadText(record, "insuranceProvider"),
    notes: payloadText(record, "notes"),
  };
}

export function HealthcareAdminWorkspace({
  organizationId,
  records,
  members,
  locale,
}: {
  organizationId: string;
  records: EnterpriseSectorRecordItem[];
  members: HealthcareMember[];
  locale?: string | null;
}) {
  const router = useRouter();
  const t = useCallback((key: string) => translate(locale, key), [locale]);
  const [activeModuleCode, setActiveModuleCode] = useState<HealthcareModuleCode>("PATIENTS");
  const [formOpen, setFormOpen] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [editingRecord, setEditingRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [formState, setFormState] = useState<HealthcareFormState>(() => defaultForm("PATIENTS"));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeSubmodule = submodules.find((item) => item.code === activeModuleCode) || submodules[0];
  const visibleRecords = useMemo(() => records.filter((record) => record.moduleCode === activeModuleCode), [activeModuleCode, records]);
  const getSearchText = useCallback(
    (record: EnterpriseSectorRecordItem) =>
      [
        record.title,
        record.summary || "",
        record.status,
        record.priority,
        record.createdBy.name,
        record.assignedTo?.name || "",
        payloadText(record, "patientName"),
        payloadText(record, "patientCode"),
        payloadText(record, "incidentType"),
      ].join(" "),
    [],
  );
  const list = useSmartList({ items: visibleRecords, pageSize: 6, getSearchText });

  function openCreate(moduleCode: HealthcareModuleCode) {
    setEditingRecord(null);
    setFormState(defaultForm(moduleCode));
    setFormOpen(true);
    setMessage("");
  }

  function openEdit(record: EnterpriseSectorRecordItem) {
    setEditingRecord(record);
    setFormState(formFromRecord(record));
    setFormOpen(true);
    setMessage("");
  }

  function updateField(field: keyof HealthcareFormState, value: string) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    const target = editingRecord
      ? `/api/enterprise/${organizationId}/healthcare/${editingRecord.id}`
      : `/api/enterprise/${organizationId}/healthcare`;
    const response = await fetch(target, {
      method: editingRecord ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formState),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setIsSaving(false);
    if (!response.ok) {
      setMessage(body?.message || t("enterpriseHealthcare.failed"));
      return;
    }
    setMessage(editingRecord ? t("enterpriseHealthcare.updated") : t("enterpriseHealthcare.saved"));
    setFormOpen(false);
    router.refresh();
  }

  async function archiveRecord() {
    if (!deleteRecord) {
      return;
    }
    setMessage("");
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/${deleteRecord.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || t("enterpriseHealthcare.failed"));
      return;
    }
    setMessage(t("enterpriseHealthcare.archived"));
    setDeleteRecord(null);
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-[1.5rem] border border-cyan-300/25 bg-cyan-400/10 p-3 shadow-[0_20px_70px_rgba(0,23,54,0.16)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{t("enterpriseHealthcare.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">{t("enterpriseHealthcare.title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            {t("enterpriseHealthcare.description")}
          </p>
        </div>
        <Button type="button" onClick={() => openCreate(activeModuleCode)} className="rounded-2xl bg-[#00c2ff] text-[#001736] hover:bg-cyan-300">
          <Plus className="h-4 w-4" />
          {t("enterpriseHealthcare.add")}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {submodules.map((submodule) => {
          const Icon = submodule.icon;
          const active = submodule.code === activeModuleCode;
          const count = records.filter((record) => record.moduleCode === submodule.code).length;
          return (
            <button
              key={submodule.code}
              type="button"
              onClick={() => setActiveModuleCode(submodule.code)}
              className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-cyan-300 bg-cyan-300/20 shadow-[0_18px_50px_rgba(34,211,238,0.18)]"
                  : "border-dtsc-border bg-dtsc-surface hover:border-cyan-300/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#001f46] text-cyan-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-dtsc-ink">{t(submodule.titleKey)}</span>
                  <span className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-dtsc-muted">{t(submodule.descriptionKey)}</span>
                  <span className="mt-2 inline-flex rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-cyan-600">{count} élément(s)</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-dtsc-ink">{t(activeSubmodule.titleKey)}</h3>
            <p className="text-sm font-semibold text-dtsc-muted">{t(activeSubmodule.descriptionKey)}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => openCreate(activeModuleCode)} className="rounded-xl border-cyan-300/50 bg-dtsc-page text-cyan-600 hover:bg-cyan-400/10">
            <Plus className="h-4 w-4" />
            {t("enterpriseHealthcare.new")}
          </Button>
        </div>
        <ListControls
          query={list.query}
          onQueryChange={list.setQuery}
          page={list.page}
          pageCount={list.pageCount}
          totalCount={list.totalCount}
          filteredCount={list.filteredCount}
          placeholder={t("enterpriseHealthcare.search")}
          onPageChange={list.setPage}
        />
        <div className="grid gap-3">
          {list.paginatedItems.map((record) => (
            <article key={record.id} className="dtsc-glass-list-item rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setDetailsRecord(record)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={record.status} />
                    <PriorityBadge value={record.priority} />
                  </div>
                  <h4 className="mt-2 text-base font-black text-dtsc-ink">{record.title}</h4>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-dtsc-muted">{record.summary || payloadText(record, "notes") || "Aucun résumé renseigné."}</p>
                  <p className="mt-2 text-xs font-bold text-dtsc-muted">
                    Responsable: {record.assignedTo?.name || "Non assigné"} · Créé par {record.createdBy.name}
                  </p>
                </button>
                <ActionMenu
                  label="Actions santé"
                  items={[
                    { key: "details", label: t("enterpriseHealthcare.details"), icon: HeartPulse, onSelect: () => setDetailsRecord(record) },
                    { key: "edit", label: t("common.edit"), icon: FilePenLine, onSelect: () => openEdit(record) },
                    { key: "archive", label: t("common.archive"), icon: Trash2, destructive: true, onSelect: () => setDeleteRecord(record) },
                  ]}
                />
              </div>
            </article>
          ))}
          {!list.paginatedItems.length && (
            <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center">
              <p className="text-sm font-black text-dtsc-ink">{t("enterpriseHealthcare.empty")}</p>
              <p className="mt-1 text-xs font-semibold text-dtsc-muted">{t("enterpriseHealthcare.emptyHint")}</p>
            </div>
          )}
        </div>
      </div>

      {message && <p className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 p-3 text-sm font-bold text-cyan-700 dark:text-cyan-200">{message}</p>}

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingRecord ? t("enterpriseHealthcare.formEdit") : t("enterpriseHealthcare.formCreate")}
        description={t("enterpriseHealthcare.formDescription")}
        className="max-w-5xl sm:min-h-[min(42rem,calc(100dvh-2rem))]"
      >
        <form onSubmit={submitForm} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("enterpriseHealthcare.labels.title")}>
              <Input value={formState.title} onChange={(event) => updateField("title", event.target.value)} required placeholder="Nom du patient, rendez-vous ou incident" />
            </Field>
            <Field label={t("enterpriseHealthcare.labels.assignee")}>
              <select value={formState.assignedToUserId} onChange={(event) => updateField("assignedToUserId", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                <option value="">Non assigné</option>
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name} · {member.role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("enterpriseHealthcare.labels.status")}>
              <select value={formState.status} onChange={(event) => updateField("status", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label={t("enterpriseHealthcare.labels.priority")}>
              <select value={formState.priority} onChange={(event) => updateField("priority", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t("enterpriseHealthcare.labels.summary")}>
            <textarea value={formState.summary} onChange={(event) => updateField("summary", event.target.value)} rows={3} className="w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-semibold text-dtsc-ink" placeholder="Résumé opérationnel visible dans la liste" />
          </Field>

          {formState.moduleCode === "PATIENTS" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("enterpriseHealthcare.labels.patientCode")}><Input value={formState.patientCode} onChange={(event) => updateField("patientCode", event.target.value)} placeholder="PAT-0001" /></Field>
              <Field label={t("enterpriseHealthcare.labels.patientName")}><Input value={formState.patientName} onChange={(event) => updateField("patientName", event.target.value)} placeholder="Nom complet" /></Field>
              <Field label={t("enterpriseHealthcare.labels.phone")}><Input value={formState.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} placeholder="+243..." /></Field>
              <Field label={t("enterpriseHealthcare.labels.insurance")}><Input value={formState.insuranceProvider} onChange={(event) => updateField("insuranceProvider", event.target.value)} placeholder="Assureur, mutuelle ou prise en charge" /></Field>
            </div>
          )}

          {formState.moduleCode === "APPOINTMENTS" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("enterpriseHealthcare.labels.patient")}><Input value={formState.patientName} onChange={(event) => updateField("patientName", event.target.value)} placeholder="Patient concerné" /></Field>
              <Field label={t("enterpriseHealthcare.labels.date")}><Input type="datetime-local" value={formState.appointmentDate} onChange={(event) => updateField("appointmentDate", event.target.value)} /></Field>
              <Field label={t("enterpriseHealthcare.labels.appointmentType")}><Input value={formState.appointmentType} onChange={(event) => updateField("appointmentType", event.target.value)} placeholder="Consultation, contrôle, laboratoire..." /></Field>
              <Field label={t("enterpriseHealthcare.labels.careTeam")}><Input value={formState.careTeam} onChange={(event) => updateField("careTeam", event.target.value)} placeholder="Médecin, infirmier, service..." /></Field>
            </div>
          )}

          {formState.moduleCode === "QUALITY_INCIDENTS" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("enterpriseHealthcare.labels.incidentType")}><Input value={formState.incidentType} onChange={(event) => updateField("incidentType", event.target.value)} placeholder="Confidentialité, sécurité, qualité..." /></Field>
              <Field label={t("enterpriseHealthcare.labels.severity")}>
                <select value={formState.severity} onChange={(event) => updateField("severity", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
                  {["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label={t("enterpriseHealthcare.labels.patient")}><Input value={formState.patientName} onChange={(event) => updateField("patientName", event.target.value)} placeholder="Facultatif selon confidentialité" /></Field>
              <Field label={t("enterpriseHealthcare.labels.careTeam")}><Input value={formState.careTeam} onChange={(event) => updateField("careTeam", event.target.value)} placeholder="Service, équipe ou référent" /></Field>
            </div>
          )}

          <Field label={t("enterpriseHealthcare.labels.confidentiality")}>
            <select value={formState.confidentialityLevel} onChange={(event) => updateField("confidentialityLevel", event.target.value)} className="h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="STANDARD">Standard</option>
              <option value="CONFIDENTIAL">Confidentiel</option>
              <option value="RESTRICTED">Restreint</option>
            </select>
          </Field>

          <Field label={t("enterpriseHealthcare.labels.notes")}>
            <textarea value={formState.notes} onChange={(event) => updateField("notes", event.target.value)} rows={5} className="w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-semibold text-dtsc-ink" placeholder="Détails utiles, prochaine action, validation attendue..." />
          </Field>

          <div className="flex flex-wrap justify-end gap-3 border-t border-dtsc-border pt-4">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">Annuler</Button>
            <Button type="submit" disabled={isSaving} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detailsRecord)} onClose={() => setDetailsRecord(null)} title={detailsRecord?.title || "Détail santé"} className="max-w-4xl">
        {detailsRecord && <HealthcareDetails record={detailsRecord} locale={locale} />}
      </Dialog>

      <Dialog
        open={Boolean(deleteRecord)}
        onClose={() => setDeleteRecord(null)}
        title={t("enterpriseHealthcare.archiveTitle")}
        description={t("enterpriseHealthcare.archiveDescription")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">Annuler</Button>
            <Button type="button" onClick={() => void archiveRecord()} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Archiver</Button>
          </>
        }
      >
        <p className="text-sm font-semibold text-dtsc-muted">{t("enterpriseHealthcare.archiveConfirm").replace("{title}", deleteRecord?.title || "")}</p>
      </Dialog>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-black text-dtsc-ink">
      <span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className="rounded-full bg-cyan-400/14 px-2 py-1 text-[0.68rem] font-black text-cyan-600">{statusLabels[value] || value}</span>;
}

function PriorityBadge({ value }: { value: string }) {
  const className = value === "CRITICAL" ? "bg-red-500/14 text-red-500" : value === "HIGH" ? "bg-amber-500/14 text-amber-600" : "bg-emerald-500/14 text-emerald-600";
  return <span className={`rounded-full px-2 py-1 text-[0.68rem] font-black ${className}`}>{priorityLabels[value] || value}</span>;
}

function HealthcareDetails({ record, locale }: { record: EnterpriseSectorRecordItem; locale?: string | null }) {
  const t = (key: string) => translate(locale, key);
  const rows = [
    [t("enterpriseHealthcare.labels.status"), statusLabels[record.status] || record.status],
    [t("enterpriseHealthcare.labels.priority"), priorityLabels[record.priority] || record.priority],
    [t("enterpriseHealthcare.labels.assignee"), record.assignedTo?.name || "Non assigné"],
    [t("enterpriseHealthcare.labels.patient"), payloadText(record, "patientName")],
    [t("enterpriseHealthcare.labels.patientCode"), payloadText(record, "patientCode")],
    [t("enterpriseHealthcare.appointments"), payloadText(record, "appointmentDate")],
    ["Type", payloadText(record, "appointmentType") || payloadText(record, "incidentType")],
    [t("enterpriseHealthcare.labels.careTeam"), payloadText(record, "careTeam")],
    [t("enterpriseHealthcare.labels.confidentiality"), payloadText(record, "confidentialityLevel")],
    [t("enterpriseHealthcare.labels.notes"), payloadText(record, "notes")],
  ].filter((row) => row[1]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <div className="flex flex-wrap gap-2"><StatusBadge value={record.status} /><PriorityBadge value={record.priority} /></div>
        <p className="mt-3 text-sm leading-6 text-dtsc-muted">{record.summary || "Aucun résumé renseigné."}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-bold text-dtsc-ink">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-dtsc-muted">Créé par {record.createdBy.name}. Les données restent confinées à cette entreprise.</p>
    </div>
  );
}
