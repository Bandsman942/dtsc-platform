"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Archive, BriefcaseBusiness, ChevronRight, Clock3, FileText, RotateCcw, ShieldCheck, UserRound, UsersRound, Wallet } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpMoney, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { ProfessionalError, ProfessionalFormSection, ProfessionalLoading, professionalMutation, professionalRequest } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { StatusBadge } from "@/components/workspace/status-badge";

type LookupItem = { id: string; labelFr?: string; labelEn?: string | null; name?: string; code?: string; positionCode?: string; departmentId?: string | null; employeeNumber?: string; displayName?: string };
type Lookups = {
  departments: LookupItem[];
  positions: LookupItem[];
  employees: LookupItem[];
  sites: LookupItem[];
  currencies: string[];
};
type Employee = {
  id: string; revision: number; employeeNumber: string; firstName: string; lastName: string; displayName: string;
  organizationMemberId: string | null; workEmail: string | null; workPhone: string | null; positionId: string | null; positionCode: string | null;
  departmentId: string | null; managerEmployeeId: string | null; siteId: string | null; hireDate: string;
  employmentType: string | null; employmentStatus: string; terminationDate: string | null; archivedAt: string | null;
  baseCompensation: string | number | null; compensationCurrency: string | null;
  manager?: { id: string; displayName: string; employeeNumber: string } | null;
  site?: { id: string; name: string; timezone: string | null } | null;
  contracts: Array<{ id: string; reference: string; status: string; versionNumber: number; startDate: string }>;
  _count: { directReports: number; assignments: number; workSchedules: number; attendanceRecords: number };
};
type Activity = { key: string; count: number; items: Array<{ title: string; status: string; date: string | null; href: string | null }> };
type Response = { employee: Employee; activities: Activity[]; canEdit: boolean };

const copyByLocale = {
  fr: {
    title: "Dossier du collaborateur", back: "Retour", edit: "Modifier", save: "Enregistrer les modifications", saving: "Enregistrement…",
    archive: "Archiver", restore: "Restaurer", confirmArchive: "Archiver ce dossier ?", confirmRestore: "Restaurer ce dossier ?",
    confirmArchiveText: "Les données et historiques seront conservés. Clôturez d’abord les contrats actifs, les validations en cours et les rattachements hiérarchiques.",
    confirmRestoreText: "La restauration réactive la consultation du dossier sans effacer son historique.",
    confirm: "Confirmer", cancel: "Annuler", archived: "Archivé", readOnly: "Lecture autorisée", editAllowed: "Modifications autorisées",
    identity: "Identité et coordonnées", assignment: "Affectation et organisation", contracts: "Contrats et versions", compensation: "Rémunération confidentielle",
    activity: "Activités et liens métier", governance: "Traçabilité du dossier", email: "Email professionnel", phone: "Téléphone professionnel",
    number: "Matricule", employmentType: "Relation de travail", firstName: "Prénom", lastName: "Nom", position: "Poste officiel",
    department: "Département", manager: "Responsable", site: "Site", hireDate: "Date d’embauche", status: "Statut",
    termination: "Fin d’emploi", revision: "Révision", directReports: "Collaborateurs encadrés", assignments: "Affectations",
    schedules: "Horaires", attendance: "Présences", base: "Rémunération de base", currency: "Devise", private: "Accès RH restreint",
    noContract: "Aucun contrat", noActivity: "Aucune activité accessible", view: "Consulter", more: "Ouvrir le module",
    contractsActivity: "Contrats", timesheets: "Feuilles de temps", leave: "Congés", payroll: "Paies", projects: "Projets", assets: "Actifs",
    success: "Dossier actualisé.", archiveSuccess: "Dossier archivé sans suppression.", restoreSuccess: "Dossier restauré.",
    loadFailed: "Impossible de charger la fiche complète.", updateFailed: "La mise à jour a échoué.", archiveFailed: "L’archivage est impossible.",
  },
  en: {
    title: "Employee record", back: "Back", edit: "Edit", save: "Save changes", saving: "Saving…",
    archive: "Archive", restore: "Restore", confirmArchive: "Archive this record?", confirmRestore: "Restore this record?",
    confirmArchiveText: "Data and history will be retained. Close active contracts, pending approvals and reporting relationships first.",
    confirmRestoreText: "Restoring makes this record available again without changing its history.",
    confirm: "Confirm", cancel: "Cancel", archived: "Archived", readOnly: "Read-only access", editAllowed: "Editing permitted",
    identity: "Identity and contacts", assignment: "Assignment and organization", contracts: "Contracts and versions", compensation: "Confidential compensation",
    activity: "Activity and business links", governance: "Record history", email: "Work email", phone: "Work phone",
    number: "Employee number", employmentType: "Employment type", firstName: "First name", lastName: "Last name", position: "Official position",
    department: "Department", manager: "Manager", site: "Site", hireDate: "Hire date", status: "Status",
    termination: "Termination", revision: "Revision", directReports: "Direct reports", assignments: "Assignments",
    schedules: "Schedules", attendance: "Attendance", base: "Base compensation", currency: "Currency", private: "Restricted HR access",
    noContract: "No contract", noActivity: "No accessible activity", view: "View", more: "Open module",
    contractsActivity: "Contracts", timesheets: "Timesheets", leave: "Leave", payroll: "Payroll", projects: "Projects", assets: "Assets",
    success: "Record updated.", archiveSuccess: "Record archived without deletion.", restoreSuccess: "Record restored.",
    loadFailed: "Unable to load the full record.", updateFailed: "The update failed.", archiveFailed: "Unable to archive this record.",
  },
} as const;

function Entry({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-dtsc-ink">{value === "" || value == null ? "—" : value}</dd></div>;
}

function Section({ title, icon: Icon, color, children, defaultOpen = false }: { title: string; icon: typeof UserRound; color: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className={"group min-w-0 rounded-xl border p-3 sm:p-4 " + color} open={defaultOpen ? true : undefined}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue [&::-webkit-details-marker]:hidden">
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{title}</span><ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
    </summary>
    <div className="grid min-w-0 gap-3 pt-3">{children}</div>
  </details>;
}

export function EnterpriseEmployeeDossierDialog({
  organizationId, employeeId, lookups, onClose, onChanged,
}: {
  organizationId: string; employeeId: string | null; lookups: Lookups;
  onClose: () => void; onChanged: () => void;
}) {
  const locale = useProfessionalErpLocale();
  const copy = copyByLocale[locale === "en" ? "en" : "fr"];
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "restore" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useToastMessage(notice, "success");

  const endpoint = employeeId ? "/api/enterprise/" + organizationId + "/employees/" + employeeId : "";
  const load = useCallback(async () => {
    if (!endpoint) return;
    setLoading(true);
    try {
      const next = await professionalRequest<Response>(endpoint);
      setData(next); setError("");
    } catch (issue) { setError(issue instanceof Error ? issue.message : copy.loadFailed); }
    finally { setLoading(false); }
  }, [endpoint, copy.loadFailed]);

  useEffect(() => {
    setData(null); setEditing(false); setConfirmAction(null); setError(""); setNotice("");
    if (employeeId) void load();
  }, [employeeId, load]);

  const employee = data?.employee;
  const nameFor = (item: LookupItem | undefined) => item ? (locale === "en" ? item.labelEn || item.labelFr || item.name || item.displayName || item.code : item.labelFr || item.labelEn || item.name || item.displayName || item.code) || "—" : "—";
  const sectionName = (key: string) => ({
    contracts: copy.contractsActivity, timesheets: copy.timesheets, leave: copy.leave, payroll: copy.payroll,
    projects: copy.projects, assets: copy.assets,
  }[key] || key);
  const moduleFor = (key: string) => ({
    contracts: "HUMAN_RESOURCES", timesheets: "TIME_ATTENDANCE", leave: "TIME_ATTENDANCE",
    payroll: "PAYROLL_OPERATIONS", projects: "PROJECTS_SERVICES", assets: "ASSETS_MAINTENANCE",
  }[key] || "HUMAN_RESOURCES");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const compensation = String(form.get("baseCompensation") || "").trim();
    const selectedPositionId = String(form.get("positionId") || "") || null;
    const selectedPosition = lookups.positions.find((item) => item.id === selectedPositionId);
    try {
      await professionalMutation(endpoint, {
        revision: employee.revision,
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        workEmail: String(form.get("workEmail") || "") || null,
        workPhone: String(form.get("workPhone") || "") || null,
        positionId: selectedPositionId,
        positionCode: selectedPosition?.positionCode || null,
        departmentId: String(form.get("departmentId") || "") || null,
        managerEmployeeId: String(form.get("managerEmployeeId") || "") || null,
        siteId: String(form.get("siteId") || "") || null,
        hireDate: String(form.get("hireDate") || ""),
        employmentType: String(form.get("employmentType") || "") || null,
        baseCompensation: compensation || null,
        compensationCurrency: compensation ? String(form.get("compensationCurrency") || "") : null,
      }, "PATCH");
      setEditing(false); setNotice(copy.success); onChanged(); await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : copy.updateFailed); }
    finally { setSaving(false); }
  }

  async function changeArchiveState() {
    if (!employee || !confirmAction) return;
    setSaving(true); setError(""); setNotice("");
    try {
      if (confirmAction === "archive") {
        await professionalMutation(endpoint, { revision: employee.revision }, "DELETE");
      } else {
        await professionalMutation(endpoint + "/restore", { revision: employee.revision });
      }
      setNotice(confirmAction === "archive" ? copy.archiveSuccess : copy.restoreSuccess);
      setConfirmAction(null); onChanged(); await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : copy.archiveFailed); }
    finally { setSaving(false); }
  }

  return <>
    <Dialog open={Boolean(employeeId)} onClose={() => { if (!saving) onClose(); }} title={employee?.displayName || copy.title} presentation="editor" className="h-[96dvh] max-w-5xl">
      {loading && !employee ? <ProfessionalLoading /> : null}
      {error ? <ProfessionalError message={error} /> : null}
      {employee ? <div className="grid min-w-0 gap-4 pb-4">
        <div className="flex flex-wrap items-center gap-2" data-responsive-actions>
          <StatusBadge>{employee.employeeNumber}</StatusBadge>
          <StatusBadge tone={employee.archivedAt ? "danger" : employee.employmentStatus === "ACTIVE" ? "success" : "warning"}>
            {employee.archivedAt ? copy.archived : professionalErpEnumLabel(locale, "employmentStatus", employee.employmentStatus)}
          </StatusBadge>
          <StatusBadge tone={data?.canEdit ? "success" : "neutral"}>{data?.canEdit ? copy.editAllowed : copy.readOnly}</StatusBadge>
          <div className="flex-1" />
          {data?.canEdit && !employee.archivedAt ? <Button size="sm" variant="outline" onClick={() => setEditing((value) => !value)}>{copy.edit}</Button> : null}
          {data?.canEdit ? <Button size="sm" variant="outline" onClick={() => setConfirmAction(employee.archivedAt ? "restore" : "archive")}>
            {employee.archivedAt ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {employee.archivedAt ? copy.restore : copy.archive}
          </Button> : null}
        </div>

        {editing && data?.canEdit && !employee.archivedAt ? <form key={employee.id + ":" + employee.revision} onSubmit={save} className="grid gap-5">
          <ProfessionalFormSection title={copy.identity}>
            <Field label={copy.firstName}><Input name="firstName" defaultValue={employee.firstName} required /></Field>
            <Field label={copy.lastName}><Input name="lastName" defaultValue={employee.lastName} required /></Field>
            <Field label={copy.email}><Input name="workEmail" type="email" defaultValue={employee.workEmail || ""} /></Field>
            <Field label={copy.phone}><Input name="workPhone" defaultValue={employee.workPhone || ""} /></Field>
            <Field label={copy.employmentType}><NativeSelect name="employmentType" defaultValue={employee.employmentType || "EMPLOYEE"} items={["EMPLOYEE", "CONTRACTOR", "INTERN", "TEMPORARY"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentType", id) }))} /></Field>
            <Field label={copy.hireDate}><Input name="hireDate" type="date" defaultValue={employee.hireDate.slice(0, 10)} required /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={copy.assignment}>
            <Field label={copy.position}><NativeSelect name="positionId" defaultValue={employee.positionId || ""} items={[{ id: "", label: "—" }, ...lookups.positions.map((item) => ({ id: item.id, label: nameFor(item) }))]} /></Field>
            <Field label={copy.department}><NativeSelect name="departmentId" defaultValue={employee.departmentId || ""} items={[{ id: "", label: "—" }, ...lookups.departments.map((item) => ({ id: item.id, label: nameFor(item) }))]} /></Field>
            <Field label={copy.manager}><NativeSelect name="managerEmployeeId" defaultValue={employee.managerEmployeeId || ""} items={[{ id: "", label: "—" }, ...lookups.employees.filter((item) => item.id !== employee.id).map((item) => ({ id: item.id, label: nameFor(item) }))]} /></Field>
            <Field label={copy.site}><NativeSelect name="siteId" defaultValue={employee.siteId || ""} items={[{ id: "", label: "—" }, ...lookups.sites.map((item) => ({ id: item.id, label: nameFor(item) }))]} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title={copy.compensation}>
            <Field label={copy.base}><Input name="baseCompensation" type="number" min="0" step="0.01" defaultValue={employee.baseCompensation == null ? "" : String(employee.baseCompensation)} /></Field>
            <Field label={copy.currency}><NativeSelect name="compensationCurrency" defaultValue={employee.compensationCurrency || lookups.currencies[0]} items={lookups.currencies.map((id) => ({ id, label: id }))} /></Field>
          </ProfessionalFormSection>
          <div className="flex flex-wrap justify-end gap-2" data-responsive-actions><Button variant="outline" type="button" disabled={saving} onClick={() => setEditing(false)}>{copy.cancel}</Button><Button type="submit" disabled={saving}>{saving ? copy.saving : copy.save}</Button></div>
        </form> : <>
          <Section title={copy.identity} icon={UserRound} color="border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300" defaultOpen>
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Entry label={copy.number} value={employee.employeeNumber} /><Entry label={copy.firstName} value={employee.firstName} /><Entry label={copy.lastName} value={employee.lastName} />
              <Entry label={copy.email} value={employee.workEmail} /><Entry label={copy.phone} value={employee.workPhone} />
              <Entry label={copy.employmentType} value={employee.employmentType ? professionalErpEnumLabel(locale, "employmentType", employee.employmentType) : null} />
            </dl>
          </Section>
          <Section title={copy.assignment} icon={UsersRound} color="border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300">
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Entry label={copy.position} value={nameFor(lookups.positions.find((item) => item.id === employee.positionId))} />
              <Entry label={copy.department} value={nameFor(lookups.departments.find((item) => item.id === employee.departmentId))} />
              <Entry label={copy.manager} value={employee.manager?.displayName} /><Entry label={copy.site} value={employee.site?.name} />
              <Entry label={copy.hireDate} value={professionalErpDate(employee.hireDate, locale)} />
              <Entry label={copy.termination} value={employee.terminationDate ? professionalErpDate(employee.terminationDate, locale) : null} />
              <Entry label={copy.directReports} value={employee._count.directReports} /><Entry label={copy.assignments} value={employee._count.assignments} />
              <Entry label={copy.schedules} value={employee._count.workSchedules} /><Entry label={copy.attendance} value={employee._count.attendanceRecords} />
            </dl>
          </Section>
          <Section title={copy.contracts} icon={FileText} color="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
            {employee.contracts.length ? employee.contracts.map((contract) => <Link key={contract.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-amber-500/20 px-3 py-2 text-sm hover:bg-amber-500/10" href={"/enterprise-modules/HUMAN_RESOURCES?tab=CONTRACTS&recordId=" + encodeURIComponent(contract.id)}>
              <span className="min-w-0 break-words">{contract.reference} · v{contract.versionNumber} · {professionalErpEnumLabel(locale, "employmentContractStatus", contract.status)}</span><ChevronRight className="h-4 w-4 shrink-0" />
            </Link>) : <p className="text-sm text-dtsc-muted">{copy.noContract}</p>}
          </Section>
          <Section title={copy.compensation} icon={Wallet} color="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
            {data?.canEdit && employee.baseCompensation != null && employee.compensationCurrency
              ? <dl><Entry label={copy.base} value={professionalErpMoney(employee.baseCompensation, employee.compensationCurrency, locale)} /></dl>
              : <p className="flex items-center gap-2 text-sm text-dtsc-muted"><ShieldCheck className="h-4 w-4" />{copy.private}</p>}
          </Section>
          <Section title={copy.activity} icon={BriefcaseBusiness} color="border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-300" defaultOpen>
            {data?.activities.length ? data.activities.map((activity) => <div key={activity.key} className="min-w-0 border-b border-dtsc-border/60 pb-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                <span>{sectionName(activity.key)} · {activity.count}</span>
                <Link className="inline-flex items-center gap-1 text-dtsc-blue hover:underline" href={"/enterprise-modules/" + moduleFor(activity.key)}>{copy.more}<ChevronRight className="h-4 w-4" /></Link>
              </div>
              <div className="mt-2 grid min-w-0 gap-1">
                {activity.items.map((item, index) => item.href ? <Link href={item.href} key={index} className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-dtsc-soft">
                  <span className="min-w-0 break-words">{item.title}{item.date ? " · " + professionalErpDate(item.date, locale) : ""}</span><ChevronRight className="h-4 w-4 shrink-0" />
                </Link> : null)}
              </div>
            </div>) : <p className="text-sm text-dtsc-muted">{copy.noActivity}</p>}
          </Section>
          <Section title={copy.governance} icon={Clock3} color="border-slate-500/30 bg-slate-500/5 text-slate-700 dark:text-slate-300">
            <dl className="grid gap-4 sm:grid-cols-2"><Entry label={copy.revision} value={employee.revision} />
              <Entry label={copy.status} value={employee.archivedAt ? copy.archived : professionalErpEnumLabel(locale, "employmentStatus", employee.employmentStatus)} />
            </dl>
          </Section>
        </>}
      </div> : null}
    </Dialog>
    <Dialog open={Boolean(confirmAction)} onClose={() => { if (!saving) setConfirmAction(null); }} title={confirmAction === "archive" ? copy.confirmArchive : copy.confirmRestore} presentation="editor" className="max-w-xl">
      <div className="grid gap-4"><p className="text-sm text-dtsc-muted">{confirmAction === "archive" ? copy.confirmArchiveText : copy.confirmRestoreText}</p>
        {error ? <ProfessionalError message={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2" data-responsive-actions><Button variant="outline" disabled={saving} onClick={() => setConfirmAction(null)}>{copy.cancel}</Button><Button disabled={saving} onClick={() => void changeArchiveState()}>{saving ? copy.saving : copy.confirm}</Button></div>
      </div>
    </Dialog>
  </>;
}
