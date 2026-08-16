"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, Plus, UsersRound } from "lucide-react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type IdentityLink = { id: string; status: string; requestedRelationType: string; activatedAt: string | null; expiresAt: string | null };
type Employee = {
  id: string;
  employeeNumber: string;
  organizationMemberId: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  workEmail: string | null;
  workPhone: string | null;
  positionId: string | null;
  positionCode: string | null;
  departmentId: string | null;
  managerEmployeeId: string | null;
  siteId: string | null;
  hireDate: string;
  employmentStatus: string;
  employmentType: string | null;
  baseCompensation: string | number | null;
  compensationCurrency: string | null;
  identityLink: IdentityLink | null;
  contracts: Array<{ id: string; reference: string; status: string; contractType: string }>;
  _count: { directReports: number; timesheets: number; leaveRequests: number };
};
type Member = { id: string; membershipId: string; label: string; email: string; role: string; positionTitle: string | null };
type LookupItem = { id: string; labelFr?: string; labelEn?: string | null; name?: string; code?: string; positionCode?: string; employeeNumber?: string; displayName?: string };
type Lookups = { members: Member[]; departments: LookupItem[]; positions: LookupItem[]; employees: LookupItem[]; sites: LookupItem[] };

function identityTone(status?: string | null) { return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const; }

export function EnterpriseEmployeesIdentityWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const suffix = (count: number) => count === 1 ? "" : "s";
  const lookupLabel = (item: LookupItem | undefined, fallback: string) => item ? (locale === "en" ? item.labelEn || item.labelFr || item.name || fallback : item.labelFr || item.labelEn || item.name || fallback) : fallback;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [identityChoice, setIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], positions: [], employees: [], sites: [] });
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=HUMAN_RESOURCES`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as Lookups & { message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || professionalErpT(locale, "identity.selectorsUnavailable"));
      if (active) setLookups(body);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : professionalErpT(locale, "identity.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "50" }); if (search.trim()) value.set("search", search.trim()); return value; }, [page, search]);
  const collection = useProfessionalCollection<Employee>({ endpoint: `/api/enterprise/${organizationId}/employees`, params, refreshKey });

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedPositionId = String(form.get("positionId") || "") || null;
    const selectedPosition = selectedPositionId ? lookups.positions.find((position) => position.id === selectedPositionId) : undefined;
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/employees`, {
        organizationMemberId: String(form.get("organizationMemberId") || "") || null,
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
        baseCompensation: String(form.get("baseCompensation") || "") || null,
        compensationCurrency: String(form.get("compensationCurrency") || "") || null,
      });
      const employee = result.employee as Employee | undefined;
      const email = String(form.get("workEmail") || "").trim();
      if (employee && identityChoice !== "MANUAL_ONLY" && identityChoice !== "LINK_LATER") {
        if (!email) throw new Error(t("identity.exactEmailRequired"));
        await professionalMutation(`/api/enterprise/${organizationId}/identity-link-invitations`, {
          email,
          displayName: employee.displayName,
          employeeId: employee.id,
          relationType: String(form.get("employmentType") || "") === "CONTRACTOR" ? "COLLABORATOR" : "EMPLOYEE",
          roleCode: selectedPosition?.positionCode || null,
          purpose: `Permettre à cette personne d’accéder aux services professionnels autorisés par ${organizationName}, sans synchroniser silencieusement son dossier RH.`,
        });
      }
      setCreateOpen(false);
      setIdentityChoice("MANUAL_ONLY");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("identity.createFailed"));
    }
  }

  const positionLabel = (employee: Employee) => lookupLabel(lookups.positions.find((position) => position.id === employee.positionId), t("people.positionToComplete"));
  const departmentItems = [{ id: "", label: t("people.none") }, ...lookups.departments.map((department) => ({ id: department.id, label: lookupLabel(department, t("people.toComplete")) }))];
  const positionItems = [{ id: "", label: t("identity.positionUndefined") }, ...lookups.positions.map((position) => ({ id: position.id, label: lookupLabel(position, t("identity.position")) }))];
  const employmentTypeItems = ["EMPLOYEE", "CONTRACTOR", "INTERN", "TEMPORARY"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentType", id) }));

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("identity.eyebrow", { organization: organizationName })} title={t("identity.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("identity.descriptionSuffix")}`} count={t("identity.count", { count: collection.pagination.total, suffix: suffix(collection.pagination.total) })} primaryAction={collection.canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("identity.newRecord")}</Button> : undefined} />
    <ModuleMetrics label={t("identity.metrics")}><ModuleMetric label={t("identity.activeRecords")} value={collection.metrics.active || 0} /><ModuleMetric label={t("identity.withoutActiveContract")} value={collection.metrics.withoutContract || 0} /><ModuleMetric label={t("identity.activeDtscRelations")} value={collection.items.filter((item) => item.identityLink?.status === "ACTIVE").length} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("identity.searchPlaceholder")} />} summary={t("identity.toolbarSummary")} />
    <ModuleContent>
      {message ? <ProfessionalError message={message} /> : null}
      <ModuleSection title={t("identity.recordsSection")} description={t("identity.recordsDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <BusinessList ariaLabel={t("identity.title")}>{collection.items.map((employee) => {
          const contractStatus = employee.contracts[0] ? professionalErpEnumLabel(locale, "employmentContractStatus", employee.contracts[0].status) : null;
          return <BusinessListItem key={employee.id} title={employee.displayName} leading={<UsersRound className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={employee.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "employmentStatus", employee.employmentStatus)}</StatusBadge>} meta={`${employee.employeeNumber} · ${positionLabel(employee)}`} description={`${employee.workEmail || employee.workPhone || t("people.contactsToComplete")} · ${contractStatus ? t("identity.contractWithStatus", { status: contractStatus }) : t("identity.withoutActiveContract")}`} onOpen={() => setDetail(employee)} openLabel={t("identity.openEmployee", { name: employee.displayName })} actions={<div className="flex items-center gap-2">{employee.identityLink ? <StatusBadge tone={identityTone(employee.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", employee.identityLink.status)}</StatusBadge> : <StatusBadge>{t("identity.notLinked")}</StatusBadge>}<Button size="sm" variant="outline" onClick={() => setDetail(employee)}><Eye className="h-4 w-4" />{t("people.details")}</Button></div>} />;
        })}</BusinessList> : <EmptyState compact title={t("identity.noHrRecord")} description={t("identity.noHrRecordDescription")} />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("identity.newEmployeeDialog")} className="h-[94dvh] max-w-4xl"><form onSubmit={createEmployee} className="grid gap-6">
      {message ? <ProfessionalError message={message} /> : null}
      <ProfessionalFormSection title={t("identity.professionalIdentity")}>
        <Field label={t("identity.firstName")}><Input name="firstName" required /></Field><Field label={t("identity.lastName")}><Input name="lastName" required /></Field>
        <Field label={t("identity.workEmail")}><Input name="workEmail" type="email" /></Field><Field label={t("identity.workPhone")}><Input name="workPhone" /></Field>
        <Field label={t("identity.existingMember")}><NativeSelect name="organizationMemberId" items={[{ id: "", label: t("identity.noMember") }, ...lookups.members.map((member) => ({ id: member.membershipId, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field>
        <Field label={t("identity.relationshipType")}><NativeSelect name="employmentType" defaultValue="EMPLOYEE" items={employmentTypeItems} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.assignment")}>
        <Field label={t("identity.position")}><NativeSelect name="positionId" items={positionItems} /></Field>
        <Field label={t("identity.department")}><NativeSelect name="departmentId" items={departmentItems} /></Field>
        <Field label={t("identity.manager")}><NativeSelect name="managerEmployeeId" items={[{ id: "", label: t("people.none") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.displayName || t("people.toComplete")} · ${employee.employeeNumber || ""}` }))]} /></Field>
        <Field label={t("identity.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("people.none") }, ...lookups.sites.map((site) => ({ id: site.id, label: site.name || site.code || t("people.toComplete") }))]} /></Field>
        <Field label={t("identity.hireDate")}><Input name="hireDate" type="date" required /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.compensationSection")} description={t("identity.compensationDescription")}>
        <Field label={t("identity.baseCompensation")}><Input name="baseCompensation" type="number" min="0" step="0.01" /></Field><Field label={t("identity.currency")}><Input name="compensationCurrency" defaultValue="USD" maxLength={3} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.accountRelationship")}><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} helper={t("identity.accountHelper")} /></div></ProfessionalFormSection>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("people.cancel")}</Button><Button type="submit">{t("identity.saveRecord")}</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || t("identity.hrRecord")} className="h-[92dvh] max-w-3xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{detail.employeeNumber}</StatusBadge><StatusBadge tone={detail.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "employmentStatus", detail.employmentStatus)}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", detail.identityLink.status)}</StatusBadge> : <StatusBadge>{t("identity.accountNotLinked")}</StatusBadge>}</div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.workContact")}</dt><dd className="mt-1 text-sm">{detail.workEmail || detail.workPhone || t("people.toComplete")}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.entry")}</dt><dd className="mt-1 text-sm">{professionalErpDate(detail.hireDate, locale)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.assignment")}</dt><dd className="mt-1 text-sm">{positionLabel(detail)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.contract")}</dt><dd className="mt-1 text-sm">{detail.contracts[0]?.reference || t("identity.withoutActiveContract")}</dd></div></dl><ModuleSection title={t("identity.privacyTitle")} description={t("identity.privacyDescription")}>{detail.identityLink ? <p className="text-sm text-dtsc-muted">{t("identity.relationState", { status: professionalErpEnumLabel(locale, "identityStatus", detail.identityLink.status) })}</p> : <EmptyState compact title={t("identity.noDtscRelation")} description={t("identity.noDtscRelationDescription")} />}</ModuleSection></div> : null}</Dialog>
  </ModuleWorkspace>;
}