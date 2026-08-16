"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, FileText, Plus, UsersRound, XCircle } from "lucide-react";
import { EnterpriseEmployeesIdentityWorkspace } from "@/components/enterprise/professional/enterprise-employees-identity-workspace";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpNumber,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Employee = { id: string; employeeNumber: string; displayName: string; departmentId: string | null; positionId: string | null };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Department = { id: string; departmentCode: string; labelFr: string; labelEn: string | null };
type Site = { id: string; code: string; name: string };
type Lookups = { employees: Employee[]; members: Member[]; departments: Department[]; sites: Site[] };
type EmploymentContract = { id: string; reference: string; employeeId: string; contractType: string; status: string; versionNumber: number; startDate: string; endDate: string | null; probationEndDate: string | null; jobTitle: string | null; departmentId: string | null; siteId: string | null; baseCompensation: string | number; compensationCurrency: string; payFrequency: string; standardHoursPerWeek: string | number | null; terms: string | null; revision: number; employee: { id: string; employeeNumber: string; displayName: string; employmentStatus: string } };

const CONTRACT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "REJECTED", "SUSPENDED", "ENDED", "CANCELLED"];
const CONTRACT_TYPES = ["EMPLOYMENT", "FIXED_TERM", "INDEFINITE", "CONSULTING", "INTERNSHIP"];
const PAY_FREQUENCIES = ["MONTHLY", "BIWEEKLY", "WEEKLY", "DAILY", "HOURLY"];
function statusTone(status: string) { if (["ACTIVE", "APPROVED"].includes(status)) return "success" as const; if (["PENDING_APPROVAL", "SUSPENDED"].includes(status)) return "warning" as const; if (["REJECTED", "ENDED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }

export function EnterpriseHumanResourcesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => count === 1 ? "" : "s";
  const departmentLabel = (department: Department) => locale === "en" ? department.labelEn || department.labelFr : department.labelFr;
  const [tab, setTab] = useState("CONTRACTS");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], departments: [], sites: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<EmploymentContract | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=HUMAN_RESOURCES`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || professionalErpT(locale, "hr.selectorsUnavailable")); if (active) setLookups({ employees: body.employees || [], members: body.members || [], departments: body.departments || [], sites: body.sites || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : professionalErpT(locale, "hr.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (status) value.set("status", status); return value; }, [page, status]);
  const contracts = useProfessionalCollection<EmploymentContract>({ endpoint: `/api/enterprise/${organizationId}/employment-contracts`, params, refreshKey });

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/employment-contracts`, { employeeId: String(form.get("employeeId") || ""), contractType: String(form.get("contractType") || "EMPLOYMENT"), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") || null, probationEndDate: String(form.get("probationEndDate") || "") || null, jobTitle: String(form.get("jobTitle") || "") || null, departmentId: String(form.get("departmentId") || "") || null, siteId: String(form.get("siteId") || "") || null, baseCompensation: Number(form.get("baseCompensation") || 0), compensationCurrency: String(form.get("compensationCurrency") || "USD"), payFrequency: String(form.get("payFrequency") || "MONTHLY"), standardHoursPerWeek: String(form.get("standardHoursPerWeek") || "") ? Number(form.get("standardHoursPerWeek")) : null, terms: String(form.get("terms") || "") || null, approverUserId: String(form.get("approverUserId") || "") }); setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage(t("hr.contractSubmitted")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("hr.contractCreateFailed")); }
  }

  async function decide(contract: EmploymentContract, decision: "APPROVE" | "REJECT") {
    const comment = decision === "REJECT" ? window.prompt(t("hr.rejectPrompt")) || "Contrat rejeté" : "Contrat contrôlé";
    try { await professionalMutation(`/api/enterprise/${organizationId}/employment-contracts/${contract.id}/decision`, { decision, revision: contract.revision, comment }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? t("hr.contractApproved") : t("hr.contractRejected")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("hr.decisionFailed")); }
  }

  function actionsFor(contract: EmploymentContract): BusinessContextAction[] { return [{ id: "open", label: t("people.open"), icon: Eye, onSelect: () => setDetail(contract) }, ...(contract.status === "PENDING_APPROVAL" ? [{ id: "approve", label: t("people.approve"), icon: CheckCircle2, onSelect: () => void decide(contract, "APPROVE") }, { id: "reject", label: t("people.reject"), icon: XCircle, destructive: true, onSelect: () => void decide(contract, "REJECT") }] : [])]; }

  const departments = lookups.departments.map((department) => ({ department, employees: lookups.employees.filter((employee) => employee.departmentId === department.id) }));
  const unassignedEmployees = lookups.employees.filter((employee) => !employee.departmentId);
  const contractTypeItems = CONTRACT_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentContractType", id) }));
  const frequencyItems = PAY_FREQUENCIES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "payFrequency", id) }));
  const statusItems = [{ id: "", label: t("people.allStatuses") }, ...CONTRACT_STATUSES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentContractStatus", id) }))];

  return <div className="grid gap-8">
    <EnterpriseEmployeesIdentityWorkspace organizationId={organizationId} organizationName={organizationName} definition={definition} />
    <ModuleWorkspace>
      <ModuleHeader eyebrow={t("hr.eyebrow", { organization: organizationName })} title={t("hr.title")} description={t("hr.description")} count={t("hr.count", { count: contracts.pagination.total, suffix: suffix(contracts.pagination.total) })} primaryAction={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("hr.newContract")}</Button>} />
      <ModuleMetrics label={t("hr.metrics")}><ModuleMetric label={t("hr.activeContracts")} value={contracts.metrics.active || 0} /><ModuleMetric label={t("hr.toApprove")} value={contracts.metrics.pendingApproval || 0} /><ModuleMetric label={t("hr.activeEmployees")} value={lookups.employees.length} /><ModuleMetric label={t("hr.departments")} value={lookups.departments.length} /></ModuleMetrics>
      <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={setTab} items={[{ id: "CONTRACTS", label: t("hr.contractsTab"), count: contracts.pagination.total }, { id: "ORG", label: t("hr.orgTab"), count: lookups.employees.length }]} />{tab === "CONTRACTS" ? <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={statusItems} /> : null}</>} summary={t("hr.toolbarSummary")} />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
        {tab === "CONTRACTS" ? <ModuleSection title={t("hr.contractsSection")} description={t("hr.contractsSectionDescription")}>{contracts.error ? <ProfessionalError message={contracts.error} /> : contracts.loading ? <ProfessionalLoading /> : contracts.items.length ? <BusinessList ariaLabel={t("hr.contractsSection")}>{contracts.items.map((contract) => <BusinessListItem key={contract.id} title={`${contract.reference} · ${contract.employee.displayName}`} leading={<FileText className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(contract.status)}>{professionalErpEnumLabel(locale, "employmentContractStatus", contract.status)}</StatusBadge>} meta={`${professionalErpEnumLabel(locale, "employmentContractType", contract.contractType)} · ${professionalErpMoney(contract.baseCompensation, contract.compensationCurrency, locale)} · ${professionalErpEnumLabel(locale, "payFrequency", contract.payFrequency)}`} description={t("hr.contractVersionRange", { version: contract.versionNumber, start: professionalErpDate(contract.startDate, locale), end: contract.endDate ? t("hr.contractEnd", { date: professionalErpDate(contract.endDate, locale) }) : t("hr.noEndDate") })} onOpen={() => setDetail(contract)} actions={<ContextActions label={t("hr.contractActions")} actions={actionsFor(contract)} />} />)}</BusinessList> : <EmptyState compact title={t("hr.noContract")} description={t("hr.noContractDescription")} />}</ModuleSection> : <ModuleSection title={t("hr.orgSection")} description={t("hr.orgDescription")}><div className="grid gap-4 md:grid-cols-2">{departments.map(({ department, employees }) => <section key={department.id} className="rounded-2xl border border-dtsc-border p-4"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-dtsc-blue" /><h3 className="font-black text-dtsc-ink">{departmentLabel(department)}</h3></div><div className="mt-3 grid gap-2">{employees.length ? employees.map((employee) => <div key={employee.id} className="rounded-xl bg-dtsc-page px-3 py-2 text-sm"><p className="font-black">{employee.displayName}</p><p className="text-dtsc-muted">{employee.employeeNumber}</p></div>) : <p className="text-sm text-dtsc-muted">{t("hr.noActiveEmployee")}</p>}</div></section>)}{unassignedEmployees.length ? <section className="rounded-2xl border border-dashed border-dtsc-border p-4"><h3 className="font-black">{t("hr.noDepartment")}</h3><div className="mt-3 grid gap-2">{unassignedEmployees.map((employee) => <div key={employee.id} className="rounded-xl bg-dtsc-page px-3 py-2 text-sm">{employee.employeeNumber} · {employee.displayName}</div>)}</div></section> : null}</div></ModuleSection>}
        <ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("hr.newContractDialog")} className="h-[96dvh] max-w-5xl"><form onSubmit={createContract} className="grid gap-5"><ProfessionalFormSection title={t("hr.employeeAndJob")}><Field label={t("hr.employee")}><NativeSelect name="employeeId" required items={[{ id: "", label: t("people.select") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label={t("hr.contractType")}><NativeSelect name="contractType" defaultValue="EMPLOYMENT" items={contractTypeItems} /></Field><Field label={t("hr.jobTitle")}><Input name="jobTitle" /></Field><Field label={t("hr.department")}><NativeSelect name="departmentId" items={[{ id: "", label: t("people.notProvided") }, ...lookups.departments.map((department) => ({ id: department.id, label: departmentLabel(department) }))]} /></Field><Field label={t("hr.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("people.notProvided") }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field><Field label={t("hr.approver")}><NativeSelect name="approverUserId" required items={[{ id: "", label: t("people.selectAnother") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("hr.periodAndCompensation")}><Field label={t("hr.startDate")}><Input name="startDate" type="date" required /></Field><Field label={t("hr.endDate")}><Input name="endDate" type="date" /></Field><Field label={t("hr.probationEnd")}><Input name="probationEndDate" type="date" /></Field><Field label={t("hr.baseCompensation")}><Input name="baseCompensation" type="number" min="0" step="0.01" required /></Field><Field label={t("hr.currency")}><Input name="compensationCurrency" defaultValue="USD" maxLength={3} required /></Field><Field label={t("hr.frequency")}><NativeSelect name="payFrequency" defaultValue="MONTHLY" items={frequencyItems} /></Field><Field label={t("hr.standardHoursWeek")}><Input name="standardHoursPerWeek" type="number" min="1" max="168" step="0.5" /></Field><Field label={t("hr.terms")}><textarea name="terms" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("people.cancel")}</Button><Button type="submit">{t("hr.submitContract")}</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.employee.displayName}` : t("hr.contractDetail")} className="h-[90dvh] max-w-4xl">{detail ? <div className="grid gap-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{professionalErpEnumLabel(locale, "employmentContractStatus", detail.status)}</StatusBadge><StatusBadge>{professionalErpMoney(detail.baseCompensation, detail.compensationCurrency, locale)}</StatusBadge></div><div className="grid gap-3 text-sm leading-6 md:grid-cols-2"><p><strong>{t("hr.typeLabel")}</strong> {professionalErpEnumLabel(locale, "employmentContractType", detail.contractType)}</p><p><strong>{t("hr.positionLabel")}</strong> {detail.jobTitle || t("people.notProvided")}</p><p><strong>{t("hr.startLabel")}</strong> {professionalErpDate(detail.startDate, locale)}</p><p><strong>{t("hr.endLabel")}</strong> {detail.endDate ? professionalErpDate(detail.endDate, locale) : t("people.notProvided")}</p><p><strong>{t("hr.frequencyLabel")}</strong> {professionalErpEnumLabel(locale, "payFrequency", detail.payFrequency)}</p><p><strong>{t("hr.standardTimeLabel")}</strong> {detail.standardHoursPerWeek != null ? t("hr.hoursPerWeek", { value: professionalErpNumber(detail.standardHoursPerWeek, locale, 1) }) : "—"}</p></div><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}</Dialog>
    </ModuleWorkspace>
  </div>;
}