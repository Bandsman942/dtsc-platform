"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, Plus, UsersRound } from "lucide-react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { ProfessionalPager } from "@/components/enterprise/professional/professional-pager";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type IdentityLink = { id: string; status: string; requestedRelationType: string; activatedAt: string | null; expiresAt: string | null };
type Employee = { id: string; employeeNumber: string; organizationMemberId: string | null; firstName: string; lastName: string; displayName: string; workEmail: string | null; workPhone: string | null; positionId: string | null; positionCode: string | null; departmentId: string | null; managerEmployeeId: string | null; siteId: string | null; hireDate: string; employmentStatus: string; employmentType: string | null; baseCompensation: string | number | null; compensationCurrency: string | null; identityLink: IdentityLink | null; contracts: Array<{ id: string; reference: string; status: string; contractType: string }>; _count: { directReports: number; timesheets: number; leaveRequests: number } };
type Member = { id: string; membershipId: string; label: string; email: string; role: string; positionTitle: string | null };
type LookupItem = { id: string; labelFr?: string; labelEn?: string | null; name?: string; code?: string; positionCode?: string; employeeNumber?: string; displayName?: string; departmentId?: string | null };
type Lookups = { members: Member[]; departments: LookupItem[]; positions: LookupItem[]; employees: LookupItem[]; sites: LookupItem[]; currencies: string[] };

function identityTone(status?: string | null) { return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const; }

export function EnterpriseEmployeesIdentityWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Employee | null>(null);
  const [identityChoice, setIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], positions: [], employees: [], sites: [], currencies: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useToastMessage(notice, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/hr-payroll-lookups?module=HUMAN_RESOURCES`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as Lookups & { message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || t("identity.selectorsUnavailable"));
      if (active) setLookups(body);
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : t("identity.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (search.trim()) value.set("search", search.trim()); return value; }, [page, search]);
  const collection = useProfessionalCollection<Employee>({ endpoint: `/api/enterprise/${organizationId}/employees`, params, refreshKey });
  const lookupLabel = (item: LookupItem | undefined, fallback: string) => item ? (locale === "en" ? item.labelEn || item.labelFr || item.name || fallback : item.labelFr || item.labelEn || item.name || fallback) : fallback;
  const positionLabel = (employee: Employee) => lookupLabel(lookups.positions.find((position) => position.id === employee.positionId), t("people.positionToComplete"));
  const memberLabel = (member: Member) => `${member.label} · ${member.positionTitle || professionalErpEnumLabel(locale, "role", member.role)}`;

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setSaving(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedPositionId = String(data.get("positionId") || "") || null;
    const selectedPosition = selectedPositionId ? lookups.positions.find((position) => position.id === selectedPositionId) : undefined;
    const compensation = String(data.get("baseCompensation") || "").trim();
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/employees`, {
        organizationMemberId: String(data.get("organizationMemberId") || "") || null,
        firstName: String(data.get("firstName") || ""), lastName: String(data.get("lastName") || ""),
        workEmail: String(data.get("workEmail") || "") || null, workPhone: String(data.get("workPhone") || "") || null,
        positionId: selectedPositionId, positionCode: selectedPosition?.positionCode || null,
        departmentId: String(data.get("departmentId") || "") || null,
        managerEmployeeId: String(data.get("managerEmployeeId") || "") || null,
        siteId: String(data.get("siteId") || "") || null,
        hireDate: String(data.get("hireDate") || ""), employmentType: String(data.get("employmentType") || "") || null,
        baseCompensation: compensation || null,
        compensationCurrency: compensation ? String(data.get("compensationCurrency") || "") || null : null,
      });
      const employee = result.employee as Employee | undefined;
      const email = String(data.get("workEmail") || "").trim();
      if (employee && identityChoice !== "MANUAL_ONLY" && identityChoice !== "LINK_LATER") {
        if (!email) throw new Error(t("identity.exactEmailRequired"));
        await professionalMutation(`/api/enterprise/${organizationId}/identity-link-invitations`, {
          email,
          displayName: employee.displayName,
          employeeId: employee.id,
          relationType: String(data.get("employmentType") || "") === "CONTRACTOR" ? "COLLABORATOR" : "EMPLOYEE",
          roleCode: selectedPosition?.positionCode || null,
          purpose: `Permettre à cette personne d’accéder aux services professionnels autorisés par ${organizationName}, sans synchroniser silencieusement son dossier RH.`,
        });
      }
      form.reset(); setCreateOpen(false); setIdentityChoice("MANUAL_ONLY"); setNotice(locale === "en" ? "Employee record saved." : "Dossier collaborateur enregistré."); setRefreshKey((value) => value + 1);
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : t("identity.createFailed")); }
    finally { setSaving(false); }
  }

  const departmentItems = [{ id: "", label: t("people.none") }, ...lookups.departments.map((item) => ({ id: item.id, label: lookupLabel(item, t("people.toComplete")) }))];
  const positionItems = [{ id: "", label: t("identity.positionUndefined") }, ...lookups.positions.map((item) => ({ id: item.id, label: lookupLabel(item, t("identity.position")) }))];
  const currencies = lookups.currencies.length ? lookups.currencies : ["USD"];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("identity.eyebrow", { organization: organizationName })} title={t("identity.title")} description={`${locale === "en" ? definition.descriptionEn : definition.descriptionFr} ${t("identity.descriptionSuffix")}`} count={t("identity.count", { count: collection.pagination.total, suffix: collection.pagination.total === 1 ? "" : "s" })} primaryAction={collection.canManage ? <Button onClick={() => { setError(""); setCreateOpen(true); }} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("identity.newRecord")}</Button> : undefined} />
    <ModuleMetrics label={t("identity.metrics")}><ModuleMetric label={t("identity.activeRecords")} value={collection.metrics.active || 0} /><ModuleMetric label={t("identity.withoutActiveContract")} value={collection.metrics.withoutContract || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("identity.searchPlaceholder")} />} summary={locale === "en" ? "Canonical HR identity, assignment and account relationship." : "Identité RH canonique, affectation et relation de compte."} />
    <ModuleContent>
      {error ? <ProfessionalError message={error} /> : null}
      <ModuleSection title={t("identity.recordsSection")} description={t("identity.recordsDescription")}>
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <><BusinessList ariaLabel={t("identity.title")}>{collection.items.map((employee) => <BusinessListItem key={employee.id} title={employee.displayName} leading={<UsersRound className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={employee.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "employmentStatus", employee.employmentStatus)}</StatusBadge>} meta={`${employee.employeeNumber} · ${positionLabel(employee)}`} description={`${employee.workEmail || employee.workPhone || t("people.contactsToComplete")} · ${employee.contracts[0] ? employee.contracts[0].reference : t("identity.withoutActiveContract")}`} onOpen={() => setDetail(employee)} openLabel={t("identity.openEmployee", { name: employee.displayName })} actions={<div className="flex items-center gap-2">{employee.identityLink ? <StatusBadge tone={identityTone(employee.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", employee.identityLink.status)}</StatusBadge> : <StatusBadge>{t("identity.notLinked")}</StatusBadge>}<Button size="sm" variant="outline" onClick={() => setDetail(employee)}><Eye className="h-4 w-4" />{t("people.details")}</Button></div>} />)}</BusinessList><ProfessionalPager pagination={collection.pagination} onPageChange={setPage} locale={locale} /></> : <EmptyState compact title={t("identity.noHrRecord")} description={t("identity.noHrRecordDescription")} />}
      </ModuleSection><ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!saving) setCreateOpen(false); }} title={t("identity.newEmployeeDialog")} presentation="editor" className="h-[96dvh] max-w-5xl"><form onSubmit={createEmployee} className="grid gap-6">
      {error ? <ProfessionalError message={error} /> : null}
      <ProfessionalFormSection title={t("identity.professionalIdentity")}><Field label={t("identity.firstName")}><Input name="firstName" required /></Field><Field label={t("identity.lastName")}><Input name="lastName" required /></Field><Field label={t("identity.workEmail")}><Input name="workEmail" type="email" /></Field><Field label={t("identity.workPhone")}><Input name="workPhone" /></Field><Field label={t("identity.existingMember")}><NativeSelect name="organizationMemberId" items={[{ id: "", label: t("identity.noMember") }, ...lookups.members.map((member) => ({ id: member.membershipId, label: memberLabel(member) }))]} /></Field><Field label={t("identity.relationshipType")}><NativeSelect name="employmentType" defaultValue="EMPLOYEE" items={["EMPLOYEE", "CONTRACTOR", "INTERN", "TEMPORARY"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentType", id) }))} /></Field></ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.assignment")}><Field label={t("identity.position")}><NativeSelect name="positionId" items={positionItems} /></Field><Field label={t("identity.department")}><NativeSelect name="departmentId" items={departmentItems} /></Field><Field label={t("identity.manager")}><NativeSelect name="managerEmployeeId" items={[{ id: "", label: t("people.none") }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.displayName || ""} · ${employee.employeeNumber || ""}` }))]} /></Field><Field label={t("identity.site")}><NativeSelect name="siteId" items={[{ id: "", label: t("people.none") }, ...lookups.sites.map((site) => ({ id: site.id, label: site.name || site.code || t("people.toComplete") }))]} /></Field><Field label={t("identity.hireDate")}><Input name="hireDate" type="date" required /></Field></ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.compensationSection")} description={t("identity.compensationDescription")}><Field label={t("identity.baseCompensation")}><Input name="baseCompensation" type="number" min="0" step="0.01" /></Field><Field label={t("identity.currency")}><NativeSelect name="compensationCurrency" defaultValue={currencies[0]} items={currencies.map((id) => ({ id, label: id }))} /></Field></ProfessionalFormSection>
      <ProfessionalFormSection title={t("identity.accountRelationship")}><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} helper={t("identity.accountHelper")} /></div></ProfessionalFormSection>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>{t("people.cancel")}</Button><Button type="submit" disabled={saving} aria-busy={saving}>{saving ? (locale === "en" ? "Saving…" : "Enregistrement…") : t("identity.saveRecord")}</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || t("identity.hrRecord")} presentation="editor" className="h-[94dvh] max-w-4xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{detail.employeeNumber}</StatusBadge><StatusBadge tone={detail.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "employmentStatus", detail.employmentStatus)}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", detail.identityLink.status)}</StatusBadge> : null}</div><dl className="grid gap-4 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.workContact")}</dt><dd className="mt-1 text-sm">{detail.workEmail || detail.workPhone || "—"}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.position")}</dt><dd className="mt-1 text-sm">{positionLabel(detail)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("identity.hireDate")}</dt><dd className="mt-1 text-sm">{professionalErpDate(detail.hireDate, locale)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{locale === "en" ? "Activity" : "Activité"}</dt><dd className="mt-1 text-sm">{detail._count.timesheets} timesheet(s) · {detail._count.leaveRequests} congé(s)</dd></div></dl></div> : null}</Dialog>
  </ModuleWorkspace>;
}
