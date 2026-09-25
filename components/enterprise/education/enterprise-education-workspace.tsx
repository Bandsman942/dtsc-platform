"use client";

import { BookOpen, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, GraduationCap, Plus, School, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import type { EducationModuleCode, EducationResourceCode } from "@/lib/enterprise/education/constants";
import { educationCopy, educationResourceLabel } from "@/lib/enterprise/education/i18n";

type ReferenceItem = {
  id: string;
  code: string;
  name?: string;
  label?: string;
  status?: string;
  academicYearId?: string;
  campusId?: string;
  levelId?: string;
  programId?: string | null;
};

type Snapshot = {
  settings: (Record<string, unknown> & { id: string; revision: number; institutionType: string; legalName?: string | null; registrationCode?: string | null; timezone: string; weekStartsOn: number; defaultCampusId?: string | null }) | null;
  counts: {
    campusCount: number;
    yearCount: number;
    activeYearCount: number;
    periodCount: number;
    levelCount: number;
    programCount: number;
    classGroupCount: number;
    subjectCount: number;
    offeringCount: number;
    calendarCount: number;
  };
  references: {
    campuses: ReferenceItem[];
    academicYears: ReferenceItem[];
    periods: ReferenceItem[];
    levels: ReferenceItem[];
    departments: ReferenceItem[];
    programs: ReferenceItem[];
    classGroups: ReferenceItem[];
    subjects: ReferenceItem[];
  };
  onboarding: { settings: boolean; campus: boolean; academicYear: boolean; structure: boolean; ready: boolean };
};

type Capabilities = { canWrite: boolean; canManage: boolean };
type ListItem = Record<string, unknown> & { id: string; revision?: number; status?: string; code?: string; name?: string; label?: string; title?: string; displayName?: string };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
type FieldType = "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "checkbox";
type Field = {
  key: string;
  fr: string;
  en: string;
  type?: FieldType;
  required?: boolean;
  options?: Array<{ value: string; fr: string; en: string }>;
  reference?: keyof Snapshot["references"] | "campuses";
};

const STRUCTURE_RESOURCES: EducationResourceCode[] = [
  "CAMPUS",
  "ACADEMIC_YEAR",
  "PERIOD",
  "LEVEL",
  "DEPARTMENT",
  "PROGRAM",
  "CLASS_GROUP",
  "SUBJECT",
  "COURSE_OFFERING",
];

const FIELDS: Record<EducationResourceCode, Field[]> = {
  SETTINGS: [
    { key: "institutionType", fr: "Type d’établissement", en: "Institution type", type: "select", required: true, options: [
      { value: "SCHOOL", fr: "École", en: "School" },
      { value: "UNIVERSITY", fr: "Université", en: "University" },
      { value: "TRAINING_CENTER", fr: "Centre de formation", en: "Training center" },
      { value: "INSTITUTE", fr: "Institut", en: "Institute" },
      { value: "OTHER", fr: "Autre", en: "Other" },
    ] },
    { key: "legalName", fr: "Dénomination officielle", en: "Legal name" },
    { key: "registrationCode", fr: "Référence d’agrément", en: "Registration reference" },
    { key: "timezone", fr: "Fuseau horaire", en: "Timezone", required: true },
    { key: "weekStartsOn", fr: "Premier jour de semaine (0-6)", en: "Week starts on (0-6)", type: "number", required: true },
    { key: "defaultCampusId", fr: "Campus principal", en: "Primary campus", type: "select", reference: "campuses" },
  ],
  CAMPUS: [
    { key: "code", fr: "Code campus", en: "Campus code", required: true },
    { key: "name", fr: "Nom", en: "Name", required: true },
    { key: "shortName", fr: "Nom court", en: "Short name" },
    { key: "address", fr: "Adresse", en: "Address" },
    { key: "city", fr: "Ville", en: "City" },
    { key: "countryCode", fr: "Pays (ISO 2)", en: "Country (ISO 2)" },
    { key: "timezone", fr: "Fuseau horaire", en: "Timezone" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
    { key: "sortOrder", fr: "Ordre", en: "Order", type: "number" },
  ],
  ACADEMIC_YEAR: [
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "label", fr: "Libellé", en: "Label", required: true },
    { key: "startDate", fr: "Début", en: "Start", type: "date", required: true },
    { key: "endDate", fr: "Fin", en: "End", type: "date", required: true },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "DRAFT", fr: "Brouillon", en: "Draft" }, { value: "ACTIVE", fr: "Active", en: "Active" }] },
  ],
  PERIOD: [
    { key: "academicYearId", fr: "Année académique", en: "Academic year", type: "select", reference: "academicYears", required: true },
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "label", fr: "Libellé", en: "Label", required: true },
    { key: "periodType", fr: "Type", en: "Type", type: "select", options: [
      { value: "TERM", fr: "Période", en: "Term" }, { value: "SEMESTER", fr: "Semestre", en: "Semester" },
      { value: "TRIMESTER", fr: "Trimestre", en: "Trimester" }, { value: "QUARTER", fr: "Quart", en: "Quarter" },
      { value: "SESSION", fr: "Session", en: "Session" }, { value: "OTHER", fr: "Autre", en: "Other" },
    ] },
    { key: "sequence", fr: "Séquence", en: "Sequence", type: "number" },
    { key: "startDate", fr: "Début", en: "Start", type: "date", required: true },
    { key: "endDate", fr: "Fin", en: "End", type: "date", required: true },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "DRAFT", fr: "Brouillon", en: "Draft" }, { value: "ACTIVE", fr: "Active", en: "Active" }] },
  ],
  LEVEL: [
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "label", fr: "Libellé", en: "Label", required: true },
    { key: "levelType", fr: "Type de niveau", en: "Level type", type: "select", options: [
      { value: "GRADE", fr: "Classe", en: "Grade" }, { value: "YEAR", fr: "Année", en: "Year" },
      { value: "CYCLE", fr: "Cycle", en: "Cycle" }, { value: "LEVEL", fr: "Niveau", en: "Level" }, { value: "OTHER", fr: "Autre", en: "Other" },
    ] },
    { key: "sequence", fr: "Ordre pédagogique", en: "Academic order", type: "number" },
    { key: "description", fr: "Description", en: "Description", type: "textarea" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
  ],
  DEPARTMENT: [
    { key: "campusId", fr: "Campus", en: "Campus", type: "select", reference: "campuses" },
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "name", fr: "Nom", en: "Name", required: true },
    { key: "description", fr: "Description", en: "Description", type: "textarea" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
    { key: "sortOrder", fr: "Ordre", en: "Order", type: "number" },
  ],
  PROGRAM: [
    { key: "departmentId", fr: "Département", en: "Department", type: "select", reference: "departments" },
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "name", fr: "Nom", en: "Name", required: true },
    { key: "description", fr: "Description", en: "Description", type: "textarea" },
    { key: "awardName", fr: "Diplôme / titre", en: "Award" },
    { key: "durationPeriods", fr: "Nombre de périodes", en: "Number of periods", type: "number" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
    { key: "sortOrder", fr: "Ordre", en: "Order", type: "number" },
  ],
  CLASS_GROUP: [
    { key: "academicYearId", fr: "Année académique", en: "Academic year", type: "select", reference: "academicYears", required: true },
    { key: "campusId", fr: "Campus", en: "Campus", type: "select", reference: "campuses", required: true },
    { key: "levelId", fr: "Niveau", en: "Level", type: "select", reference: "levels", required: true },
    { key: "programId", fr: "Filière / programme", en: "Program", type: "select", reference: "programs" },
    { key: "code", fr: "Code", en: "Code", required: true },
    { key: "name", fr: "Nom", en: "Name", required: true },
    { key: "capacity", fr: "Capacité", en: "Capacity", type: "number" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
    { key: "sortOrder", fr: "Ordre", en: "Order", type: "number" },
  ],
  SUBJECT: [
    { key: "departmentId", fr: "Département", en: "Department", type: "select", reference: "departments" },
    { key: "code", fr: "Code matière", en: "Subject code", required: true },
    { key: "name", fr: "Nom", en: "Name", required: true },
    { key: "description", fr: "Description", en: "Description", type: "textarea" },
    { key: "creditHours", fr: "Crédits / heures", en: "Credits / hours", type: "number" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
    { key: "sortOrder", fr: "Ordre", en: "Order", type: "number" },
  ],
  COURSE_OFFERING: [
    { key: "academicYearId", fr: "Année académique", en: "Academic year", type: "select", reference: "academicYears", required: true },
    { key: "periodId", fr: "Période", en: "Period", type: "select", reference: "periods" },
    { key: "campusId", fr: "Campus", en: "Campus", type: "select", reference: "campuses", required: true },
    { key: "subjectId", fr: "Matière", en: "Subject", type: "select", reference: "subjects", required: true },
    { key: "classGroupId", fr: "Classe / groupe", en: "Class / group", type: "select", reference: "classGroups" },
    { key: "programId", fr: "Filière / programme", en: "Program", type: "select", reference: "programs" },
    { key: "levelId", fr: "Niveau", en: "Level", type: "select", reference: "levels" },
    { key: "code", fr: "Code offre", en: "Offering code", required: true },
    { key: "displayName", fr: "Nom affiché", en: "Display name" },
    { key: "deliveryMode", fr: "Mode", en: "Mode", type: "select", options: [
      { value: "IN_PERSON", fr: "Présentiel", en: "In person" }, { value: "ONLINE", fr: "En ligne", en: "Online" }, { value: "HYBRID", fr: "Hybride", en: "Hybrid" },
    ] },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [
      { value: "DRAFT", fr: "Brouillon", en: "Draft" }, { value: "ACTIVE", fr: "Active", en: "Active" }, { value: "INACTIVE", fr: "Inactive", en: "Inactive" },
    ] },
  ],
  CALENDAR_EVENT: [
    { key: "academicYearId", fr: "Année académique", en: "Academic year", type: "select", reference: "academicYears", required: true },
    { key: "periodId", fr: "Période", en: "Period", type: "select", reference: "periods" },
    { key: "campusId", fr: "Campus", en: "Campus", type: "select", reference: "campuses" },
    { key: "eventType", fr: "Type d’événement", en: "Event type", type: "select", options: [
      { value: "ACADEMIC", fr: "Académique", en: "Academic" }, { value: "EXAM", fr: "Examen", en: "Exam" },
      { value: "HOLIDAY", fr: "Congé", en: "Holiday" }, { value: "REGISTRATION", fr: "Inscription", en: "Registration" },
      { value: "DEADLINE", fr: "Échéance", en: "Deadline" }, { value: "CEREMONY", fr: "Cérémonie", en: "Ceremony" }, { value: "OTHER", fr: "Autre", en: "Other" },
    ] },
    { key: "title", fr: "Titre", en: "Title", required: true },
    { key: "description", fr: "Description", en: "Description", type: "textarea" },
    { key: "startsAt", fr: "Début", en: "Start", type: "datetime-local", required: true },
    { key: "endsAt", fr: "Fin", en: "End", type: "datetime-local", required: true },
    { key: "allDay", fr: "Toute la journée", en: "All day", type: "checkbox" },
    { key: "status", fr: "Statut", en: "Status", type: "select", options: [{ value: "ACTIVE", fr: "Actif", en: "Active" }, { value: "INACTIVE", fr: "Inactif", en: "Inactive" }] },
  ],
};

function defaults(resource: EducationResourceCode) {
  const values: Record<string, string | boolean> = {};
  for (const field of FIELDS[resource]) values[field.key] = field.type === "checkbox" ? false : "";
  if (resource === "SETTINGS") Object.assign(values, { institutionType: "SCHOOL", timezone: "Africa/Kinshasa", weekStartsOn: "1" });
  if (resource === "CAMPUS") Object.assign(values, { status: "ACTIVE", sortOrder: "0" });
  if (resource === "ACADEMIC_YEAR") Object.assign(values, { status: "DRAFT" });
  if (resource === "PERIOD") Object.assign(values, { periodType: "TERM", sequence: "1", status: "DRAFT" });
  if (resource === "LEVEL") Object.assign(values, { levelType: "GRADE", sequence: "0", status: "ACTIVE" });
  if (["DEPARTMENT", "PROGRAM", "CLASS_GROUP", "SUBJECT"].includes(resource)) Object.assign(values, { status: "ACTIVE", sortOrder: "0" });
  if (resource === "COURSE_OFFERING") Object.assign(values, { deliveryMode: "IN_PERSON", status: "DRAFT" });
  if (resource === "CALENDAR_EVENT") Object.assign(values, { eventType: "ACADEMIC", status: "ACTIVE", allDay: false });
  return values;
}

function inputValue(value: unknown, type: FieldType | undefined) {
  if (value == null) return type === "checkbox" ? false : "";
  if (type === "date") return new Date(String(value)).toISOString().slice(0, 10);
  if (type === "datetime-local") {
    const date = new Date(String(value));
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }
  if (type === "checkbox") return Boolean(value);
  return String(value);
}

function formFromItem(resource: EducationResourceCode, item: ListItem | Snapshot["settings"]) {
  const values = defaults(resource);
  if (!item) return values;
  for (const field of FIELDS[resource]) values[field.key] = inputValue(item[field.key], field.type);
  return values;
}

function payloadFromForm(resource: EducationResourceCode, form: Record<string, string | boolean>, revision?: number) {
  const payload: Record<string, unknown> = {};
  for (const field of FIELDS[resource]) {
    const value = form[field.key];
    if (field.type === "checkbox") {
      payload[field.key] = Boolean(value);
      continue;
    }
    const text = String(value ?? "").trim();
    payload[field.key] = text === "" ? null : text;
  }
  if (resource === "SETTINGS" && revision) payload.revision = revision;
  return payload;
}

function titleOf(item: ListItem) {
  return String(item.name || item.label || item.title || item.displayName || item.code || "—");
}

function metaOf(item: ListItem) {
  const parts = [item.code, item.status].filter(Boolean).map(String);
  return parts.join(" · ");
}

function statusBadge(status?: string) {
  if (!status) return null;
  return <span className="rounded-full border border-dtsc-border bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{status}</span>;
}

export function EnterpriseEducationWorkspace({
  organizationId,
  organizationName,
  definition,
  initialFocus,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  initialFocus: EducationModuleCode;
  locale?: string | null;
}) {
  const lang = locale === "en" ? "en" : "fr";
  const t = educationCopy(lang);
  const resources = useMemo<EducationResourceCode[]>(() => {
    if (initialFocus === "EDUCATION_SETTINGS") return ["SETTINGS"];
    if (initialFocus === "ACADEMIC_CALENDAR") return ["CALENDAR_EVENT"];
    return STRUCTURE_RESOURCES;
  }, [initialFocus]);

  const [resource, setResource] = useState<EducationResourceCode>(resources[0]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({ canWrite: false, canManage: false });
  const [items, setItems] = useState<ListItem[]>([]);
  const [paging, setPaging] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(defaults(resources[0]));
  const [saving, setSaving] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(`/api/enterprise/${organizationId}/education/structure?moduleCode=${initialFocus}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || t.loadError);
    setSnapshot(data.snapshot);
    setCapabilities(data.capabilities || { canWrite: false, canManage: false });
  }, [initialFocus, organizationId, t.loadError]);

  const loadList = useCallback(async (targetResource: EducationResourceCode, page = 1) => {
    if (targetResource === "SETTINGS") {
      if (!snapshot) return;
      setItems(snapshot.settings ? [snapshot.settings as ListItem] : []);
      setPaging({ page: 1, pageSize: 1, total: snapshot.settings ? 1 : 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
      return;
    }
    const params = new URLSearchParams({ resource: targetResource, page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/enterprise/${organizationId}/education/structure?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || t.loadError);
    setItems(data.items || []);
    setPaging(data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
    setCapabilities(data.capabilities || { canWrite: false, canManage: false });
  }, [organizationId, search, snapshot, status, t.loadError]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadSnapshot()
      .then(() => active && setLoading(false))
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : t.loadError);
        setLoading(false);
      });
    return () => { active = false; };
  }, [loadSnapshot, t.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      loadList(resource, 1)
        .catch((reason) => setError(reason instanceof Error ? reason.message : t.loadError))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadList, resource, t.loadError]);

  useEffect(() => {
    if (resource === "SETTINGS" && snapshot) {
      setItems(snapshot.settings ? [snapshot.settings as ListItem] : []);
      setPaging({ page: 1, pageSize: 1, total: snapshot.settings ? 1 : 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
    }
  }, [resource, snapshot]);

  function selectResource(next: EducationResourceCode) {
    setResource(next);
    setSearch("");
    setStatus("");
    setEditing(null);
    setForm(defaults(next));
  }

  function openNew() {
    setEditing(null);
    setForm(defaults(resource));
    if (resource === "SETTINGS" && snapshot?.settings) {
      setEditing(snapshot.settings as ListItem);
      setForm(formFromItem("SETTINGS", snapshot.settings));
    }
    setEditorOpen(true);
  }

  function openEdit(item: ListItem) {
    setEditing(item);
    setForm(formFromItem(resource, item));
    setEditorOpen(true);
  }

  async function refreshAll() {
    await loadSnapshot();
    await loadList(resource, paging.page);
  }

  async function saveEditor() {
    setSaving(true);
    setError("");
    try {
      const data = payloadFromForm(resource, form, editing?.revision);
      const response = editing && resource !== "SETTINGS"
        ? await fetch(`/api/enterprise/${organizationId}/education/structure/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ resource, action: "UPDATE", revision: editing.revision, data }),
          })
        : await fetch(`/api/enterprise/${organizationId}/education/structure`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ resource, data }),
          });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || t.saveError);
      setEditorOpen(false);
      await refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function transition(item: ListItem, action: "ARCHIVE" | "ACTIVATE" | "DEACTIVATE" | "CLOSE") {
    if (action === "ARCHIVE" && !window.confirm(t.archivedConfirm)) return;
    if (action === "CLOSE" && !window.confirm(t.closeConfirm)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/education/structure/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resource, action, revision: item.revision, data: {} }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || t.saveError);
      await refreshAll();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  function referenceOptions(field: Field) {
    if (!field.reference || !snapshot) return [];
    const rows = snapshot.references[field.reference] || [];
    return rows.map((item) => ({ value: item.id, label: item.name || item.label || item.code }));
  }

  const title = initialFocus === "EDUCATION_SETTINGS" ? t.settingsTitle : initialFocus === "ACADEMIC_CALENDAR" ? t.calendarTitle : t.title;
  const description = initialFocus === "EDUCATION_SETTINGS" ? t.settingsDescription : initialFocus === "ACADEMIC_CALENDAR" ? t.calendarDescription : t.description;
  const canEdit = resource === "SETTINGS" ? capabilities.canManage : capabilities.canWrite;

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={t.eyebrow}
        title={title}
        description={<>{description}<span className="mt-1 block text-xs font-bold">{organizationName}</span></>}
        primaryAction={canEdit ? <Button onClick={openNew}><Plus className="h-4 w-4" />{resource === "SETTINGS" && snapshot?.settings ? t.edit : t.new}</Button> : undefined}
      />

      {snapshot ? (
        <>
          <ModuleMetrics label={lang === "en" ? "Education indicators" : "Indicateurs Education"}>
            <ModuleMetric label={t.metrics.campuses} value={snapshot.counts.campusCount} icon={<Building2 className="h-4 w-4" />} />
            <ModuleMetric label={t.metrics.years} value={snapshot.counts.yearCount} icon={<CalendarDays className="h-4 w-4" />} />
            <ModuleMetric label={t.metrics.subjects} value={snapshot.counts.subjectCount} icon={<BookOpen className="h-4 w-4" />} />
            <ModuleMetric label={initialFocus === "ACADEMIC_CALENDAR" ? t.metrics.events : t.metrics.offerings} value={initialFocus === "ACADEMIC_CALENDAR" ? snapshot.counts.calendarCount : snapshot.counts.offeringCount} icon={<GraduationCap className="h-4 w-4" />} />
          </ModuleMetrics>

          <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 sm:p-5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-dtsc-ink">{t.setup}</h2>
                <p className="mt-1 text-sm text-dtsc-muted">{snapshot.onboarding.ready ? t.setupReady : t.setupIncomplete}</p>
              </div>
              <span className="rounded-full border border-dtsc-border px-3 py-1 text-xs font-black text-dtsc-blue">
                {[snapshot.onboarding.settings, snapshot.onboarding.campus, snapshot.onboarding.academicYear, snapshot.onboarding.structure].filter(Boolean).length}/4
              </span>
            </div>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["settings", snapshot.onboarding.settings],
                ["campus", snapshot.onboarding.campus],
                ["academicYear", snapshot.onboarding.academicYear],
                ["structure", snapshot.onboarding.structure],
              ] as const).map(([step, done]) => (
                <div key={step} className="flex min-w-0 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                  {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-dtsc-muted" />}
                  <span className="min-w-0 break-words text-sm font-bold text-dtsc-ink">{t.steps[step]}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <ModuleContent>
        {resources.length > 1 ? (
          <div className="max-w-full overflow-x-auto pb-1" data-horizontal-rail>
            <div className="flex min-w-max gap-2">
              {resources.map((entry) => (
                <Button key={entry} type="button" variant={resource === entry ? "default" : "outline"} onClick={() => selectResource(entry)}>
                  {educationResourceLabel(lang, entry)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <ModuleToolbar
          search={resource === "SETTINGS" ? undefined : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} className="pl-9" />
            </div>
          )}
          controls={resource === "SETTINGS" ? undefined : (
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
              <option value="">{t.allStatuses}</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DRAFT">DRAFT</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          )}
          summary={`${paging.total} ${t.records}`}
        />

        {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">{error}</div> : null}
        {loading ? <div className="py-10 text-center text-sm font-bold text-dtsc-muted">{t.loading}</div> : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            icon={School}
            title={t.emptyTitle}
            description={t.emptyDescription}
            action={canEdit ? <Button onClick={openNew}><Plus className="h-4 w-4" />{t.new}</Button> : undefined}
          />
        ) : null}

        {!loading && items.length > 0 ? (
          <BusinessList ariaLabel={educationResourceLabel(lang, resource)}>
            {items.map((item) => (
              <BusinessListItem
                key={item.id}
                title={titleOf(item)}
                status={statusBadge(item.status)}
                meta={metaOf(item)}
                description={typeof item.description === "string" ? item.description : undefined}
                onOpen={canEdit ? () => openEdit(item) : undefined}
                openLabel={canEdit ? `${t.edit} ${titleOf(item)}` : undefined}
                actions={resource === "SETTINGS" ? undefined : canEdit ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => openEdit(item)}>{t.edit}</Button>
                    {(resource === "ACADEMIC_YEAR" || resource === "PERIOD") && item.status !== "CLOSED" && capabilities.canManage ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => transition(item, "CLOSE")}>{t.close}</Button>
                    ) : null}
                    {item.status === "ACTIVE" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => transition(item, "DEACTIVATE")}>{t.deactivate}</Button>
                    ) : item.status === "INACTIVE" || item.status === "DRAFT" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => transition(item, "ACTIVATE")}>{t.activate}</Button>
                    ) : null}
                    {capabilities.canManage ? <Button type="button" variant="ghost" size="sm" onClick={() => transition(item, "ARCHIVE")}>{t.archive}</Button> : null}
                  </div>
                ) : undefined}
              />
            ))}
          </BusinessList>
        ) : null}

        {resource !== "SETTINGS" && paging.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={!paging.hasPreviousPage || loading} onClick={() => {
              setLoading(true);
              loadList(resource, Math.max(1, paging.page - 1)).finally(() => setLoading(false));
            }}><ChevronLeft className="h-4 w-4" />{t.previous}</Button>
            <span className="text-sm font-bold text-dtsc-muted">{t.page} {paging.page} {t.of} {paging.totalPages}</span>
            <Button type="button" variant="outline" disabled={!paging.hasNextPage || loading} onClick={() => {
              setLoading(true);
              loadList(resource, paging.page + 1).finally(() => setLoading(false));
            }}>{t.next}<ChevronRight className="h-4 w-4" /></Button>
          </div>
        ) : null}
      </ModuleContent>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        presentation="editor"
        className="h-[96dvh] sm:h-[90dvh]"
        title={`${editing ? t.edit : t.new} · ${educationResourceLabel(lang, resource)}`}
        description={description}
        footer={<>
          <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>{t.cancel}</Button>
          <Button type="button" onClick={saveEditor} disabled={saving}>{saving ? t.loading : t.save}</Button>
        </>}
      >
        <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
          {FIELDS[resource].map((field) => {
            const label = lang === "en" ? field.en : field.fr;
            const value = form[field.key];
            const options = field.options?.map((option) => ({ value: option.value, label: lang === "en" ? option.en : option.fr })) || referenceOptions(field);
            if (field.type === "checkbox") {
              return (
                <label key={field.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page px-3 sm:col-span-2">
                  <input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.checked }))} />
                  <span className="font-bold text-dtsc-ink">{label}</span>
                </label>
              );
            }
            return (
              <label key={field.key} className={field.type === "textarea" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                <span className="mb-1.5 block text-sm font-black text-dtsc-ink">{label}{field.required ? " *" : ""}</span>
                {field.type === "select" ? (
                  <select
                    value={String(value ?? "")}
                    required={field.required}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"
                  >
                    <option value="">—</option>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <Input
                    type={field.type === "number" || field.type === "date" || field.type === "datetime-local" ? field.type : "text"}
                    multiline={field.type === "textarea"}
                    rows={field.type === "textarea" ? 4 : undefined}
                    value={String(value ?? "")}
                    required={field.required}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
              </label>
            );
          })}
        </div>
      </Dialog>
    </ModuleWorkspace>
  );
}
