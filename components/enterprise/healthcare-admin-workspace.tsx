"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  FileHeart,
  FilePenLine,
  FileText,
  HeartPulse,
  Microscope,
  Pill,
  Plus,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UsersRound,
} from "lucide-react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import type { EnterpriseSectorRecordItem } from "@/lib/enterprise/enterprise-admin-types";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { translate } from "@/lib/i18n";
import { HealthPatientsWorkspace } from "@/components/enterprise/health-patients-workspace";
import { HealthAppointmentsWorkspace } from "@/components/enterprise/health-appointments-workspace";
import { HealthConsultationsWorkspace } from "@/components/enterprise/health-consultations-workspace";
import { HealthMedicalRecordsWorkspace } from "@/components/enterprise/health-medical-records-workspace";

type HealthcareMember = {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
};

type HealthcareDepartment = {
  id: string;
  departmentCode: string;
  labelFr: string;
  labelEn: string;
  isActive: boolean;
};

type HealthcarePosition = {
  id: string;
  positionCode: string;
  labelFr: string;
  labelEn: string;
  isActive: boolean;
};

type HealthcareModuleCode =
  | "HEALTH_DASHBOARD"
  | "PATIENTS"
  | "APPOINTMENTS"
  | "CONSULTATIONS"
  | "MEDICAL_RECORDS"
  | "CARE_TEAM"
  | "LABORATORY"
  | "INTERNAL_PHARMACY"
  | "MEDICAL_BILLING"
  | "INSURANCE_COVERAGE"
  | "QUALITY_INCIDENTS"
  | "MEDICAL_DOCUMENTS"
  | "MEDICAL_CONFIDENTIALITY"
  | "HEALTH_SETTINGS"
  | "HEALTH_REPORTS";

type HealthcareRecordModuleCode = Exclude<HealthcareModuleCode, "HEALTH_DASHBOARD">;

type HealthcareRecordType =
  | "PATIENT_PROFILE"
  | "APPOINTMENT"
  | "CONSULTATION"
  | "MEDICAL_RECORD"
  | "CARE_TEAM_MEMBER"
  | "LAB_REQUEST"
  | "PHARMACY_ITEM"
  | "MEDICAL_INVOICE"
  | "INSURANCE_COVERAGE"
  | "QUALITY_INCIDENT"
  | "CONFIDENTIALITY_RULE"
  | "MEDICAL_DOCUMENT"
  | "HEALTH_SETTING"
  | "HEALTH_REPORT";

type HealthcareFormState = {
  moduleCode: HealthcareRecordModuleCode;
  recordType: HealthcareRecordType;
  title: string;
  summary: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  patientRecordId: string;
  appointmentRecordId: string;
  consultationRecordId: string;
  departmentId: string;
  positionId: string;
  patientCode: string;
  patientName: string;
  sex: string;
  birthDateOrAge: string;
  contactPhone: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  email: string;
  profession: string;
  maritalStatus: string;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
  linkedRecordId: string;
  healthProfessional: string;
  appointmentDate: string;
  appointmentType: string;
  careTeam: string;
  vitalSigns: string;
  symptoms: string;
  clinicalExam: string;
  provisionalDiagnosis: string;
  finalDiagnosis: string;
  treatmentPlan: string;
  prescription: string;
  requestedExams: string;
  recommendations: string;
  incidentType: string;
  severity: string;
  service: string;
  amountRequested: string;
  amountApproved: string;
  invoiceLines: string;
  totalAmount: string;
  paymentMethod: string;
  stockQuantity: string;
  stockThreshold: string;
  expiryDate: string;
  documentType: string;
  fileReference: string;
  settingKey: string;
  settingValue: string;
  confidentialityLevel: string;
  insuranceProvider: string;
  notes: string;
};

const recordTypeByModule: Record<HealthcareRecordModuleCode, HealthcareRecordType> = {
  PATIENTS: "PATIENT_PROFILE",
  APPOINTMENTS: "APPOINTMENT",
  CONSULTATIONS: "CONSULTATION",
  MEDICAL_RECORDS: "MEDICAL_RECORD",
  CARE_TEAM: "CARE_TEAM_MEMBER",
  LABORATORY: "LAB_REQUEST",
  INTERNAL_PHARMACY: "PHARMACY_ITEM",
  MEDICAL_BILLING: "MEDICAL_INVOICE",
  INSURANCE_COVERAGE: "INSURANCE_COVERAGE",
  QUALITY_INCIDENTS: "QUALITY_INCIDENT",
  MEDICAL_DOCUMENTS: "MEDICAL_DOCUMENT",
  MEDICAL_CONFIDENTIALITY: "CONFIDENTIALITY_RULE",
  HEALTH_SETTINGS: "HEALTH_SETTING",
  HEALTH_REPORTS: "HEALTH_REPORT",
};

const submodules: Array<{
  code: HealthcareModuleCode;
  label: string;
  description: string;
  icon: typeof HeartPulse;
  createLabel?: string;
}> = [
  { code: "HEALTH_DASHBOARD", label: "Tableau de bord santé", description: "Indicateurs de pilotage clinique, qualité, facturation et opérations.", icon: Activity },
  { code: "PATIENTS", label: "Patients", description: "Identité, contacts, statut patient et notes administratives sensibles.", icon: Stethoscope, createLabel: "Nouveau patient" },
  { code: "APPOINTMENTS", label: "Rendez-vous", description: "Planification, confirmation, absence, annulation et conversion en consultation.", icon: CalendarClock, createLabel: "Nouveau rendez-vous" },
  { code: "CONSULTATIONS", label: "Consultations", description: "Motif, constantes, diagnostic, prescription, examens et clôture contrôlée.", icon: ClipboardList, createLabel: "Nouvelle consultation" },
  { code: "MEDICAL_RECORDS", label: "Dossiers médicaux", description: "Résumé médical, antécédents, allergies, traitements, examens et notes confidentielles.", icon: FileHeart, createLabel: "Nouveau dossier" },
  { code: "CARE_TEAM", label: "Équipe médicale", description: "Postes, spécialités, services, disponibilité et permissions sectorielles.", icon: UsersRound, createLabel: "Affecter un membre" },
  { code: "LABORATORY", label: "Laboratoire", description: "Demandes d'examens, résultats, validation et notification au prescripteur.", icon: Microscope, createLabel: "Demande d'examen" },
  { code: "INTERNAL_PHARMACY", label: "Pharmacie interne", description: "Produits, seuils, péremption, mouvements de stock et ruptures.", icon: Pill, createLabel: "Nouveau produit" },
  { code: "MEDICAL_BILLING", label: "Facturation médicale", description: "Factures, lignes, montants, paiement, annulation et traçabilité.", icon: ReceiptText, createLabel: "Nouvelle facture" },
  { code: "INSURANCE_COVERAGE", label: "Assurances & prises en charge", description: "Dossiers assureurs, montants demandés/approuvés, validation et liaison facture.", icon: ShieldCheck, createLabel: "Nouvelle prise en charge" },
  { code: "QUALITY_INCIDENTS", label: "Incidents qualité", description: "Incidents patient, soin, confidentialité, hygiène, laboratoire, pharmacie ou facturation.", icon: AlertTriangle, createLabel: "Signaler un incident" },
  { code: "MEDICAL_DOCUMENTS", label: "Documents médicaux", description: "Ordonnances, résultats, certificats, comptes rendus et références de fichier.", icon: FileText, createLabel: "Ajouter un document" },
  { code: "MEDICAL_CONFIDENTIALITY", label: "Confidentialité médicale", description: "Règles d'accès aux dossiers, notes sensibles et validation médicale.", icon: BadgeCheck, createLabel: "Nouvelle règle" },
  { code: "HEALTH_SETTINGS", label: "Paramètres santé", description: "Préfixes, services actifs, établissement, unités, verrouillage et rôles autorisés.", icon: Settings2, createLabel: "Nouveau paramètre" },
  { code: "HEALTH_REPORTS", label: "Rapports santé", description: "Rapports d'activité, difficultés, recommandations et synthèses par service.", icon: FilePenLine, createLabel: "Nouveau rapport" },
];

const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  ARCHIVED: "Archivé",
  DECEASED: "Décédé",
  SCHEDULED: "Planifié",
  CONFIRMED: "Confirmé",
  WAITING: "En attente",
  IN_PROGRESS: "En cours",
  DONE: "Réalisé",
  CANCELLED: "Annulé",
  NO_SHOW: "Absent",
  PENDING_EXAMS: "En attente examens",
  REVIEW: "À revoir",
  CLOSED: "Clôturé",
  REQUESTED: "Demandé",
  SAMPLED: "Prélèvement effectué",
  ANALYZING: "En analyse",
  RESULT_AVAILABLE: "Résultat disponible",
  VALIDATED: "Validé",
  LOW_STOCK: "Stock faible",
  OUT_OF_STOCK: "Rupture",
  EXPIRED: "Expiré",
  ISSUED: "Émise",
  PARTIAL_PAID: "Partiellement payée",
  PAID: "Payée",
  REFUNDED: "Remboursée",
  SUBMITTED: "Soumise",
  APPROVED: "Approuvée",
  PARTIAL_APPROVED: "Partiellement approuvée",
  REJECTED: "Rejetée",
  OPEN: "Ouvert",
  ANALYSIS: "En analyse",
  RESOLVED: "Résolu",
  CONVERTED: "Converti en consultation",
  STOCK_IN: "Entrée stock",
  STOCK_OUT: "Sortie stock",
  ADJUSTED: "Ajusté",
};

const priorityLabels: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};

const moduleStatuses: Partial<Record<HealthcareRecordModuleCode, string[]>> = {
  PATIENTS: ["ACTIVE", "INACTIVE", "ARCHIVED", "DECEASED"],
  APPOINTMENTS: ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS", "DONE", "CANCELLED", "NO_SHOW"],
  CONSULTATIONS: ["DRAFT", "IN_PROGRESS", "PENDING_EXAMS", "REVIEW", "CLOSED", "CANCELLED"],
  LABORATORY: ["REQUESTED", "SAMPLED", "ANALYZING", "RESULT_AVAILABLE", "VALIDATED", "CANCELLED"],
  INTERNAL_PHARMACY: ["ACTIVE", "LOW_STOCK", "OUT_OF_STOCK", "EXPIRED", "STOCK_IN", "STOCK_OUT", "ADJUSTED", "INACTIVE"],
  MEDICAL_BILLING: ["DRAFT", "ISSUED", "PARTIAL_PAID", "PAID", "CANCELLED", "REFUNDED"],
  INSURANCE_COVERAGE: ["DRAFT", "SUBMITTED", "WAITING", "APPROVED", "PARTIAL_APPROVED", "REJECTED", "CLOSED", "CANCELLED"],
  QUALITY_INCIDENTS: ["OPEN", "ANALYSIS", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"],
};

function payloadText(record: EnterpriseSectorRecordItem, key: string) {
  const value = record.payloadJson?.[key];
  return typeof value === "string" ? value : "";
}

function defaultStatus(moduleCode: HealthcareRecordModuleCode) {
  return moduleStatuses[moduleCode]?.[0] || "ACTIVE";
}

function defaultForm(moduleCode: HealthcareRecordModuleCode): HealthcareFormState {
  return {
    moduleCode,
    recordType: recordTypeByModule[moduleCode],
    title: "",
    summary: "",
    status: defaultStatus(moduleCode),
    priority: moduleCode === "QUALITY_INCIDENTS" ? "HIGH" : "NORMAL",
    assignedToUserId: "",
    patientRecordId: "",
    appointmentRecordId: "",
    consultationRecordId: "",
    departmentId: "",
    positionId: "",
    patientCode: "",
    patientName: "",
    sex: "",
    birthDateOrAge: "",
    contactPhone: "",
    address: "",
    emergencyContact: "",
    emergencyPhone: "",
    email: "",
    profession: "",
    maritalStatus: "",
    bloodGroup: "",
    allergies: "",
    medicalHistory: "",
    linkedRecordId: "",
    healthProfessional: "",
    appointmentDate: "",
    appointmentType: "",
    careTeam: "",
    vitalSigns: "",
    symptoms: "",
    clinicalExam: "",
    provisionalDiagnosis: "",
    finalDiagnosis: "",
    treatmentPlan: "",
    prescription: "",
    requestedExams: "",
    recommendations: "",
    incidentType: "",
    severity: "MEDIUM",
    service: "",
    amountRequested: "",
    amountApproved: "",
    invoiceLines: "",
    totalAmount: "",
    paymentMethod: "",
    stockQuantity: "",
    stockThreshold: "",
    expiryDate: "",
    documentType: "",
    fileReference: "",
    settingKey: "",
    settingValue: "",
    confidentialityLevel: "CONFIDENTIAL",
    insuranceProvider: "",
    notes: "",
  };
}

function formFromRecord(record: EnterpriseSectorRecordItem): HealthcareFormState {
  const moduleCode = record.moduleCode as HealthcareRecordModuleCode;
  return {
    ...defaultForm(moduleCode),
    moduleCode,
    recordType: record.recordType as HealthcareRecordType,
    title: record.title,
    summary: record.summary || "",
    status: record.status,
    priority: record.priority,
    assignedToUserId: record.assignedTo?.id || "",
    patientRecordId: payloadText(record, "patientRecordId"),
    appointmentRecordId: payloadText(record, "appointmentRecordId") || payloadText(record, "linkedRecordId"),
    consultationRecordId: payloadText(record, "consultationRecordId"),
    departmentId: payloadText(record, "departmentId"),
    positionId: payloadText(record, "positionId"),
    patientCode: payloadText(record, "patientCode"),
    patientName: payloadText(record, "patientName"),
    sex: payloadText(record, "sex"),
    birthDateOrAge: payloadText(record, "birthDateOrAge"),
    contactPhone: payloadText(record, "contactPhone"),
    address: payloadText(record, "address"),
    emergencyContact: payloadText(record, "emergencyContact"),
    emergencyPhone: payloadText(record, "emergencyPhone"),
    email: payloadText(record, "email"),
    profession: payloadText(record, "profession"),
    maritalStatus: payloadText(record, "maritalStatus"),
    bloodGroup: payloadText(record, "bloodGroup"),
    allergies: payloadText(record, "allergies"),
    medicalHistory: payloadText(record, "medicalHistory"),
    linkedRecordId: payloadText(record, "linkedRecordId"),
    healthProfessional: payloadText(record, "healthProfessional"),
    appointmentDate: payloadText(record, "appointmentDate"),
    appointmentType: payloadText(record, "appointmentType"),
    careTeam: payloadText(record, "careTeam"),
    vitalSigns: payloadText(record, "vitalSigns"),
    symptoms: payloadText(record, "symptoms"),
    clinicalExam: payloadText(record, "clinicalExam"),
    provisionalDiagnosis: payloadText(record, "provisionalDiagnosis"),
    finalDiagnosis: payloadText(record, "finalDiagnosis"),
    treatmentPlan: payloadText(record, "treatmentPlan"),
    prescription: payloadText(record, "prescription"),
    requestedExams: payloadText(record, "requestedExams"),
    recommendations: payloadText(record, "recommendations"),
    incidentType: payloadText(record, "incidentType"),
    severity: payloadText(record, "severity") || "MEDIUM",
    service: payloadText(record, "service"),
    amountRequested: payloadText(record, "amountRequested"),
    amountApproved: payloadText(record, "amountApproved"),
    invoiceLines: payloadText(record, "invoiceLines"),
    totalAmount: payloadText(record, "totalAmount"),
    paymentMethod: payloadText(record, "paymentMethod"),
    stockQuantity: payloadText(record, "stockQuantity"),
    stockThreshold: payloadText(record, "stockThreshold"),
    expiryDate: payloadText(record, "expiryDate"),
    documentType: payloadText(record, "documentType"),
    fileReference: payloadText(record, "fileReference"),
    settingKey: payloadText(record, "settingKey"),
    settingValue: payloadText(record, "settingValue"),
    confidentialityLevel: payloadText(record, "confidentialityLevel") || "CONFIDENTIAL",
    insuranceProvider: payloadText(record, "insuranceProvider"),
    notes: payloadText(record, "notes"),
  };
}

function isToday(dateValue: string) {
  if (!dateValue) {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return dateValue.slice(0, 10) === today;
}

function isThisMonth(dateValue: string) {
  const month = new Date().toISOString().slice(0, 7);
  return dateValue.slice(0, 7) === month;
}

export function HealthcareAdminWorkspace({
  organizationId,
  records,
  members,
  departments,
  positions,
  activeModuleCodes,
  locale,
}: {
  organizationId: string;
  records: EnterpriseSectorRecordItem[];
  members: HealthcareMember[];
  departments: HealthcareDepartment[];
  positions: HealthcarePosition[];
  activeModuleCodes: Set<string>;
  locale?: string | null;
}) {
  const router = useRouter();
  const t = useCallback((key: string) => translate(locale, key), [locale]);
  const [activeModuleCode, setActiveModuleCode] = useState<HealthcareModuleCode>("HEALTH_DASHBOARD");
  const [formOpen, setFormOpen] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [editingRecord, setEditingRecord] = useState<EnterpriseSectorRecordItem | null>(null);
  const [formState, setFormState] = useState<HealthcareFormState>(() => defaultForm("PATIENTS"));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [appointmentPatientRecordId, setAppointmentPatientRecordId] = useState("");
  const [consultationPatientRecordId, setConsultationPatientRecordId] = useState("");
  const [medicalRecordPatientRecordId, setMedicalRecordPatientRecordId] = useState("");

  const enabledSubmodules = useMemo(
    () => submodules.filter((item) => item.code === "HEALTH_DASHBOARD" || activeModuleCodes.has(item.code)),
    [activeModuleCodes],
  );
  const activeSubmodule = enabledSubmodules.find((item) => item.code === activeModuleCode) || enabledSubmodules[0] || submodules[0];
  const visibleRecords = useMemo(() => records.filter((record) => record.moduleCode === activeModuleCode), [activeModuleCode, records]);
  const patientOptions = useMemo(() => records.filter((record) => record.moduleCode === "PATIENTS" && record.status !== "ARCHIVED"), [records]);
  const appointmentOptions = useMemo(() => records.filter((record) => record.moduleCode === "APPOINTMENTS" && !["ARCHIVED", "CANCELLED"].includes(record.status)), [records]);
  const consultationOptions = useMemo(() => records.filter((record) => record.moduleCode === "CONSULTATIONS" && record.status !== "ARCHIVED"), [records]);
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
        payloadText(record, "healthProfessional"),
        payloadText(record, "service"),
        payloadText(record, "incidentType"),
        payloadText(record, "documentType"),
      ].join(" "),
    [],
  );
  const list = useSmartList({ items: visibleRecords, pageSize: 7, getSearchText });

  function openCreate(moduleCode: HealthcareModuleCode) {
    if (moduleCode === "HEALTH_DASHBOARD") {
      return;
    }
    setEditingRecord(null);
    setFormState(defaultForm(moduleCode));
    setFormOpen(true);
    setMessage("");
  }

  function openRelatedPatientModule(moduleCode: "APPOINTMENTS" | "CONSULTATIONS" | "MEDICAL_RECORDS" | "MEDICAL_DOCUMENTS", patientRecordId?: string) {
    setActiveModuleCode(moduleCode);
    if (moduleCode === "APPOINTMENTS") {
      setAppointmentPatientRecordId(patientRecordId || "");
      setMessage("");
      return;
    }
    if (moduleCode === "CONSULTATIONS") {
      setConsultationPatientRecordId(patientRecordId || "");
      setMessage("");
      return;
    }
    if (moduleCode === "MEDICAL_RECORDS") {
      setMedicalRecordPatientRecordId(patientRecordId || "");
      setMessage("");
      return;
    }
    setEditingRecord(null);
    setFormState({ ...defaultForm(moduleCode), patientRecordId: patientRecordId || "" });
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

  async function runRecordAction(record: EnterpriseSectorRecordItem, action: string) {
    setMessage("");
    const response = await fetch(`/api/enterprise/${organizationId}/healthcare/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? t("enterpriseHealthcare.actionSaved") : body?.message || t("enterpriseHealthcare.failed"));
    if (response.ok) {
      router.refresh();
    }
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

  const canCreate = activeModuleCode !== "HEALTH_DASHBOARD" && activeModuleCode !== "PATIENTS" && activeModuleCode !== "APPOINTMENTS" && activeModuleCode !== "CONSULTATIONS" && activeModuleCode !== "MEDICAL_RECORDS";

  return (
    <section className="space-y-4 rounded-[1.5rem] border border-cyan-300/25 bg-cyan-400/10 p-3 shadow-[0_20px_70px_rgba(0,23,54,0.16)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{t("enterpriseHealthcare.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-black text-dtsc-ink">{t("enterpriseHealthcare.title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">{t("enterpriseHealthcare.description")}</p>
        </div>
        {canCreate && (
          <Button type="button" onClick={() => openCreate(activeModuleCode)} className="rounded-2xl bg-[#00c2ff] text-[#001736] hover:bg-cyan-300">
            <Plus className="h-4 w-4" />
            {activeSubmodule.createLabel || t("enterpriseHealthcare.add")}
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {enabledSubmodules.map((submodule) => {
          const Icon = submodule.icon;
          const active = submodule.code === activeModuleCode;
          const count = submodule.code === "HEALTH_DASHBOARD" ? records.length : records.filter((record) => record.moduleCode === submodule.code).length;
          return (
            <button
              key={submodule.code}
              type="button"
              onClick={() => setActiveModuleCode(submodule.code)}
              className={`w-64 shrink-0 rounded-2xl border p-4 text-left transition ${
                active ? "border-cyan-300 bg-cyan-300/20 shadow-[0_18px_50px_rgba(34,211,238,0.18)]" : "border-dtsc-border bg-dtsc-surface hover:border-cyan-300/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#001f46] text-cyan-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-dtsc-ink">{submodule.label}</span>
                  <span className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-dtsc-muted">{submodule.description}</span>
                  <span className="mt-2 inline-flex rounded-full bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-cyan-600">{count} élément(s)</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeModuleCode === "HEALTH_DASHBOARD" ? (
        <HealthcareDashboard records={records} />
      ) : activeModuleCode === "PATIENTS" ? (
        <HealthPatientsWorkspace organizationId={organizationId} activeModuleCodes={activeModuleCodes} onOpenRelated={openRelatedPatientModule} />
      ) : activeModuleCode === "APPOINTMENTS" ? (
        <HealthAppointmentsWorkspace organizationId={organizationId} initialPatientLegacyRecordId={appointmentPatientRecordId} activeModuleCodes={activeModuleCodes} onOpenPatients={() => setActiveModuleCode("PATIENTS")} />
      ) : activeModuleCode === "CONSULTATIONS" ? (
        <HealthConsultationsWorkspace organizationId={organizationId} initialPatientLegacyRecordId={consultationPatientRecordId} onOpenPatients={() => setActiveModuleCode("PATIENTS")} />
      ) : activeModuleCode === "MEDICAL_RECORDS" ? (
        <HealthMedicalRecordsWorkspace organizationId={organizationId} initialPatientLegacyRecordId={medicalRecordPatientRecordId} />
      ) : (
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-dtsc-ink">{activeSubmodule.label}</h3>
              <p className="text-sm font-semibold text-dtsc-muted">{activeSubmodule.description}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => openCreate(activeModuleCode)} className="rounded-xl border-cyan-300/50 bg-dtsc-page text-cyan-600 hover:bg-cyan-400/10">
              <Plus className="h-4 w-4" />
              {activeSubmodule.createLabel || t("enterpriseHealthcare.new")}
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
                      Patient: {payloadText(record, "patientName") || "Non lié"} · Responsable: {record.assignedTo?.name || payloadText(record, "healthProfessional") || "Non assigné"}
                    </p>
                  </button>
                  <ActionMenu label="Actions santé" items={recordActions(record, openEdit, setDetailsRecord, setDeleteRecord, runRecordAction, t)} />
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
      )}

      {message && <p className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 p-3 text-sm font-bold text-cyan-700 dark:text-cyan-200">{message}</p>}

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingRecord ? t("enterpriseHealthcare.formEdit") : activeSubmodule.createLabel || t("enterpriseHealthcare.formCreate")}
        description={t("enterpriseHealthcare.formDescription")}
        className="h-[94dvh] max-w-6xl"
      >
        <HealthcareRecordForm
          formState={formState}
          members={members}
          departments={departments}
          positions={positions}
          patientOptions={patientOptions}
          appointmentOptions={appointmentOptions}
          consultationOptions={consultationOptions}
          isSaving={isSaving}
          onChange={updateField}
          onSubmit={submitForm}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      <Dialog open={Boolean(detailsRecord)} onClose={() => setDetailsRecord(null)} title={detailsRecord?.title || "Détail santé"} className="max-w-5xl">
        {detailsRecord && <HealthcareDetails record={detailsRecord} locale={locale} />}
      </Dialog>

      <Dialog
        open={Boolean(deleteRecord)}
        onClose={() => setDeleteRecord(null)}
        title={t("enterpriseHealthcare.archiveTitle")}
        description={t("enterpriseHealthcare.archiveDescription")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">
              Annuler
            </Button>
            <Button type="button" onClick={() => void archiveRecord()} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
              Archiver
            </Button>
          </>
        }
      >
        <p className="text-sm font-semibold text-dtsc-muted">{t("enterpriseHealthcare.archiveConfirm").replace("{title}", deleteRecord?.title || "")}</p>
      </Dialog>
    </section>
  );
}

function HealthcareDashboard({ records }: { records: EnterpriseSectorRecordItem[] }) {
  const kpis = useMemo(() => {
    const patients = records.filter((record) => record.moduleCode === "PATIENTS" && record.status !== "ARCHIVED");
    const appointments = records.filter((record) => record.moduleCode === "APPOINTMENTS");
    const consultations = records.filter((record) => record.moduleCode === "CONSULTATIONS");
    const medicalRecords = records.filter((record) => record.moduleCode === "MEDICAL_RECORDS");
    const invoices = records.filter((record) => record.moduleCode === "MEDICAL_BILLING");
    const coverages = records.filter((record) => record.moduleCode === "INSURANCE_COVERAGE");
    const incidents = records.filter((record) => record.moduleCode === "QUALITY_INCIDENTS");
    const pharmacyItems = records.filter((record) => record.moduleCode === "INTERNAL_PHARMACY");
    const labRequests = records.filter((record) => record.moduleCode === "LABORATORY");
    return [
      { label: "Patients", value: patients.length, hint: "Total actifs et suivis", tone: "cyan" },
      { label: "Patients créés ce mois", value: patients.filter((record) => isThisMonth(record.createdAt)).length, hint: "Nouveaux profils", tone: "emerald" },
      { label: "Rendez-vous du jour", value: appointments.filter((record) => isToday(payloadText(record, "appointmentDate"))).length, hint: "Planning opérationnel", tone: "blue" },
      { label: "Rendez-vous confirmés", value: appointments.filter((record) => record.status === "CONFIRMED").length, hint: "Patients attendus", tone: "emerald" },
      { label: "Rendez-vous en attente", value: appointments.filter((record) => record.status === "WAITING").length, hint: "Accueil en cours", tone: "amber" },
      { label: "Rendez-vous annulés", value: appointments.filter((record) => record.status === "CANCELLED").length, hint: "Suivi administratif", tone: "red" },
      { label: "Patients absents", value: appointments.filter((record) => record.status === "NO_SHOW").length, hint: "Absences enregistrées", tone: "red" },
      { label: "Convertis en consultation", value: appointments.filter((record) => record.status === "CONVERTED").length, hint: "Parcours de soin", tone: "violet" },
      { label: "Consultations du jour", value: consultations.filter((record) => isToday(payloadText(record, "appointmentDate")) || isToday(record.createdAt)).length, hint: "Actes médicaux", tone: "violet" },
      { label: "Consultations en cours", value: consultations.filter((record) => record.status === "IN_PROGRESS").length, hint: "Prises en charge actives", tone: "violet" },
      { label: "En attente d’examens", value: consultations.filter((record) => record.status === "PENDING_EXAMS").length, hint: "Résultats attendus", tone: "amber" },
      { label: "Consultations à revoir", value: consultations.filter((record) => record.status === "REVIEW").length, hint: "Suivi clinique", tone: "amber" },
      { label: "Consultations clôturées", value: consultations.filter((record) => record.status === "CLOSED").length, hint: "Actes finalisés", tone: "emerald" },
      { label: "Consultations annulées", value: consultations.filter((record) => record.status === "CANCELLED").length, hint: "Annulations historisées", tone: "red" },
      { label: "Dossiers incomplets", value: medicalRecords.filter((record) => !record.summary || !payloadText(record, "medicalHistory")).length, hint: "Complétude dossier", tone: "amber" },
      { label: "Factures en attente", value: invoices.filter((record) => ["DRAFT", "ISSUED", "PARTIAL_PAID"].includes(record.status)).length, hint: "Recouvrement", tone: "blue" },
      { label: "Prises en charge en attente", value: coverages.filter((record) => ["DRAFT", "SUBMITTED", "WAITING"].includes(record.status)).length, hint: "Assurances", tone: "cyan" },
      { label: "Incidents ouverts", value: incidents.filter((record) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(record.status)).length, hint: "Qualité & risques", tone: "red" },
      { label: "Alertes pharmacie", value: pharmacyItems.filter((record) => ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRED"].includes(record.status)).length, hint: "Stock et péremption", tone: "red" },
      { label: "Alertes laboratoire", value: labRequests.filter((record) => !["VALIDATED", "CANCELLED"].includes(record.status)).length, hint: "Résultats à suivre", tone: "violet" },
    ];
  }, [records]);

  const statusGroups = useMemo(
    () => [
      { label: "Consultations", records: records.filter((record) => record.moduleCode === "CONSULTATIONS") },
      { label: "Rendez-vous", records: records.filter((record) => record.moduleCode === "APPOINTMENTS") },
      { label: "Factures", records: records.filter((record) => record.moduleCode === "MEDICAL_BILLING") },
      { label: "Incidents", records: records.filter((record) => record.moduleCode === "QUALITY_INCIDENTS") },
    ],
    [records],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{kpi.label}</p>
            <p className="mt-2 text-3xl font-black text-dtsc-ink">{kpi.value}</p>
            <p className="mt-1 text-xs font-semibold text-dtsc-muted">{kpi.hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {statusGroups.map((group) => (
          <StatusDistribution key={group.label} label={group.label} records={group.records} />
        ))}
      </div>
    </div>
  );
}

function StatusDistribution({ label, records }: { label: string; records: EnterpriseSectorRecordItem[] }) {
  const groups = Object.entries(
    records.reduce<Record<string, number>>((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {}),
  );
  const max = Math.max(1, ...groups.map(([, count]) => count));
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <h3 className="font-black text-dtsc-ink">{label} par statut</h3>
      <div className="mt-3 space-y-3">
        {groups.length ? (
          groups.map(([status, count]) => (
            <div key={status}>
              <div className="mb-1 flex items-center justify-between text-xs font-bold text-dtsc-muted">
                <span>{statusLabels[status] || status}</span>
                <span>{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-dtsc-page">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-dtsc-border bg-dtsc-page p-3 text-sm font-semibold text-dtsc-muted">Aucune donnée à afficher.</p>
        )}
      </div>
    </div>
  );
}

function HealthcareRecordForm({
  formState,
  members,
  departments,
  positions,
  patientOptions,
  appointmentOptions,
  consultationOptions,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
}: {
  formState: HealthcareFormState;
  members: HealthcareMember[];
  departments: HealthcareDepartment[];
  positions: HealthcarePosition[];
  patientOptions: EnterpriseSectorRecordItem[];
  appointmentOptions: EnterpriseSectorRecordItem[];
  consultationOptions: EnterpriseSectorRecordItem[];
  isSaving: boolean;
  onChange: (field: keyof HealthcareFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const statusOptions = moduleStatuses[formState.moduleCode] || ["ACTIVE", "IN_PROGRESS", "RESOLVED", "ARCHIVED"];
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormSection title={sectionTitle(formState.moduleCode)}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Titre">
            <Input value={formState.title} onChange={(event) => onChange("title", event.target.value)} required placeholder="Libellé clair de l'élément santé" />
          </Field>
          {formState.moduleCode !== "PATIENTS" && (
            <RecordSelect label="Patient concerné" value={formState.patientRecordId} onChange={(value) => onChange("patientRecordId", value)} records={patientOptions} emptyLabel="Aucun patient disponible" />
          )}
          <Field label="Statut">
            <select value={formState.status} onChange={(event) => onChange("status", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              {statusOptions.map((value) => <option key={value} value={value}>{statusLabels[value] || value}</option>)}
            </select>
          </Field>
          <Field label="Priorité / criticité">
            <select value={formState.priority} onChange={(event) => onChange("priority", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Résumé">
          <textarea value={formState.summary} onChange={(event) => onChange("summary", event.target.value)} rows={3} className="w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-semibold text-dtsc-ink" placeholder="Résumé opérationnel visible dans la liste" />
        </Field>
      </FormSection>

      <FormSection title="Champs métier">
        {formState.moduleCode === "PATIENTS" && <PatientFields formState={formState} onChange={onChange} />}
        {formState.moduleCode === "APPOINTMENTS" && <AppointmentFields formState={formState} onChange={onChange} members={members} />}
        {formState.moduleCode === "CONSULTATIONS" && <ConsultationFields formState={formState} onChange={onChange} members={members} appointmentOptions={appointmentOptions} />}
        {formState.moduleCode === "MEDICAL_RECORDS" && <MedicalRecordFields formState={formState} onChange={onChange} consultationOptions={consultationOptions} />}
        {formState.moduleCode === "CARE_TEAM" && <CareTeamFields formState={formState} onChange={onChange} members={members} departments={departments} positions={positions} />}
        {formState.moduleCode === "LABORATORY" && <LaboratoryFields formState={formState} onChange={onChange} members={members} consultationOptions={consultationOptions} />}
        {formState.moduleCode === "INTERNAL_PHARMACY" && <PharmacyFields formState={formState} onChange={onChange} />}
        {formState.moduleCode === "MEDICAL_BILLING" && <BillingFields formState={formState} onChange={onChange} consultationOptions={consultationOptions} />}
        {formState.moduleCode === "INSURANCE_COVERAGE" && <InsuranceFields formState={formState} onChange={onChange} />}
        {formState.moduleCode === "QUALITY_INCIDENTS" && <IncidentFields formState={formState} onChange={onChange} members={members} departments={departments} />}
        {formState.moduleCode === "MEDICAL_DOCUMENTS" && <DocumentFields formState={formState} onChange={onChange} consultationOptions={consultationOptions} />}
        {formState.moduleCode === "MEDICAL_CONFIDENTIALITY" && <SettingsFields formState={formState} onChange={onChange} confidentiality />}
        {formState.moduleCode === "HEALTH_SETTINGS" && <SettingsFields formState={formState} onChange={onChange} />}
        {formState.moduleCode === "HEALTH_REPORTS" && <ReportFields formState={formState} onChange={onChange} />}
      </FormSection>

      <FormSection title="Responsable, confidentialité et notes">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Responsable assigné">
            <select value={formState.assignedToUserId} onChange={(event) => onChange("assignedToUserId", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">Non assigné</option>
              {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.role}</option>)}
            </select>
          </Field>
          <Field label="Niveau de confidentialité">
            <select value={formState.confidentialityLevel} onChange={(event) => onChange("confidentialityLevel", event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="STANDARD">Standard</option>
              <option value="CONFIDENTIAL">Médical confidentiel</option>
              <option value="RESTRICTED">Très confidentiel</option>
            </select>
          </Field>
        </div>
        <Field label="Notes internes">
          <textarea value={formState.notes} onChange={(event) => onChange("notes", event.target.value)} rows={5} className="w-full rounded-2xl border border-dtsc-border bg-dtsc-surface p-3 text-sm font-semibold text-dtsc-ink" placeholder="Contexte, validation attendue, justification ou suivi." />
        </Field>
      </FormSection>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-dtsc-border bg-dtsc-surface/95 py-4 backdrop-blur-xl">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">Annuler</Button>
        <Button type="submit" disabled={isSaving} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">{isSaving ? "Enregistrement..." : "Enregistrer"}</Button>
      </div>
    </form>
  );
}

function sectionTitle(moduleCode: HealthcareRecordModuleCode) {
  const titles: Record<HealthcareRecordModuleCode, string> = {
    PATIENTS: "Identité du patient",
    APPOINTMENTS: "Patient, date et motif",
    CONSULTATIONS: "Consultation médicale",
    MEDICAL_RECORDS: "Dossier médical",
    CARE_TEAM: "Affectation équipe médicale",
    LABORATORY: "Demande et résultat laboratoire",
    INTERNAL_PHARMACY: "Produit et stock",
    MEDICAL_BILLING: "Facture médicale",
    INSURANCE_COVERAGE: "Prise en charge assurance",
    QUALITY_INCIDENTS: "Incident qualité",
    MEDICAL_DOCUMENTS: "Document médical",
    MEDICAL_CONFIDENTIALITY: "Règle de confidentialité",
    HEALTH_SETTINGS: "Paramètre santé",
    HEALTH_REPORTS: "Rapport santé",
  };
  return titles[moduleCode];
}

function PatientFields({ formState, onChange }: FieldGroupProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Nom complet du patient"><Input value={formState.patientName} onChange={(event) => onChange("patientName", event.target.value)} required placeholder="Nom complet" /></Field>
      <Field label="Identifiant patient"><Input value={formState.patientCode} onChange={(event) => onChange("patientCode", event.target.value)} placeholder="PAT-0001" /></Field>
      <Field label="Sexe"><Select value={formState.sex} onChange={(value) => onChange("sex", value)} options={["Féminin", "Masculin", "Autre", "Non renseigné"]} /></Field>
      <Field label="Date de naissance ou âge"><Input value={formState.birthDateOrAge} onChange={(event) => onChange("birthDateOrAge", event.target.value)} required placeholder="1990-01-01 ou 36 ans" /></Field>
      <Field label="Téléphone principal"><Input value={formState.contactPhone} onChange={(event) => onChange("contactPhone", event.target.value)} required placeholder="+243..." /></Field>
      <Field label="Adresse"><Input value={formState.address} onChange={(event) => onChange("address", event.target.value)} required placeholder="Adresse du patient" /></Field>
      <Field label="Personne de contact"><Input value={formState.emergencyContact} onChange={(event) => onChange("emergencyContact", event.target.value)} required placeholder="Nom du contact" /></Field>
      <Field label="Téléphone contact"><Input value={formState.emergencyPhone} onChange={(event) => onChange("emergencyPhone", event.target.value)} required placeholder="+243..." /></Field>
      <Field label="Email"><Input type="email" value={formState.email} onChange={(event) => onChange("email", event.target.value)} placeholder="patient@example.com" /></Field>
      <Field label="Profession"><Input value={formState.profession} onChange={(event) => onChange("profession", event.target.value)} /></Field>
      <Field label="État civil"><Input value={formState.maritalStatus} onChange={(event) => onChange("maritalStatus", event.target.value)} /></Field>
      <Field label="Groupe sanguin"><Input value={formState.bloodGroup} onChange={(event) => onChange("bloodGroup", event.target.value)} placeholder="O+, A-, ..." /></Field>
      <Field label="Allergies connues"><Input value={formState.allergies} onChange={(event) => onChange("allergies", event.target.value)} /></Field>
      <Field label="Antécédents importants"><textarea value={formState.medicalHistory} onChange={(event) => onChange("medicalHistory", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

function AppointmentFields({ formState, onChange, members }: FieldGroupProps & { members: HealthcareMember[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Date et heure"><Input type="datetime-local" value={formState.appointmentDate} onChange={(event) => onChange("appointmentDate", event.target.value)} required /></Field>
      <Field label="Type de rendez-vous"><Select value={formState.appointmentType} onChange={(value) => onChange("appointmentType", value)} options={["Consultation générale", "Consultation spécialisée", "Suivi", "Contrôle", "Urgence", "Laboratoire", "Autre"]} /></Field>
      <MemberSelect label="Professionnel assigné" value={formState.assignedToUserId} onChange={(value) => onChange("assignedToUserId", value)} members={members} />
      <Field label="Motif"><Input value={formState.service} onChange={(event) => onChange("service", event.target.value)} placeholder="Motif du rendez-vous" /></Field>
    </div>
  );
}

function ConsultationFields({ formState, onChange, members, appointmentOptions }: FieldGroupProps & { members: HealthcareMember[]; appointmentOptions: EnterpriseSectorRecordItem[] }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <RecordSelect label="Rendez-vous lié" value={formState.appointmentRecordId} onChange={(value) => onChange("appointmentRecordId", value)} records={appointmentOptions} emptyLabel="Aucun rendez-vous disponible" optional />
        <MemberSelect label="Médecin responsable" value={formState.assignedToUserId} onChange={(value) => onChange("assignedToUserId", value)} members={members} />
      </div>
      <Field label="Constantes vitales"><textarea value={formState.vitalSigns} onChange={(event) => onChange("vitalSigns", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" placeholder="Température, tension, FC, FR, SpO2, poids, taille, IMC..." /></Field>
      <Field label="Symptômes"><textarea value={formState.symptoms} onChange={(event) => onChange("symptoms", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Examen clinique"><textarea value={formState.clinicalExam} onChange={(event) => onChange("clinicalExam", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Diagnostic provisoire"><textarea value={formState.provisionalDiagnosis} onChange={(event) => onChange("provisionalDiagnosis", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
        <Field label="Diagnostic final"><textarea value={formState.finalDiagnosis} onChange={(event) => onChange("finalDiagnosis", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      </div>
      <Field label="Conduite à tenir"><textarea value={formState.treatmentPlan} onChange={(event) => onChange("treatmentPlan", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Prescription"><textarea value={formState.prescription} onChange={(event) => onChange("prescription", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Examens demandés"><textarea value={formState.requestedExams} onChange={(event) => onChange("requestedExams", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Recommandations"><textarea value={formState.recommendations} onChange={(event) => onChange("recommendations", event.target.value)} rows={3} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

function MedicalRecordFields({ formState, onChange, consultationOptions }: FieldGroupProps & { consultationOptions: EnterpriseSectorRecordItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <RecordSelect label="Consultation de référence" value={formState.consultationRecordId} onChange={(value) => onChange("consultationRecordId", value)} records={consultationOptions} emptyLabel="Aucune consultation disponible" optional />
      <Field label="Antécédents"><textarea value={formState.medicalHistory} onChange={(event) => onChange("medicalHistory", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Allergies"><textarea value={formState.allergies} onChange={(event) => onChange("allergies", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Traitements en cours"><textarea value={formState.prescription} onChange={(event) => onChange("prescription", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Alertes médicales"><textarea value={formState.recommendations} onChange={(event) => onChange("recommendations", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

function CareTeamFields({ formState, onChange, members, departments, positions }: FieldGroupProps & { members: HealthcareMember[]; departments: HealthcareDepartment[]; positions: HealthcarePosition[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <MemberSelect label="Utilisateur membre" value={formState.assignedToUserId} onChange={(value) => onChange("assignedToUserId", value)} members={members} />
      <PositionSelect label="Poste santé" value={formState.positionId} onChange={(value) => onChange("positionId", value)} positions={positions} />
      <DepartmentSelect label="Département / service" value={formState.departmentId} onChange={(value) => onChange("departmentId", value)} departments={departments} />
      <Field label="Numéro professionnel / spécialité"><Input value={formState.settingValue} onChange={(event) => onChange("settingValue", event.target.value)} /></Field>
    </div>
  );
}

function LaboratoryFields({ formState, onChange, members, consultationOptions }: FieldGroupProps & { members: HealthcareMember[]; consultationOptions: EnterpriseSectorRecordItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <RecordSelect label="Consultation liée" value={formState.consultationRecordId} onChange={(value) => onChange("consultationRecordId", value)} records={consultationOptions} emptyLabel="Aucune consultation disponible" optional />
      <Field label="Type d'examen"><Select value={formState.appointmentType} onChange={(value) => onChange("appointmentType", value)} options={["Hématologie", "Biochimie", "Parasitologie", "Immunologie", "Bactériologie", "Imagerie externe", "Autre"]} /></Field>
      <Field label="Indication"><Input value={formState.service} onChange={(event) => onChange("service", event.target.value)} /></Field>
      <MemberSelect label="Prescripteur" value={formState.assignedToUserId} onChange={(value) => onChange("assignedToUserId", value)} members={members} />
      <Field label="Résultat / compte rendu"><textarea value={formState.settingValue} onChange={(event) => onChange("settingValue", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Conclusion"><textarea value={formState.recommendations} onChange={(event) => onChange("recommendations", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

function PharmacyFields({ formState, onChange }: FieldGroupProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Catégorie"><Select value={formState.appointmentType} onChange={(value) => onChange("appointmentType", value)} options={["Médicament", "Consommable", "Matériel médical", "Produit laboratoire", "Autre"]} /></Field>
      <Field label="Forme / dosage"><Input value={formState.summary} onChange={(event) => onChange("summary", event.target.value)} placeholder="Comprimé 500mg, flacon..." /></Field>
      <Field label="Quantité disponible"><Input value={formState.stockQuantity} onChange={(event) => onChange("stockQuantity", event.target.value)} /></Field>
      <Field label="Seuil minimal"><Input value={formState.stockThreshold} onChange={(event) => onChange("stockThreshold", event.target.value)} /></Field>
      <Field label="Date expiration"><Input type="date" value={formState.expiryDate} onChange={(event) => onChange("expiryDate", event.target.value)} /></Field>
      <Field label="Fournisseur / prix interne"><Input value={formState.totalAmount} onChange={(event) => onChange("totalAmount", event.target.value)} /></Field>
    </div>
  );
}

function BillingFields({ formState, onChange, consultationOptions }: FieldGroupProps & { consultationOptions: EnterpriseSectorRecordItem[] }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <RecordSelect label="Consultation liée" value={formState.consultationRecordId} onChange={(value) => onChange("consultationRecordId", value)} records={consultationOptions} emptyLabel="Aucune consultation disponible" optional />
        <Field label="Mode de paiement"><Input value={formState.paymentMethod} onChange={(event) => onChange("paymentMethod", event.target.value)} /></Field>
        <Field label="Remise / montant net"><Input value={formState.amountApproved} onChange={(event) => onChange("amountApproved", event.target.value)} /></Field>
        <Field label="Montant total calculé"><Input value={formState.totalAmount} onChange={(event) => onChange("totalAmount", event.target.value)} /></Field>
      </div>
      <Field label="Lignes de facturation"><textarea value={formState.invoiceLines} onChange={(event) => onChange("invoiceLines", event.target.value)} rows={5} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" placeholder="Prestation | quantité | prix unitaire | total" /></Field>
    </div>
  );
}

function InsuranceFields({ formState, onChange }: FieldGroupProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Assureur"><Input value={formState.insuranceProvider} onChange={(event) => onChange("insuranceProvider", event.target.value)} /></Field>
      <Field label="Numéro police / carte"><Input value={formState.fileReference} onChange={(event) => onChange("fileReference", event.target.value)} /></Field>
      <Field label="Prestation concernée"><Input value={formState.service} onChange={(event) => onChange("service", event.target.value)} /></Field>
      <Field label="Montant estimé / demandé"><Input value={formState.amountRequested} onChange={(event) => onChange("amountRequested", event.target.value)} /></Field>
      <Field label="Montant approuvé"><Input value={formState.amountApproved} onChange={(event) => onChange("amountApproved", event.target.value)} /></Field>
    </div>
  );
}

function IncidentFields({ formState, onChange, members, departments }: FieldGroupProps & { members: HealthcareMember[]; departments: HealthcareDepartment[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Type incident"><Select value={formState.incidentType} onChange={(value) => onChange("incidentType", value)} options={["Incident patient", "Incident soin", "Incident confidentialité", "Incident administratif", "Incident laboratoire", "Incident pharmacie", "Incident facturation", "Autre"]} /></Field>
      <Field label="Criticité"><Select value={formState.severity} onChange={(value) => onChange("severity", value)} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]} /></Field>
      <DepartmentSelect label="Service concerné" value={formState.departmentId} onChange={(value) => onChange("departmentId", value)} departments={departments} />
      <MemberSelect label="Responsable de traitement" value={formState.assignedToUserId} onChange={(value) => onChange("assignedToUserId", value)} members={members} />
      <Field label="Impact"><Input value={formState.settingValue} onChange={(event) => onChange("settingValue", event.target.value)} /></Field>
      <Field label="Action corrective proposée"><textarea value={formState.recommendations} onChange={(event) => onChange("recommendations", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

function DocumentFields({ formState, onChange, consultationOptions }: FieldGroupProps & { consultationOptions: EnterpriseSectorRecordItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Type document"><Select value={formState.documentType} onChange={(value) => onChange("documentType", value)} options={["Résultat laboratoire", "Ordonnance", "Certificat médical", "Compte rendu", "Consentement", "Facture médicale", "Document assurance", "Autre"]} /></Field>
      <RecordSelect label="Consultation liée" value={formState.consultationRecordId} onChange={(value) => onChange("consultationRecordId", value)} records={consultationOptions} emptyLabel="Aucune consultation disponible" optional />
      <Field label="Référence fichier interne"><Input value={formState.fileReference} onChange={(event) => onChange("fileReference", event.target.value)} placeholder="URL interne contrôlée ou référence du fichier" /></Field>
      <Field label="Date document"><Input type="date" value={formState.appointmentDate} onChange={(event) => onChange("appointmentDate", event.target.value)} /></Field>
    </div>
  );
}

function SettingsFields({ formState, onChange, confidentiality = false }: FieldGroupProps & { confidentiality?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={confidentiality ? "Rôle ou règle de confidentialité" : "Clé de paramètre"}><Input value={formState.settingKey} onChange={(event) => onChange("settingKey", event.target.value)} placeholder={confidentiality ? "roles.medical_records.view" : "patientPrefix"} /></Field>
      <Field label="Valeur"><Input value={formState.settingValue} onChange={(event) => onChange("settingValue", event.target.value)} placeholder="PAT-, Cabinet, 48h, médecin..." /></Field>
      <Field label="Service actif / catégorie"><Input value={formState.service} onChange={(event) => onChange("service", event.target.value)} /></Field>
      <Field label="Rôles autorisés"><Input value={formState.careTeam} onChange={(event) => onChange("careTeam", event.target.value)} placeholder="Médecin, Directeur médical, Responsable qualité..." /></Field>
    </div>
  );
}

function ReportFields({ formState, onChange }: FieldGroupProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Période"><Input value={formState.appointmentDate} onChange={(event) => onChange("appointmentDate", event.target.value)} placeholder="Mai 2026, Semaine 21..." /></Field>
      <Field label="Service"><Input value={formState.service} onChange={(event) => onChange("service", event.target.value)} /></Field>
      <Field label="Difficultés"><textarea value={formState.symptoms} onChange={(event) => onChange("symptoms", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
      <Field label="Recommandations"><textarea value={formState.recommendations} onChange={(event) => onChange("recommendations", event.target.value)} rows={4} className="rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink" /></Field>
    </div>
  );
}

type FieldGroupProps = {
  formState: HealthcareFormState;
  onChange: (field: keyof HealthcareFormState, value: string) => void;
};

function recordActions(
  record: EnterpriseSectorRecordItem,
  openEdit: (record: EnterpriseSectorRecordItem) => void,
  setDetailsRecord: (record: EnterpriseSectorRecordItem) => void,
  setDeleteRecord: (record: EnterpriseSectorRecordItem) => void,
  runRecordAction: (record: EnterpriseSectorRecordItem, action: string) => Promise<void>,
  t: (key: string) => string,
): ActionMenuItem[] {
  const base: ActionMenuItem[] = [
    { key: "details", label: t("enterpriseHealthcare.details"), icon: HeartPulse, onSelect: () => setDetailsRecord(record) },
    { key: "edit", label: t("common.edit"), icon: FilePenLine, onSelect: () => openEdit(record) },
  ];
  const actionItems: ActionMenuItem[] =
    record.moduleCode === "APPOINTMENTS"
      ? [
          { key: "confirm", label: "Confirmer", icon: BadgeCheck, onSelect: () => void runRecordAction(record, "confirm") },
          { key: "mark_absent", label: "Marquer absent", icon: AlertTriangle, onSelect: () => void runRecordAction(record, "mark_absent") },
          { key: "convert_consultation", label: "Convertir en consultation", icon: ClipboardList, onSelect: () => void runRecordAction(record, "convert_consultation") },
          { key: "cancel", label: "Annuler", icon: Trash2, destructive: true, onSelect: () => void runRecordAction(record, "cancel") },
        ]
      : record.moduleCode === "CONSULTATIONS"
        ? [
            { key: "close", label: "Clôturer", icon: BadgeCheck, onSelect: () => void runRecordAction(record, "close") },
            { key: "reopen", label: "Rouvrir", icon: FilePenLine, onSelect: () => void runRecordAction(record, "reopen") },
          ]
        : record.moduleCode === "LABORATORY"
          ? [{ key: "validate", label: "Valider résultat", icon: BadgeCheck, onSelect: () => void runRecordAction(record, "validate") }]
          : record.moduleCode === "INSURANCE_COVERAGE"
            ? [
                { key: "submit", label: "Soumettre", icon: BadgeCheck, onSelect: () => void runRecordAction(record, "submit") },
                { key: "approve", label: "Approuver", icon: ShieldCheck, onSelect: () => void runRecordAction(record, "approve") },
                { key: "reject", label: "Rejeter", icon: Trash2, destructive: true, onSelect: () => void runRecordAction(record, "reject") },
              ]
            : record.moduleCode === "INTERNAL_PHARMACY"
              ? [
                  { key: "stock_in", label: "Entrée stock", icon: Plus, onSelect: () => void runRecordAction(record, "stock_in") },
                  { key: "stock_out", label: "Sortie stock", icon: Trash2, onSelect: () => void runRecordAction(record, "stock_out") },
                  { key: "adjust", label: "Ajustement", icon: FilePenLine, onSelect: () => void runRecordAction(record, "adjust") },
                ]
              : record.moduleCode === "QUALITY_INCIDENTS"
                ? [{ key: "resolve", label: "Marquer résolu", icon: BadgeCheck, onSelect: () => void runRecordAction(record, "resolve") }]
                : [];
  return [
    ...base,
    ...actionItems,
    { key: "archive", label: t("common.archive"), icon: Trash2, destructive: true, onSelect: () => setDeleteRecord(record) },
  ];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-black text-dtsc-ink">
      <span className="text-xs uppercase tracking-[0.14em] text-dtsc-muted">{label}</span>
      {children}
    </label>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 sm:p-4">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-600">{title}</h3>
      {children}
    </section>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
      <option value="">Sélectionner</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function RecordSelect({
  label,
  value,
  records,
  emptyLabel,
  optional = false,
  onChange,
}: {
  label: string;
  value: string;
  records: EnterpriseSectorRecordItem[];
  emptyLabel: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} required={!optional} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
        <option value="">{records.length ? "Sélectionner" : emptyLabel}</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {payloadText(record, "patientName") || record.title} · {statusLabels[record.status] || record.status}
          </option>
        ))}
      </select>
    </Field>
  );
}

function MemberSelect({ label, value, members, onChange }: { label: string; value: string; members: HealthcareMember[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
        <option value="">{members.length ? "Sélectionner" : "Aucun collaborateur actif"}</option>
        {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.role}</option>)}
      </select>
    </Field>
  );
}

function DepartmentSelect({ label, value, departments, onChange }: { label: string; value: string; departments: HealthcareDepartment[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
        <option value="">{departments.length ? "Sélectionner" : "Aucun département disponible"}</option>
        {departments.filter((department) => department.isActive).map((department) => <option key={department.id} value={department.id}>{department.labelFr}</option>)}
      </select>
    </Field>
  );
}

function PositionSelect({ label, value, positions, onChange }: { label: string; value: string; positions: HealthcarePosition[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
        <option value="">{positions.length ? "Sélectionner" : "Aucun poste disponible"}</option>
        {positions.filter((position) => position.isActive).map((position) => <option key={position.id} value={position.id}>{position.labelFr}</option>)}
      </select>
    </Field>
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
    ["Patient", payloadText(record, "patientName")],
    ["Référence patient", payloadText(record, "patientRecordId")],
    ["Référence rendez-vous", payloadText(record, "appointmentRecordId")],
    ["Référence consultation", payloadText(record, "consultationRecordId")],
    ["Département", payloadText(record, "departmentId")],
    ["Poste", payloadText(record, "positionId")],
    ["Code patient", payloadText(record, "patientCode")],
    ["Téléphone", payloadText(record, "contactPhone")],
    ["Date / période", payloadText(record, "appointmentDate")],
    ["Type / catégorie", payloadText(record, "appointmentType") || payloadText(record, "incidentType") || payloadText(record, "documentType")],
    ["Professionnel", payloadText(record, "healthProfessional")],
    ["Service", payloadText(record, "service")],
    ["Montant", payloadText(record, "totalAmount") || payloadText(record, "amountRequested")],
    ["Confidentialité", payloadText(record, "confidentialityLevel")],
    ["Notes", payloadText(record, "notes")],
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
