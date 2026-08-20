"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarPlus, CircleHelp, ClipboardPlus, Eye, FilePenLine, HeartPulse, Plus, ShieldAlert } from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import {
  healthClinicalDateTime,
  healthClinicalStatusLabel,
  healthClinicalT,
  useHealthClinicalLocale,
  type HealthClinicalKey,
  type HealthClinicalLocale,
} from "@/components/enterprise/health-clinical-i18n";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { useToastMessage } from "@/components/ui/use-toast-message";

type Patient = {
  id: string;
  legacyRecordId: string | null;
  patientNumber: string;
  fullName: string;
  sex: string;
  birthDate: string | null;
  phonePrimary: string;
  phoneSecondary: string | null;
  email: string | null;
  address: string;
  city: string | null;
  country: string | null;
  emergencyContactName: string;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string;
  emergencyContactAddress: string | null;
  profession: string | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  importantHistory: string | null;
  chronicTreatments: string | null;
  medicalNotes: string | null;
  administrativeNotes: string | null;
  insuranceKnown: boolean;
  insuranceReference: string | null;
  registrationSource: string;
  status: string;
  archivedAt: string | null;
  deceasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { name: string };
  updatedBy: { name: string } | null;
  lastConsultation?: { id: string; title: string; status: string; updatedAt: string } | null;
  events?: Array<{ id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; createdAt: string; actor: { name: string } }>;
};

type Permissions = { canCreate: boolean; canUpdate: boolean; canArchive: boolean; canViewSensitive: boolean };
type Related = { id: string; moduleCode: string; title: string; summary: string | null; status: string; updatedAt: string };
type Dispensation = {
  id: string;
  quantity: number;
  dispensedAt: string;
  billingStatus: string;
  product: { name: string; productCode: string; unit: string };
  consultation: { consultationNumber: string } | null;
  dispensedBy: { name: string };
};
type Form = Record<string, string | boolean>;
type Translator = (key: HealthClinicalKey, values?: Record<string, string | number>) => string;

const SEX_KEYS = {
  FEMALE: "patient.sex.FEMALE",
  MALE: "patient.sex.MALE",
  OTHER: "patient.sex.OTHER",
  NOT_SPECIFIED: "patient.sex.NOT_SPECIFIED",
} as const satisfies Record<string, HealthClinicalKey>;

const SOURCE_KEYS = {
  RECEPTION: "patient.source.RECEPTION",
  CONSULTATION: "patient.source.CONSULTATION",
  EMERGENCY: "patient.source.EMERGENCY",
  EXTERNAL_REFERRAL: "patient.source.EXTERNAL_REFERRAL",
  MEDICAL_CAMPAIGN: "patient.source.MEDICAL_CAMPAIGN",
  OTHER: "patient.source.OTHER",
} as const satisfies Record<string, HealthClinicalKey>;

const MODULE_KEYS = {
  APPOINTMENTS: "patient.module.APPOINTMENTS",
  CONSULTATIONS: "patient.module.CONSULTATIONS",
  LABORATORY: "patient.module.LABORATORY",
  MEDICAL_BILLING: "patient.module.MEDICAL_BILLING",
  MEDICAL_DOCUMENTS: "patient.module.MEDICAL_DOCUMENTS",
  INSURANCE_COVERAGE: "patient.module.INSURANCE_COVERAGE",
  QUALITY_INCIDENTS: "patient.module.QUALITY_INCIDENTS",
  MEDICAL_RECORDS: "patient.module.MEDICAL_RECORDS",
} as const satisfies Record<string, HealthClinicalKey>;

const PATIENT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED", "DECEASED"] as const;

const emptyForm = (): Form => ({
  fullName: "",
  sex: "NOT_SPECIFIED",
  birthDate: "",
  phonePrimary: "",
  phoneSecondary: "",
  email: "",
  address: "",
  city: "",
  country: "RDC",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  emergencyContactAddress: "",
  profession: "",
  maritalStatus: "",
  bloodGroup: "",
  knownAllergies: "",
  importantHistory: "",
  chronicTreatments: "",
  medicalNotes: "",
  administrativeNotes: "",
  insuranceKnown: false,
  insuranceReference: "",
  registrationSource: "RECEPTION",
  status: "ACTIVE",
  actionReason: "",
});

function formFromPatient(patient: Patient, forcedStatus?: string) {
  const form = emptyForm();
  const source = patient as unknown as Record<string, unknown>;
  for (const key of Object.keys(form)) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "boolean") form[key] = value;
    else if (value === null || value === undefined) form[key] = "";
  }
  form.birthDate = patient.birthDate?.slice(0, 10) || "";
  form.status = forcedStatus || patient.status;
  form.actionReason = "";
  return form;
}

function localizedOptions(keys: Record<string, HealthClinicalKey>, t: Translator) {
  return Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, t(key)]));
}

export function HealthPatientsWorkspace({
  organizationId,
  activeModuleCodes,
  onOpenRelated,
}: {
  organizationId: string;
  activeModuleCodes: Set<string>;
  onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void;
}) {
  const router = useRouter();
  const locale = useHealthClinicalLocale();
  const t = useCallback<Translator>((key, values) => healthClinicalT(locale, key, values), [locale]);
  const sexOptions = useMemo(() => localizedOptions(SEX_KEYS, t), [t]);
  const sourceOptions = useMemo(() => localizedOptions(SOURCE_KEYS, t), [t]);
  const statusOptions = useMemo(() => Object.fromEntries(PATIENT_STATUSES.map((id) => [id, healthClinicalStatusLabel(locale, id)])), [locale]);
  const localeCode = locale === "en" ? "en-US" : "fr-FR";

  const [patients, setPatients] = useState<Patient[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canCreate: false, canUpdate: false, canArchive: false, canViewSensitive: false });
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [detail, setDetail] = useState<Patient | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const [dispensations, setDispensations] = useState<Dispensation[]>([]);
  const [query, setQuery] = useState("");
  const [sex, setSex] = useState("");
  const [status, setStatus] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/patients`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { patients?: Patient[]; permissions?: Permissions; message?: string } | null;
    if (response.ok && body?.patients && body.permissions) {
      setPatients(body.patients);
      setPermissions(body.permissions);
    } else {
      setMessage(body?.message || t("patient.loadFailed"));
    }
    setLoading(false);
  }, [organizationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => patients.filter((patient) => {
      const text = `${patient.fullName} ${patient.phonePrimary} ${patient.patientNumber}`.toLocaleLowerCase(localeCode);
      const created = patient.createdAt.slice(0, 10);
      return (
        (!query || text.includes(query.toLocaleLowerCase(localeCode)))
        && (!sex || patient.sex === sex)
        && (!status || patient.status === status)
        && (!createdFrom || created >= createdFrom)
        && (!createdTo || created <= createdTo)
      );
    }),
    [patients, query, sex, status, createdFrom, createdTo, localeCode],
  );

  const list = useSmartList({
    items: filtered,
    pageSize: 12,
    getSearchText: useCallback((patient: Patient) => `${patient.fullName} ${patient.phonePrimary} ${patient.patientNumber}`, []),
  });

  async function openDetail(patient: Patient) {
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/patients/${patient.id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { patient?: Patient; related?: Related[]; dispensations?: Dispensation[]; message?: string } | null;
    if (response.ok && body?.patient) {
      setDetail(body.patient);
      setRelated(body.related || []);
      setDispensations(body.dispensations || []);
    } else {
      setMessage(body?.message || t("patient.detailUnavailable"));
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(patient: Patient, forcedStatus?: string) {
    setEditing(patient);
    setForm(formFromPatient(patient, forcedStatus));
    setFormOpen(true);
  }

  function change(key: string, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(
      editing ? `/api/enterprise/${organizationId}/healthcare/patients/${editing.id}` : `/api/enterprise/${organizationId}/healthcare/patients`,
      { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) },
    );
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? (editing ? t("patient.updated") : t("patient.saved")) : body?.message || t("patient.saveFailed"));
    if (response.ok) {
      setFormOpen(false);
      setDetail(null);
      await load();
      router.refresh();
    }
  }

  function openRelated(moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) {
    setDetail(null);
    onOpenRelated(moduleCode, patientRecordId);
  }

  return (
    <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-black text-dtsc-ink">{t("patient.title")}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("patient.description")}</p>
        </div>
        {permissions.canCreate && (
          <Button className="w-full bg-[#002b5b] text-white sm:w-auto" onClick={openCreate}>
            <Plus className="h-4 w-4" />{t("patient.new")}
          </Button>
        )}
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Filter label={t("patient.filter.sex")} help={t("patient.filter.help", { label: t("patient.filter.sex").toLocaleLowerCase(localeCode) })} helpAria={t("patient.filter.helpAria", { label: t("patient.filter.sex") })}>
          <Choice value={sex} onChange={setSex} options={sexOptions} all={t("patient.filter.allSexes")} />
        </Filter>
        <Filter label={t("patient.filter.status")} help={t("patient.filter.help", { label: t("patient.filter.status").toLocaleLowerCase(localeCode) })} helpAria={t("patient.filter.helpAria", { label: t("patient.filter.status") })}>
          <Choice value={status} onChange={setStatus} options={statusOptions} all={t("patient.filter.allStatuses")} />
        </Filter>
        <Filter label={t("patient.filter.createdFrom")} help={t("patient.filter.help", { label: t("patient.filter.createdFrom").toLocaleLowerCase(localeCode) })} helpAria={t("patient.filter.helpAria", { label: t("patient.filter.createdFrom") })}>
          <Input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
        </Filter>
        <Filter label={t("patient.filter.createdTo")} help={t("patient.filter.help", { label: t("patient.filter.createdTo").toLocaleLowerCase(localeCode) })} helpAria={t("patient.filter.helpAria", { label: t("patient.filter.createdTo") })}>
          <Input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
        </Filter>
      </div>

      <ListControls
        query={query}
        onQueryChange={setQuery}
        page={list.page}
        pageCount={list.pageCount}
        totalCount={patients.length}
        filteredCount={filtered.length}
        onPageChange={list.setPage}
        placeholder={t("patient.searchPlaceholder")}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((id) => <div key={id} className="h-40 animate-pulse rounded-2xl bg-dtsc-page" />)}
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.paginatedItems.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              permissions={permissions}
              openDetail={openDetail}
              openEdit={openEdit}
              activeModuleCodes={activeModuleCodes}
              onOpenRelated={openRelated}
              locale={locale}
              t={t}
              sexOptions={sexOptions}
            />
          ))}
        </div>
      )}

      {!loading && !filtered.length && (
        <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center">
          <p className="font-black text-dtsc-ink">{t("patient.emptyTitle")}</p>
          <p className="mt-1 text-sm text-dtsc-muted">{t("patient.emptyDescription")}</p>
        </div>
      )}

      <PatientForm
        open={formOpen}
        close={() => setFormOpen(false)}
        save={save}
        form={form}
        change={change}
        editing={editing}
        canViewSensitive={permissions.canViewSensitive}
        t={t}
        sexOptions={sexOptions}
        statusOptions={statusOptions}
        sourceOptions={sourceOptions}
      />
      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.patientNumber} · ${detail.fullName}` : t("patient.detailTitle")}
        description={t("patient.detailDescription")}
        className="h-[94dvh] max-w-6xl"
      >
        {detail && (
          <PatientDetail
            patient={detail}
            related={related}
            dispensations={dispensations}
            permissions={permissions}
            openEdit={openEdit}
            activeModuleCodes={activeModuleCodes}
            onOpenRelated={openRelated}
            locale={locale}
            t={t}
            sexOptions={sexOptions}
            sourceOptions={sourceOptions}
          />
        )}
      </Dialog>
    </section>
  );
}

function PatientCard({
  patient,
  permissions,
  openDetail,
  openEdit,
  activeModuleCodes,
  onOpenRelated,
  locale,
  t,
  sexOptions,
}: {
  patient: Patient;
  permissions: Permissions;
  openDetail: (patient: Patient) => Promise<void>;
  openEdit: (patient: Patient, status?: string) => void;
  activeModuleCodes: Set<string>;
  onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void;
  locale: HealthClinicalLocale;
  t: Translator;
  sexOptions: Record<string, string>;
}) {
  const actions: ActionMenuItem[] = [{ key: "detail", label: t("patient.action.viewDetail"), icon: Eye, onSelect: () => void openDetail(patient) }];
  if (permissions.canUpdate) actions.push({ key: "edit", label: t("patient.action.edit"), icon: FilePenLine, onSelect: () => openEdit(patient) });
  if (permissions.canUpdate && activeModuleCodes.has("APPOINTMENTS")) actions.push({ key: "appointment", label: t("patient.action.createAppointment"), icon: CalendarPlus, onSelect: () => onOpenRelated("APPOINTMENTS", patient.legacyRecordId || undefined) });
  if (permissions.canUpdate && activeModuleCodes.has("CONSULTATIONS")) actions.push({ key: "consultation", label: t("patient.action.createConsultation"), icon: ClipboardPlus, onSelect: () => onOpenRelated("CONSULTATIONS", patient.legacyRecordId || undefined) });
  if (permissions.canArchive && patient.status !== "ARCHIVED") actions.push({ key: "archive", label: t("patient.action.archive"), icon: Archive, destructive: true, onSelect: () => openEdit(patient, "ARCHIVED") });

  const created = healthClinicalDateTime(patient.createdAt, locale);
  const lastConsultation = patient.lastConsultation ? healthClinicalDateTime(patient.lastConsultation.updatedAt, locale) : null;
  return (
    <article className="relative min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 pr-14">
      <div className="absolute right-3 top-3"><ActionMenu items={actions} /></div>
      <div className="flex flex-wrap gap-2">
        <Badge text={healthClinicalStatusLabel(locale, patient.status)} />
        <Badge text={sexOptions[patient.sex] || patient.sex} />
      </div>
      <button type="button" onClick={() => void openDetail(patient)} className="mt-3 block min-w-0 text-left">
        <p className="text-xs font-black uppercase text-cyan-600">{patient.patientNumber}</p>
        <h4 className="mt-1 break-words font-black text-dtsc-ink">{patient.fullName}</h4>
        <p className="mt-1 text-sm text-dtsc-muted">{patient.phonePrimary} · {patientAge(patient.birthDate, t)}</p>
        <p className="mt-2 text-xs font-bold text-dtsc-muted">
          {t("patient.createdOn", { date: created })}
          {lastConsultation ? ` · ${t("patient.lastConsultation", { date: lastConsultation })}` : ""}
        </p>
      </button>
    </article>
  );
}

function PatientForm({
  open,
  close,
  save,
  form,
  change,
  editing,
  canViewSensitive,
  t,
  sexOptions,
  statusOptions,
  sourceOptions,
}: {
  open: boolean;
  close: () => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  form: Form;
  change: (key: string, value: string | boolean) => void;
  editing: Patient | null;
  canViewSensitive: boolean;
  t: Translator;
  sexOptions: Record<string, string>;
  statusOptions: Record<string, string>;
  sourceOptions: Record<string, string>;
}) {
  const statusNeedsReason = editing && (form.status === "ARCHIVED" || form.status === "DECEASED");
  return (
    <Dialog
      open={open}
      onClose={close}
      title={editing ? t("patient.form.editTitle", { name: editing.fullName }) : t("patient.new")}
      description={t("patient.form.description")}
      className="h-[94dvh] max-w-6xl"
    >
      <form onSubmit={save} className="grid min-w-0 gap-4 overflow-x-hidden">
        <Section title={t("patient.section.identity")}>
          <Grid>
            <F l={t("patient.field.fullName")} h={t("patient.help.fullName")}><Input required value={String(form.fullName)} onChange={(event) => change("fullName", event.target.value)} /></F>
            <F l={t("patient.field.sex")} h={t("patient.help.sex")}><Choice value={String(form.sex)} onChange={(value) => change("sex", value)} options={sexOptions} /></F>
            <F l={t("patient.field.birthDate")} h={t("patient.help.birthDate")}><Input type="date" value={String(form.birthDate)} onChange={(event) => change("birthDate", event.target.value)} /></F>
            <F l={t("patient.field.maritalStatus")} h={t("patient.help.maritalStatus")}><Input value={String(form.maritalStatus)} onChange={(event) => change("maritalStatus", event.target.value)} /></F>
            <F l={t("patient.field.profession")} h={t("patient.help.profession")}><Input value={String(form.profession)} onChange={(event) => change("profession", event.target.value)} /></F>
          </Grid>
        </Section>

        <Section title={t("patient.section.contact")}>
          <Grid>
            <F l={t("patient.field.phonePrimary")} h={t("patient.help.phonePrimary")}><Input required value={String(form.phonePrimary)} onChange={(event) => change("phonePrimary", event.target.value)} /></F>
            <F l={t("patient.field.phoneSecondary")} h={t("patient.help.phoneSecondary")}><Input value={String(form.phoneSecondary)} onChange={(event) => change("phoneSecondary", event.target.value)} /></F>
            <F l={t("patient.field.email")} h={t("patient.help.email")}><Input type="email" value={String(form.email)} onChange={(event) => change("email", event.target.value)} /></F>
            <F l={t("patient.field.address")} h={t("patient.help.address")}><Input required value={String(form.address)} onChange={(event) => change("address", event.target.value)} /></F>
            <F l={t("patient.field.city")} h={t("patient.help.city")}><Input value={String(form.city)} onChange={(event) => change("city", event.target.value)} /></F>
            <F l={t("patient.field.country")} h={t("patient.help.country")}><Input value={String(form.country)} onChange={(event) => change("country", event.target.value)} /></F>
          </Grid>
        </Section>

        <Section title={t("patient.section.emergency")}>
          <Grid>
            <F l={t("patient.field.emergencyName")} h={t("patient.help.emergencyName")}><Input required value={String(form.emergencyContactName)} onChange={(event) => change("emergencyContactName", event.target.value)} /></F>
            <F l={t("patient.field.emergencyRelationship")} h={t("patient.help.emergencyRelationship")}><Input value={String(form.emergencyContactRelationship)} onChange={(event) => change("emergencyContactRelationship", event.target.value)} /></F>
            <F l={t("patient.field.emergencyPhone")} h={t("patient.help.emergencyPhone")}><Input required value={String(form.emergencyContactPhone)} onChange={(event) => change("emergencyContactPhone", event.target.value)} /></F>
            <F l={t("patient.field.emergencyAddress")} h={t("patient.help.emergencyAddress")}><Input value={String(form.emergencyContactAddress)} onChange={(event) => change("emergencyContactAddress", event.target.value)} /></F>
          </Grid>
        </Section>

        {canViewSensitive && (
          <Section title={t("patient.section.medical")}>
            <Grid>
              <F l={t("patient.field.bloodGroup")} h={t("patient.help.bloodGroup")}><Input value={String(form.bloodGroup)} onChange={(event) => change("bloodGroup", event.target.value)} /></F>
              <F l={t("patient.field.knownAllergies")} h={t("patient.help.knownAllergies")}><Area value={String(form.knownAllergies)} set={(value) => change("knownAllergies", value)} /></F>
              <F l={t("patient.field.importantHistory")} h={t("patient.help.importantHistory")}><Area value={String(form.importantHistory)} set={(value) => change("importantHistory", value)} /></F>
              <F l={t("patient.field.chronicTreatments")} h={t("patient.help.chronicTreatments")}><Area value={String(form.chronicTreatments)} set={(value) => change("chronicTreatments", value)} /></F>
              <F l={t("patient.field.medicalNotes")} h={t("patient.help.medicalNotes")}><Area value={String(form.medicalNotes)} set={(value) => change("medicalNotes", value)} /></F>
            </Grid>
          </Section>
        )}

        <Section title={t("patient.section.admin")}>
          <Grid>
            <F l={t("patient.field.status")} h={t("patient.help.status")}><Choice value={String(form.status)} onChange={(value) => change("status", value)} options={statusOptions} /></F>
            <F l={t("patient.field.registrationSource")} h={t("patient.help.registrationSource")}><Choice value={String(form.registrationSource)} onChange={(value) => change("registrationSource", value)} options={sourceOptions} /></F>
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border p-3 text-sm font-bold text-dtsc-ink">
              <input type="checkbox" checked={form.insuranceKnown === true} onChange={(event) => change("insuranceKnown", event.target.checked)} />
              <span className="flex items-center gap-1">
                {t("patient.field.insuranceKnown")}
                <span title={t("patient.help.insuranceKnown")} aria-label={`${t("patient.field.insuranceKnown")} : ${t("patient.help.insuranceKnown")}`}><CircleHelp className="h-3.5 w-3.5" /></span>
              </span>
            </label>
            <F l={t("patient.field.insuranceReference")} h={t("patient.help.insuranceReference")}><Input value={String(form.insuranceReference)} onChange={(event) => change("insuranceReference", event.target.value)} /></F>
            <F l={t("patient.field.administrativeNotes")} h={t("patient.help.administrativeNotes")}><Area value={String(form.administrativeNotes)} set={(value) => change("administrativeNotes", value)} /></F>
            {statusNeedsReason && <F l={t("patient.field.actionReason")} h={t("patient.help.actionReason")}><Area required value={String(form.actionReason)} set={(value) => change("actionReason", value)} /></F>}
          </Grid>
        </Section>

        <div className="grid gap-2 sm:flex">
          <Button className="w-full bg-[#002b5b] text-white sm:w-auto">{t("patient.action.save")}</Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={close}>{t("patient.action.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function PatientDetail({
  patient,
  related,
  dispensations,
  permissions,
  openEdit,
  activeModuleCodes,
  onOpenRelated,
  locale,
  t,
  sexOptions,
  sourceOptions,
}: {
  patient: Patient;
  related: Related[];
  dispensations: Dispensation[];
  permissions: Permissions;
  openEdit: (patient: Patient, status?: string) => void;
  activeModuleCodes: Set<string>;
  onOpenRelated: (moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) => void;
  locale: HealthClinicalLocale;
  t: Translator;
  sexOptions: Record<string, string>;
  sourceOptions: Record<string, string>;
}) {
  const date = (value: string) => healthClinicalDateTime(value, locale);
  const moduleLabel = (code: string) => MODULE_KEYS[code as keyof typeof MODULE_KEYS] ? t(MODULE_KEYS[code as keyof typeof MODULE_KEYS]) : code;
  const notProvided = t("common.notProvided");

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap gap-2">
        {permissions.canUpdate && <Button onClick={() => openEdit(patient)}><FilePenLine />{t("patient.action.edit")}</Button>}
        {permissions.canUpdate && activeModuleCodes.has("APPOINTMENTS") && <Button variant="outline" onClick={() => onOpenRelated("APPOINTMENTS", patient.legacyRecordId || undefined)}><CalendarPlus />{t("patient.action.createAppointment")}</Button>}
        {permissions.canUpdate && activeModuleCodes.has("CONSULTATIONS") && <Button variant="outline" onClick={() => onOpenRelated("CONSULTATIONS", patient.legacyRecordId || undefined)}><ClipboardPlus />{t("patient.action.createConsultation")}</Button>}
        {permissions.canUpdate && activeModuleCodes.has("MEDICAL_DOCUMENTS") && <Button variant="outline" onClick={() => onOpenRelated("MEDICAL_DOCUMENTS", patient.legacyRecordId || undefined)}><Plus />{t("patient.action.addDocument")}</Button>}
        {permissions.canUpdate && activeModuleCodes.has("MEDICAL_RECORDS") && <Button variant="outline" onClick={() => onOpenRelated("MEDICAL_RECORDS", patient.legacyRecordId || undefined)}><HeartPulse />{t("patient.action.viewMedicalRecord")}</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Info title={t("patient.detail.adminSummary")} notProvided={notProvided} rows={[
          [t("patient.detail.identifier"), patient.patientNumber],
          [t("patient.detail.fullName"), patient.fullName],
          [t("patient.detail.sex"), sexOptions[patient.sex] || patient.sex],
          [t("patient.detail.age"), patientAge(patient.birthDate, t)],
          [t("patient.detail.phone"), patient.phonePrimary],
          [t("patient.detail.address"), `${patient.address}${patient.city ? ` · ${patient.city}` : ""}`],
          [t("patient.detail.status"), healthClinicalStatusLabel(locale, patient.status)],
        ]} />
        <Info title={t("patient.detail.emergency")} notProvided={notProvided} rows={[
          [t("patient.detail.name"), patient.emergencyContactName],
          [t("patient.detail.relationship"), patient.emergencyContactRelationship],
          [t("patient.detail.phone"), patient.emergencyContactPhone],
          [t("patient.detail.address"), patient.emergencyContactAddress],
        ]} />
        {permissions.canViewSensitive ? (
          <Info title={t("patient.detail.medical")} notProvided={notProvided} rows={[
            [t("patient.detail.bloodGroup"), patient.bloodGroup],
            [t("patient.detail.allergies"), patient.knownAllergies],
            [t("patient.detail.history"), patient.importantHistory],
            [t("patient.detail.chronicTreatments"), patient.chronicTreatments],
            [t("patient.detail.medicalNotes"), patient.medicalNotes],
          ]} />
        ) : (
          <section className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
            <div className="flex gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              <div>
                <h4 className="font-black">{t("patient.protected.title")}</h4>
                <p className="mt-1 text-sm text-dtsc-muted">{t("patient.protected.description")}</p>
              </div>
            </div>
          </section>
        )}
        <Info title={t("patient.detail.minimalHistory")} notProvided={notProvided} rows={[
          [t("patient.detail.createdAt"), date(patient.createdAt)],
          [t("patient.detail.createdBy"), patient.createdBy.name],
          [t("patient.detail.updatedAt"), date(patient.updatedAt)],
          [t("patient.detail.updatedBy"), patient.updatedBy?.name],
          [t("patient.detail.source"), sourceOptions[patient.registrationSource] || patient.registrationSource],
        ]} />
      </div>

      <section className="rounded-2xl border border-dtsc-border p-4">
        <h4 className="font-black">{t("patient.pharmacy.title")}</h4>
        <div className="mt-3 grid gap-2">
          {dispensations.map((item) => (
            <article key={item.id} className="rounded-xl bg-dtsc-page p-3">
              <p className="font-black">{item.product.productCode} · {item.product.name}</p>
              <p className="text-sm text-dtsc-muted">{item.quantity} {item.product.unit} · {date(item.dispensedAt)} · {item.dispensedBy.name}</p>
            </article>
          ))}
          {!dispensations.length && <p className="text-sm text-dtsc-muted">{t("patient.pharmacy.empty")}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-dtsc-border p-4">
        <h4 className="font-black">{t("patient.related.title")}</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {related.map((item) => (
            <article key={item.id} className="rounded-xl bg-dtsc-page p-3">
              <p className="text-xs font-black uppercase text-cyan-600">{moduleLabel(item.moduleCode)} · {healthClinicalStatusLabel(locale, item.status)}</p>
              <p className="mt-1 font-bold">{item.title}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{date(item.updatedAt)}</p>
            </article>
          ))}
          {!related.length && <p className="text-sm text-dtsc-muted">{t("patient.related.empty")}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-dtsc-border p-4">
        <h4 className="font-black">{t("patient.events.title")}</h4>
        <div className="mt-3 grid gap-2">
          {patient.events?.map((event) => (
            <article key={event.id} className="rounded-xl bg-dtsc-page p-3">
              <p className="text-xs font-black uppercase text-cyan-600">{event.eventType} · {event.actor.name}</p>
              <p className="mt-1 text-sm">{event.summary}</p>
              <p className="mt-1 text-xs text-dtsc-muted">{date(event.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Filter({ label, help, helpAria, children }: { label: string; help: string; helpAria: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-black uppercase text-dtsc-muted">
      <span className="flex items-center gap-1">{label}<span title={help} aria-label={helpAria}><CircleHelp className="h-3.5 w-3.5" /></span></span>
      {children}
    </label>
  );
}

function F({ l, h, children }: { l: string; h: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="flex items-center gap-1 text-xs font-black uppercase text-dtsc-muted">{l}<span title={h} aria-label={`${l} : ${h}`}><CircleHelp className="h-3.5 w-3.5" /></span></span>
      {children}
    </label>
  );
}

function Choice({ value, onChange, options, all }: { value: string; onChange: (value: string) => void; options: Record<string, string>; all?: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
      {all && <option value="">{all}</option>}
      {Object.entries(options).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  );
}

function Area({ value, set, required }: { value: string; set: (value: string) => void; required?: boolean }) {
  return <textarea required={required} value={value} onChange={(event) => set(event.target.value)} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4"><h4 className="font-black text-cyan-600">{title}</h4>{children}</section>;
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-3 md:grid-cols-2">{children}</div>;
}

function Info({ title, rows, notProvided }: { title: string; rows: Array<[string, string | null | undefined]>; notProvided: string }) {
  return (
    <section className="rounded-2xl border border-dtsc-border p-4">
      <h4 className="font-black">{title}</h4>
      <dl className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 rounded-xl bg-dtsc-page p-3">
            <dt className="text-xs font-black uppercase text-dtsc-muted">{label}</dt>
            <dd className="break-words text-sm font-bold">{value || notProvided}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs font-black text-cyan-700">{text}</span>;
}

function patientAge(value: string | null, t: Translator) {
  if (!value) return t("patient.age.unknown");
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return t("patient.age.unknown");
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years -= 1;
  return t(years === 1 ? "patient.age.year" : "patient.age.years", { count: years });
}
