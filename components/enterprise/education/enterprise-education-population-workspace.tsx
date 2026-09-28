"use client";

import { ClipboardCheck, GraduationCap, Plus, Search, UserRoundCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import { notifyToast } from "@/lib/client-toast";
import type { EducationModuleCode } from "@/lib/enterprise/education/constants";
import { educationPopulationCopy, educationPopulationStatus, type EducationPopulationLanguage } from "@/lib/enterprise/education/population-i18n";

type PopulationModule = Extract<EducationModuleCode, "ADMISSIONS" | "STUDENTS" | "GUARDIANS">;
type Item = Record<string, any> & { id: string; status?: string; revision?: number };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
type Ref = { id: string; code?: string; name?: string; label?: string; studentNumber?: string; guardianNumber?: string; firstName?: string; lastName?: string; academicYearId?: string; campusId?: string; levelId?: string; programId?: string | null; status?: string };
type Snapshot = {
  counts: { admissionCount: number; pendingAdmissionCount: number; studentCount: number; activeEnrollmentCount: number; guardianCount: number };
  references: { academicYears: Ref[]; campuses: Ref[]; programs: Ref[]; levels: Ref[]; classGroups: Ref[]; students: Ref[]; guardians: Ref[] };
};
type Capabilities = { canWrite: boolean; canApprove: boolean; canManage: boolean };
type ModalType = "CREATE_ADMISSION" | "CREATE_GUARDIAN" | "DECIDE" | "ENROLL" | "TRANSFER" | "REACTIVATE" | "WITHDRAW" | "LINK_GUARDIAN";
type ModalState = { type: ModalType; item?: Item; decision?: "ACCEPTED" | "REJECTED" | "WAITLISTED" } | null;

const STATUS_OPTIONS: Record<PopulationModule, string[]> = {
  ADMISSIONS: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "WAITLISTED", "ENROLLED", "REJECTED", "WITHDRAWN"],
  STUDENTS: ["ACTIVE", "INACTIVE", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "ARCHIVED"],
  GUARDIANS: ["ACTIVE", "INACTIVE", "ARCHIVED"],
};

function optionLabel(ref: Ref) {
  return ref.name || ref.label || [ref.lastName, ref.firstName].filter(Boolean).join(" ") || ref.code || ref.studentNumber || ref.guardianNumber || ref.id;
}

function statusBadge(lang: EducationPopulationLanguage, status?: string) {
  if (!status) return null;
  return <span className="rounded-full border border-dtsc-border bg-dtsc-page px-2 py-1 text-[0.68rem] font-black text-dtsc-muted">{educationPopulationStatus(lang, status)}</span>;
}

function admissionTitle(item: Item) {
  return [item.candidate?.lastName, item.candidate?.firstName].filter(Boolean).join(" ") || item.applicationNumber || "—";
}

function studentTitle(item: Item) {
  return [item.lastName, item.firstName].filter(Boolean).join(" ") || item.studentNumber || "—";
}

function guardianTitle(item: Item) {
  return [item.lastName, item.firstName].filter(Boolean).join(" ") || item.guardianNumber || "—";
}

function itemTitle(moduleCode: PopulationModule, item: Item) {
  if (moduleCode === "ADMISSIONS") return admissionTitle(item);
  if (moduleCode === "STUDENTS") return studentTitle(item);
  return guardianTitle(item);
}

export function EnterpriseEducationPopulationWorkspace({
  organizationId,
  organizationName,
  initialFocus,
  locale,
}: {
  organizationId: string;
  organizationName: string;
  initialFocus: PopulationModule;
  locale?: string | null;
}) {
  const lang: EducationPopulationLanguage = locale === "en" ? "en" : "fr";
  const t = educationPopulationCopy(lang);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [paging, setPaging] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
  const [capabilities, setCapabilities] = useState<Capabilities>({ canWrite: false, canApprove: false, canManage: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ moduleCode: initialFocus, page: String(page), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/enterprise/${organizationId}/education/population?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || t.loadError);
    setSnapshot(data.snapshot);
    setItems(data.items || []);
    setPaging(data.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
    setCapabilities(data.capabilities || { canWrite: false, canApprove: false, canManage: false });
  }, [initialFocus, organizationId, search, status, t.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      load(1)
        .catch((reason) => setError(reason instanceof Error ? reason.message : t.loadError))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [load, t.loadError]);

  function openModal(type: ModalType, item?: Item, decision?: "ACCEPTED" | "REJECTED" | "WAITLISTED") {
    const activeEnrollment = item?.enrollments?.find((entry: Item) => entry.status === "ACTIVE") || item?.enrollments?.[0];
    const placement = activeEnrollment?.placements?.[0];
    const defaults: Record<string, string | boolean> = {};
    if (type === "CREATE_ADMISSION") Object.assign(defaults, { firstName: "", lastName: "", middleName: "", email: "", phone: "", birthDate: "", academicYearId: "", campusId: "", programId: "", levelId: "", classGroupId: "", applicantNotes: "" });
    if (type === "CREATE_GUARDIAN") Object.assign(defaults, { firstName: "", lastName: "", email: "", phone: "", preferredLanguage: lang });
    if (type === "DECIDE") Object.assign(defaults, { reason: "" });
    if (type === "ENROLL") Object.assign(defaults, { campusId: item?.campusId || "", programId: item?.programId || "", levelId: item?.levelId || "", classGroupId: item?.classGroupId || "" });
    if (type === "TRANSFER" || type === "REACTIVATE") Object.assign(defaults, { campusId: placement?.campusId || "", programId: placement?.programId || "", levelId: placement?.levelId || "", classGroupId: placement?.classGroupId || "", reason: "" });
    if (type === "WITHDRAW") Object.assign(defaults, { reason: "" });
    if (type === "LINK_GUARDIAN") Object.assign(defaults, { guardianId: "", relationshipType: "PARENT", isPrimary: false, isLegalGuardian: false, isBillingContact: false, isNotificationContact: true });
    setForm(defaults);
    setModal({ type, item, decision });
  }

  async function refreshCurrent() {
    await load(paging.page);
  }

  async function postJson(url: string, body: Record<string, unknown>, method = "POST") {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || t.saveError);
    return data;
  }

  async function quickAdmissionAction(item: Item, action: "SUBMIT" | "START_REVIEW") {
    setSaving(true);
    setError("");
    try {
      await postJson(`/api/enterprise/${organizationId}/education/admissions/${item.id}/actions`, { action, revision: item.revision });
      notifyToast(lang === "en" ? "Admission updated." : "Dossier d’admission mis à jour.", "success");
      await refreshCurrent();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t.saveError;
      setError(message);
      notifyToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function completeEnrollment(item: Item) {
    const enrollment = item.enrollments?.find((entry: Item) => entry.status === "ACTIVE") || item.enrollments?.[0];
    if (!enrollment) return;
    const confirmation = await confirmSensitiveAction({
      title: lang === "en" ? "Complete enrollment" : "Terminer l’inscription",
      description: lang === "en" ? "The placement history will remain available." : "L’historique des affectations restera disponible.",
      confirmLabel: t.complete,
      cancelLabel: t.cancel,
      tone: "warning",
    });
    if (!confirmation.confirmed) return;
    setSaving(true);
    try {
      await postJson(`/api/enterprise/${organizationId}/education/enrollments/${enrollment.id}/actions`, { action: "COMPLETE", revision: enrollment.revision });
      notifyToast(lang === "en" ? "Enrollment completed." : "Inscription terminée.", "success");
      await refreshCurrent();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t.saveError;
      setError(message);
      notifyToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveModal() {
    if (!modal) return;
    setSaving(true);
    setError("");
    try {
      if (modal.type === "CREATE_ADMISSION") {
        await postJson(`/api/enterprise/${organizationId}/education/population?moduleCode=ADMISSIONS`, {
          candidate: {
            firstName: form.firstName,
            lastName: form.lastName,
            middleName: form.middleName || null,
            email: form.email || null,
            phone: form.phone || null,
            birthDate: form.birthDate || null,
          },
          academicYearId: form.academicYearId,
          campusId: form.campusId,
          programId: form.programId || null,
          levelId: form.levelId || null,
          classGroupId: form.classGroupId || null,
          applicantNotes: form.applicantNotes || null,
        });
      } else if (modal.type === "CREATE_GUARDIAN") {
        await postJson(`/api/enterprise/${organizationId}/education/population?moduleCode=GUARDIANS`, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          preferredLanguage: form.preferredLanguage || null,
        });
      } else if (modal.type === "DECIDE" && modal.item && modal.decision) {
        await postJson(`/api/enterprise/${organizationId}/education/admissions/${modal.item.id}/actions`, {
          action: "DECIDE",
          revision: modal.item.revision,
          decision: modal.decision,
          reason: form.reason || null,
        });
      } else if (modal.type === "ENROLL" && modal.item) {
        await postJson(`/api/enterprise/${organizationId}/education/admissions/${modal.item.id}/actions`, {
          action: "ENROLL",
          revision: modal.item.revision,
          campusId: form.campusId,
          programId: form.programId || null,
          levelId: form.levelId,
          classGroupId: form.classGroupId || null,
        });
      } else if ((modal.type === "TRANSFER" || modal.type === "REACTIVATE") && modal.item) {
        const enrollment = modal.item.enrollments?.find((entry: Item) => modal.type === "TRANSFER" ? entry.status === "ACTIVE" : Boolean(entry.status && ["WITHDRAWN", "TRANSFERRED"].includes(entry.status))) || modal.item.enrollments?.[0];
        if (!enrollment) throw new Error(t.noEnrollment);
        await postJson(`/api/enterprise/${organizationId}/education/enrollments/${enrollment.id}/actions`, {
          action: modal.type,
          revision: enrollment.revision,
          campusId: form.campusId,
          programId: form.programId || null,
          levelId: form.levelId,
          classGroupId: form.classGroupId || null,
          reason: form.reason,
        });
      } else if (modal.type === "WITHDRAW" && modal.item) {
        const enrollment = modal.item.enrollments?.find((entry: Item) => entry.status === "ACTIVE") || modal.item.enrollments?.[0];
        if (!enrollment) throw new Error(t.noEnrollment);
        await postJson(`/api/enterprise/${organizationId}/education/enrollments/${enrollment.id}/actions`, {
          action: "WITHDRAW",
          revision: enrollment.revision,
          reason: form.reason,
        });
      } else if (modal.type === "LINK_GUARDIAN" && modal.item) {
        await postJson(`/api/enterprise/${organizationId}/education/students/${modal.item.id}/guardians`, {
          guardianId: form.guardianId,
          relationshipType: form.relationshipType,
          isPrimary: Boolean(form.isPrimary),
          isLegalGuardian: Boolean(form.isLegalGuardian),
          isBillingContact: Boolean(form.isBillingContact),
          isNotificationContact: Boolean(form.isNotificationContact),
        });
      }
      notifyToast(lang === "en" ? "Education data saved." : "Données Education enregistrées.", "success");
      setModal(null);
      await refreshCurrent();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t.saveError;
      setError(message);
      notifyToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  function refSelect(key: string, label: string, refs: Ref[], required = false, filter?: (ref: Ref) => boolean) {
    const rows = filter ? refs.filter(filter) : refs;
    return (
      <label className="min-w-0">
        <span className="mb-1.5 block text-sm font-black text-dtsc-ink">{label}{required ? " *" : ""}</span>
        <select value={String(form[key] || "")} required={required} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
          <option value="">—</option>
          {rows.map((ref) => <option key={ref.id} value={ref.id}>{optionLabel(ref)}</option>)}
        </select>
      </label>
    );
  }

  const primaryAction = capabilities.canWrite && initialFocus === "ADMISSIONS"
    ? <Button onClick={() => openModal("CREATE_ADMISSION")}><Plus className="h-4 w-4" />{t.newAdmission}</Button>
    : capabilities.canWrite && initialFocus === "GUARDIANS"
      ? <Button onClick={() => openModal("CREATE_GUARDIAN")}><Plus className="h-4 w-4" />{t.newGuardian}</Button>
      : undefined;

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={t.eyebrow} title={t.titles[initialFocus]} description={<>{t.descriptions[initialFocus]}<span className="mt-1 block text-xs font-bold">{organizationName}</span></>} primaryAction={primaryAction} />

      {snapshot ? (
        <ModuleMetrics label={lang === "en" ? "Education population indicators" : "Indicateurs population Education"}>
          <ModuleMetric label={t.admissionCount} value={snapshot.counts.admissionCount} icon={<ClipboardCheck className="h-4 w-4" />} />
          <ModuleMetric label={t.pendingAdmissions} value={snapshot.counts.pendingAdmissionCount} icon={<GraduationCap className="h-4 w-4" />} />
          <ModuleMetric label={t.studentCount} value={snapshot.counts.studentCount} icon={<Users className="h-4 w-4" />} />
          <ModuleMetric label={t.activeEnrollments} value={snapshot.counts.activeEnrollmentCount} icon={<GraduationCap className="h-4 w-4" />} />
          <ModuleMetric label={t.guardianCount} value={snapshot.counts.guardianCount} icon={<UserRoundCheck className="h-4 w-4" />} />
        </ModuleMetrics>
      ) : null}

      <ModuleContent>
        <ModuleToolbar
          search={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} className="pl-9" /></div>}
          controls={<select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink"><option value="">{t.allStatuses}</option>{STATUS_OPTIONS[initialFocus].map((entry) => <option key={entry} value={entry}>{educationPopulationStatus(lang, entry)}</option>)}</select>}
          summary={String(paging.total)}
        />

        {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">{error}</div> : null}
        {loading ? <div className="py-10 text-center text-sm font-bold text-dtsc-muted">{t.loading}</div> : null}

        {!loading && items.length === 0 ? <EmptyState icon={initialFocus === "GUARDIANS" ? UserRoundCheck : Users} title={t.empty} description={t.descriptions[initialFocus]} action={primaryAction} /> : null}

        {!loading && items.length > 0 ? (
          <BusinessList ariaLabel={t.titles[initialFocus]}>
            {items.map((item) => {
              const activeEnrollment = item.enrollments?.find((entry: Item) => entry.status === "ACTIVE") || item.enrollments?.[0];
              const placement = activeEnrollment?.placements?.[0];
              const admissionMeta = [item.applicationNumber, item.academicYear?.label, item.campus?.name].filter(Boolean).join(" · ");
              const studentMeta = [item.studentNumber, activeEnrollment?.enrollmentNumber, activeEnrollment?.academicYear?.label].filter(Boolean).join(" · ");
              const guardianMeta = [item.guardianNumber, item.email || item.phone].filter(Boolean).join(" · ");
              const description = initialFocus === "ADMISSIONS"
                ? [item.program?.name, item.level?.label, item.classGroup?.name].filter(Boolean).join(" · ")
                : initialFocus === "STUDENTS"
                  ? [placement?.campus?.name, placement?.program?.name, placement?.level?.label, placement?.classGroup?.name].filter(Boolean).join(" · ")
                  : item.students?.map((relation: Item) => studentTitle(relation.student)).join(", ");
              return (
                <BusinessListItem
                  key={item.id}
                  title={itemTitle(initialFocus, item)}
                  status={statusBadge(lang, initialFocus === "STUDENTS" ? activeEnrollment?.status || item.status : item.status)}
                  meta={initialFocus === "ADMISSIONS" ? admissionMeta : initialFocus === "STUDENTS" ? studentMeta : guardianMeta}
                  description={description || undefined}
                  actions={capabilities.canWrite ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {initialFocus === "ADMISSIONS" && item.status === "DRAFT" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => quickAdmissionAction(item, "SUBMIT")}>{t.submit}</Button> : null}
                      {initialFocus === "ADMISSIONS" && (item.status === "SUBMITTED" || item.status === "WAITLISTED") ? <Button size="sm" variant="outline" disabled={saving} onClick={() => quickAdmissionAction(item, "START_REVIEW")}>{t.startReview}</Button> : null}
                      {initialFocus === "ADMISSIONS" && item.status === "UNDER_REVIEW" && capabilities.canApprove ? <>
                        <Button size="sm" variant="outline" onClick={() => openModal("DECIDE", item, "ACCEPTED")}>{t.accept}</Button>
                        <Button size="sm" variant="outline" onClick={() => openModal("DECIDE", item, "WAITLISTED")}>{t.waitlist}</Button>
                        <Button size="sm" variant="outline" onClick={() => openModal("DECIDE", item, "REJECTED")}>{t.reject}</Button>
                      </> : null}
                      {initialFocus === "ADMISSIONS" && item.status === "ACCEPTED" ? <Button size="sm" onClick={() => openModal("ENROLL", item)}>{t.enroll}</Button> : null}
                      {initialFocus === "STUDENTS" && activeEnrollment?.status === "ACTIVE" ? <>
                        <Button size="sm" variant="outline" onClick={() => openModal("TRANSFER", item)}>{t.transfer}</Button>
                        <Button size="sm" variant="outline" onClick={() => openModal("WITHDRAW", item)}>{t.withdraw}</Button>
                        <Button size="sm" variant="outline" onClick={() => completeEnrollment(item)}>{t.complete}</Button>
                      </> : null}
                      {initialFocus === "STUDENTS" && activeEnrollment && ["WITHDRAWN", "TRANSFERRED"].includes(activeEnrollment.status) ? <Button size="sm" variant="outline" onClick={() => openModal("REACTIVATE", item)}>{t.reactivate}</Button> : null}
                      {initialFocus === "STUDENTS" ? <Button size="sm" variant="outline" onClick={() => openModal("LINK_GUARDIAN", item)}>{t.linkGuardian}</Button> : null}
                    </div>
                  ) : undefined}
                />
              );
            })}
          </BusinessList>
        ) : null}

        {paging.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={!paging.hasPreviousPage || loading} onClick={() => { setLoading(true); load(Math.max(1, paging.page - 1)).finally(() => setLoading(false)); }}>{t.previous}</Button>
            <span className="text-xs font-black text-dtsc-muted">{paging.page}/{paging.totalPages}</span>
            <Button type="button" variant="outline" disabled={!paging.hasNextPage || loading} onClick={() => { setLoading(true); load(Math.min(paging.totalPages, paging.page + 1)).finally(() => setLoading(false)); }}>{t.next}</Button>
          </div>
        ) : null}
      </ModuleContent>

      <Dialog open={Boolean(modal)} onClose={() => !saving && setModal(null)} presentation="editor" className="h-[96dvh] sm:h-[90dvh]" title={modal?.type === "CREATE_ADMISSION" ? t.newAdmission : modal?.type === "CREATE_GUARDIAN" ? t.newGuardian : modal?.type === "DECIDE" ? (modal.decision === "ACCEPTED" ? t.accept : modal.decision === "REJECTED" ? t.reject : t.waitlist) : modal?.type === "ENROLL" ? t.enroll : modal?.type === "TRANSFER" ? t.transfer : modal?.type === "REACTIVATE" ? t.reactivate : modal?.type === "WITHDRAW" ? t.withdraw : t.linkGuardian} description={t.descriptions[initialFocus]} footer={<><Button type="button" variant="outline" onClick={() => setModal(null)} disabled={saving}>{t.cancel}</Button><Button type="button" onClick={saveModal} disabled={saving}>{saving ? t.loading : t.save}</Button></>}>
        <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
          {modal?.type === "CREATE_ADMISSION" ? <>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "First name" : "Prénom"} *</span><Input value={String(form.firstName || "")} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Last name" : "Nom"} *</span><Input value={String(form.lastName || "")} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Middle name" : "Postnom"}</span><Input value={String(form.middleName || "")} onChange={(event) => setForm((current) => ({ ...current, middleName: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">Email</span><Input type="email" value={String(form.email || "")} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Phone" : "Téléphone"}</span><Input value={String(form.phone || "")} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Birth date" : "Date de naissance"}</span><Input type="date" value={String(form.birthDate || "")} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} /></label>
            {snapshot ? refSelect("academicYearId", lang === "en" ? "Academic year" : "Année académique", snapshot.references.academicYears, true) : null}
            {snapshot ? refSelect("campusId", "Campus", snapshot.references.campuses, true) : null}
            {snapshot ? refSelect("programId", lang === "en" ? "Program" : "Programme", snapshot.references.programs) : null}
            {snapshot ? refSelect("levelId", lang === "en" ? "Level" : "Niveau", snapshot.references.levels) : null}
            {snapshot ? refSelect("classGroupId", lang === "en" ? "Class / group" : "Classe / groupe", snapshot.references.classGroups, false, (ref) => (!form.academicYearId || ref.academicYearId === form.academicYearId) && (!form.campusId || ref.campusId === form.campusId)) : null}
            <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Applicant notes" : "Notes du candidat"}</span><Input multiline rows={4} value={String(form.applicantNotes || "")} onChange={(event) => setForm((current) => ({ ...current, applicantNotes: event.target.value }))} /></label>
          </> : null}

          {modal?.type === "CREATE_GUARDIAN" ? <>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "First name" : "Prénom"} *</span><Input value={String(form.firstName || "")} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Last name" : "Nom"} *</span><Input value={String(form.lastName || "")} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">Email</span><Input type="email" value={String(form.email || "")} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Phone" : "Téléphone"}</span><Input value={String(form.phone || "")} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
          </> : null}

          {modal?.type === "DECIDE" || modal?.type === "WITHDRAW" ? <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{modal.type === "DECIDE" ? t.decisionReason : t.withdrawalReason}{modal.type === "WITHDRAW" ? " *" : ""}</span><Input multiline rows={4} value={String(form.reason || "")} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></label> : null}

          {modal && ["ENROLL", "TRANSFER", "REACTIVATE"].includes(modal.type) && snapshot ? <>
            {refSelect("campusId", "Campus", snapshot.references.campuses, true)}
            {refSelect("programId", lang === "en" ? "Program" : "Programme", snapshot.references.programs)}
            {refSelect("levelId", lang === "en" ? "Level" : "Niveau", snapshot.references.levels, true)}
            {refSelect("classGroupId", lang === "en" ? "Class / group" : "Classe / groupe", snapshot.references.classGroups, false, (ref) => (!form.campusId || ref.campusId === form.campusId) && (!form.levelId || ref.levelId === form.levelId))}
            {modal.type !== "ENROLL" ? <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{t.transferReason} *</span><Input multiline rows={3} value={String(form.reason || "")} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></label> : null}
          </> : null}

          {modal?.type === "LINK_GUARDIAN" && snapshot ? <>
            {refSelect("guardianId", lang === "en" ? "Guardian" : "Tuteur", snapshot.references.guardians, true)}
            <label><span className="mb-1.5 block text-sm font-black text-dtsc-ink">{lang === "en" ? "Relationship" : "Lien"}</span><select value={String(form.relationshipType || "PARENT")} onChange={(event) => setForm((current) => ({ ...current, relationshipType: event.target.value }))} className="min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3"><option value="PARENT">{lang === "en" ? "Parent" : "Parent"}</option><option value="MOTHER">{lang === "en" ? "Mother" : "Mère"}</option><option value="FATHER">{lang === "en" ? "Father" : "Père"}</option><option value="LEGAL_GUARDIAN">{lang === "en" ? "Legal guardian" : "Tuteur légal"}</option><option value="SPONSOR">{lang === "en" ? "Sponsor" : "Responsable financier"}</option><option value="OTHER">{lang === "en" ? "Other" : "Autre"}</option></select></label>
            {(["isPrimary", "isLegalGuardian", "isBillingContact", "isNotificationContact"] as const).map((key) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page px-3"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /><span className="text-sm font-bold text-dtsc-ink">{key === "isPrimary" ? (lang === "en" ? "Primary contact" : "Contact principal") : key === "isLegalGuardian" ? (lang === "en" ? "Legal guardian" : "Tuteur légal") : key === "isBillingContact" ? (lang === "en" ? "Billing contact" : "Contact facturation") : (lang === "en" ? "Receive notifications" : "Recevoir les notifications")}</span></label>)}
          </> : null}
        </div>
      </Dialog>
    </ModuleWorkspace>
  );
}
