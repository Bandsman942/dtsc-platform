"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, FileText, Pencil, Plus, UsersRound, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { EnterpriseEmployeesIdentityWorkspace } from "@/components/enterprise/professional/enterprise-employees-identity-workspace";
import {
  professionalErpDate,
  professionalErpEnumLabel,
  professionalErpMoney,
  professionalErpT,
  useProfessionalErpLocale,
} from "@/components/enterprise/professional/professional-erp-i18n";
import { ProfessionalPager } from "@/components/enterprise/professional/professional-pager";
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
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Employee = {
  id: string;
  employeeNumber: string;
  displayName: string;
  departmentId: string | null;
  positionId: string | null;
  siteId: string | null;
  organizationMemberId?: string | null;
};

type Member = {
  id: string;
  membershipId: string;
  label: string;
  email: string;
  role: string;
  positionCode: string | null;
  positionTitle: string | null;
};

type Contract = {
  id: string;
  reference: string;
  employeeId: string;
  contractType: string;
  status: string;
  revision: number;
  startDate: string;
  endDate: string | null;
  probationEndDate: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  siteId: string | null;
  baseCompensation: string | number;
  compensationCurrency: string;
  payFrequency: string;
  standardHoursPerWeek: string | number | null;
  terms: string | null;
  canEdit: boolean;
  canDecide: boolean;
  employee: { id: string; employeeNumber: string; displayName: string; employmentStatus: string };
};

type Lookup = {
  id: string;
  labelFr?: string;
  labelEn?: string | null;
  departmentCode?: string;
  positionCode?: string;
  departmentId?: string | null;
  code?: string;
  name?: string;
};

type Approver = {
  userId: string;
  name: string | null;
  email: string;
  positionTitle: string | null;
  role: string;
};

type Lookups = {
  members: Member[];
  employees: Employee[];
  departments: Lookup[];
  positions: Lookup[];
  sites: Lookup[];
  approvers: Approver[];
  currencies: string[];
};

type Tab = "CONTRACTS" | "ORG";
type DecisionState = { contract: Contract; decision: "APPROVE" | "REJECT" };

const CONTRACT_TYPES = ["EMPLOYMENT", "INDEFINITE", "FIXED_TERM", "CONSULTING", "INTERNSHIP"] as const;
const LEGACY_CONTRACT_TYPE_MAP: Record<string, (typeof CONTRACT_TYPES)[number]> = {
  EMPLOYEE: "EMPLOYMENT",
  CONTRACTOR: "CONSULTING",
  INTERN: "INTERNSHIP",
  TEMPORARY: "FIXED_TERM",
};

function canonicalContractType(value: string | null | undefined): string {
  if (!value) return "EMPLOYMENT";
  return LEGACY_CONTRACT_TYPE_MAP[value] || value;
}

export function EnterpriseHumanResourcesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState<Tab>("CONTRACTS");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], employees: [], departments: [], positions: [], sites: [], approvers: [], currencies: [] });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedOrganizationMemberId, setSelectedOrganizationMemberId] = useState("");
  const [selectedContractType, setSelectedContractType] = useState("EMPLOYMENT");
  const [selectedPositionCode, setSelectedPositionCode] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useToastMessage(notice, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/hr-payroll-lookups?module=HUMAN_RESOURCES`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Partial<Lookups> & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || (locale === "en" ? "HR selectors are unavailable." : "Les référentiels RH sont indisponibles."));
        if (active) setLookups({
          members: body.members || [],
          employees: body.employees || [],
          departments: body.departments || [],
          positions: body.positions || [],
          sites: body.sites || [],
          approvers: body.approvers || [],
          currencies: body.currencies || [],
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : (locale === "en" ? "Unable to load HR references." : "Impossible de charger les référentiels RH."));
      });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status) query.set("status", status);
    return query;
  }, [page, status]);
  const collection = useProfessionalCollection<Contract>({ endpoint: `/api/enterprise/${organizationId}/employment-contracts`, params, refreshKey });

  const label = (item: Lookup | undefined, fallback = "—") => item
    ? (locale === "en" ? item.labelEn || item.labelFr || item.name || fallback : item.labelFr || item.labelEn || item.name || fallback)
    : fallback;
  const positionFor = (contract: Contract) => lookups.positions.find((item) => item.positionCode === contract.jobTitle);
  const approverItems = lookups.approvers.map((approver) => ({
    id: approver.userId,
    label: `${approver.name || approver.email} · ${approver.positionTitle || professionalErpEnumLabel(locale, "role", approver.role)}`,
  }));
  const currencies = lookups.currencies.length ? lookups.currencies : ["USD"];
  const membersWithoutHrRecord = useMemo(() => {
    const linkedMembershipIds = new Set(lookups.employees.map((employee) => employee.organizationMemberId).filter(Boolean));
    return lookups.members.filter((member) => !linkedMembershipIds.has(member.membershipId));
  }, [lookups.employees, lookups.members]);
  const contractCandidateItems = useMemo(() => [
    ...lookups.employees.map((employee) => ({ id: `employee:${employee.id}`, label: `${employee.displayName} · ${employee.employeeNumber}` })),
    ...membersWithoutHrRecord.map((member) => ({ id: `member:${member.membershipId}`, label: `${member.label} · ${locale === "en" ? "Company administration" : "Administration entreprise"}` })),
  ], [lookups.employees, membersWithoutHrRecord, locale]);
  const selectedCollaboratorRef = selectedEmployeeId
    ? `employee:${selectedEmployeeId}`
    : selectedOrganizationMemberId
      ? `member:${selectedOrganizationMemberId}`
      : "";

  function applyCollaboratorSelection(value: string) {
    if (value.startsWith("employee:")) {
      const employeeId = value.slice("employee:".length);
      setSelectedEmployeeId(employeeId);
      setSelectedOrganizationMemberId("");
      const employee = lookups.employees.find((item) => item.id === employeeId);
      const position = lookups.positions.find((item) => item.id === employee?.positionId);
      setSelectedPositionCode(position?.positionCode || "");
      setSelectedDepartmentId(employee?.departmentId || position?.departmentId || "");
      setSelectedSiteId(employee?.siteId || "");
      return;
    }
    if (value.startsWith("member:")) {
      const membershipId = value.slice("member:".length);
      setSelectedEmployeeId("");
      setSelectedOrganizationMemberId(membershipId);
      const member = lookups.members.find((item) => item.membershipId === membershipId);
      const position = lookups.positions.find((item) => item.positionCode === member?.positionCode);
      setSelectedPositionCode(position?.positionCode || "");
      setSelectedDepartmentId(position?.departmentId || "");
      setSelectedSiteId("");
      return;
    }
    setSelectedEmployeeId("");
    setSelectedOrganizationMemberId("");
    setSelectedPositionCode("");
    setSelectedDepartmentId("");
    setSelectedSiteId("");
  }

  function openCreate() {
    setEditing(null);
    setError("");
    setNotice("");
    setSelectedEmployeeId("");
    setSelectedOrganizationMemberId("");
    setSelectedContractType("EMPLOYMENT");
    setSelectedPositionCode("");
    setSelectedDepartmentId("");
    setSelectedSiteId("");
    setFormOpen(true);
  }

  function openEdit(contract: Contract) {
    setEditing(contract);
    setError("");
    setNotice("");
    setSelectedEmployeeId(contract.employeeId);
    setSelectedOrganizationMemberId("");
    setSelectedContractType(canonicalContractType(contract.contractType));
    setSelectedPositionCode(contract.jobTitle || "");
    setSelectedDepartmentId(contract.departmentId || "");
    setSelectedSiteId(contract.siteId || "");
    setFormOpen(true);
  }

  function validateContractForm(data: FormData) {
    if (!editing && !selectedEmployeeId && !selectedOrganizationMemberId) return locale === "en" ? "Select an active collaborator from Company administration." : "Sélectionnez un collaborateur actif d’Administration entreprise.";
    if (!CONTRACT_TYPES.includes(selectedContractType as (typeof CONTRACT_TYPES)[number])) return locale === "en" ? "Choose a supported contract type." : "Choisissez un type de contrat pris en charge.";
    if (!String(data.get("approverUserId") || "").trim()) return locale === "en" ? "Choose a separate authorized approver." : "Choisissez un validateur indépendant autorisé.";
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    const probationEndDate = String(data.get("probationEndDate") || "");
    if (!startDate) return locale === "en" ? "Enter the contract start date." : "Renseignez la date de début du contrat.";
    if (endDate && endDate < startDate) return locale === "en" ? "The contract end date cannot be before its start date." : "La date de fin du contrat ne peut pas précéder sa date de début.";
    if (probationEndDate && probationEndDate < startDate) return locale === "en" ? "Probation cannot end before the contract starts." : "La période d’essai ne peut pas se terminer avant le début du contrat.";
    if (endDate && probationEndDate && probationEndDate > endDate) return locale === "en" ? "Probation cannot end after the contract end date." : "La période d’essai ne peut pas se terminer après la fin du contrat.";
    const compensation = String(data.get("baseCompensation") || "").trim();
    if (!compensation || !Number.isFinite(Number(compensation)) || Number(compensation) < 0) return locale === "en" ? "Enter a valid base compensation amount." : "Renseignez une rémunération de base valide.";
    if (!String(data.get("compensationCurrency") || "").trim()) return locale === "en" ? "Choose the compensation currency." : "Choisissez la devise de rémunération.";
    return "";
  }

  async function saveContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const validationError = validateContractForm(data);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    const payload = {
      ...(editing ? {} : selectedEmployeeId ? { employeeId: selectedEmployeeId } : { organizationMemberId: selectedOrganizationMemberId }),
      contractType: selectedContractType,
      startDate: String(data.get("startDate") || ""),
      endDate: String(data.get("endDate") || "") || null,
      probationEndDate: String(data.get("probationEndDate") || "") || null,
      jobTitle: selectedPositionCode || null,
      departmentId: selectedDepartmentId || null,
      siteId: selectedSiteId || null,
      baseCompensation: String(data.get("baseCompensation") || "0"),
      compensationCurrency: String(data.get("compensationCurrency") || ""),
      payFrequency: String(data.get("payFrequency") || "MONTHLY"),
      standardHoursPerWeek: String(data.get("standardHoursPerWeek") || "") || null,
      terms: String(data.get("terms") || "") || null,
      approverUserId: String(data.get("approverUserId") || ""),
      ...(editing ? { revision: editing.revision } : {}),
    };
    try {
      await professionalMutation(
        editing ? `/api/enterprise/${organizationId}/employment-contracts/${editing.id}` : `/api/enterprise/${organizationId}/employment-contracts`,
        payload,
        editing ? "PATCH" : "POST",
      );
      form.reset();
      setFormOpen(false);
      setEditing(null);
      setNotice(locale === "en" ? "Contract saved and submitted for independent review." : "Contrat enregistré et soumis à une validation indépendante.");
      setRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : (locale === "en" ? "Unable to save contract." : "Impossible d’enregistrer le contrat."));
    } finally {
      setSaving(false);
    }
  }

  async function decideContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    const comment = String(data.get("comment") || "").trim();
    if (decision.decision === "REJECT" && comment.length < 3) {
      setError(locale === "en" ? "A rejection reason is required." : "Un motif de refus est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/employment-contracts/${decision.contract.id}/decision`, {
        decision: decision.decision,
        revision: decision.contract.revision,
        comment: comment || (decision.decision === "APPROVE" ? "Contrat contrôlé" : "Contrat rejeté"),
      });
      setDecision(null);
      setNotice(decision.decision === "APPROVE" ? (locale === "en" ? "Contract approved." : "Contrat approuvé.") : (locale === "en" ? "Contract returned with a reason." : "Contrat retourné avec motif."));
      setRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : (locale === "en" ? "Unable to record the decision." : "Impossible d’enregistrer la décision."));
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    for (const employee of lookups.employees) {
      const key = employee.departmentId || "NONE";
      groups.set(key, [...(groups.get(key) || []), employee]);
    }
    return [...groups.entries()];
  }, [lookups.employees]);

  const positionItems = [{ id: "", label: locale === "en" ? "No official position" : "Aucun poste officiel" }, ...lookups.positions.map((item) => ({ id: item.positionCode || "", label: label(item) }))];
  const departmentItems = [{ id: "", label: locale === "en" ? "No department" : "Aucun département" }, ...lookups.departments.map((item) => ({ id: item.id, label: label(item) }))];
  const siteItems = [{ id: "", label: locale === "en" ? "No site" : "Aucun site" }, ...lookups.sites.map((item) => ({ id: item.id, label: item.name || item.code || item.id }))];

  return <div className="grid gap-8">
    <EnterpriseEmployeesIdentityWorkspace organizationId={organizationId} organizationName={organizationName} definition={definition} />
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={locale === "en" ? "HR governance" : "Gouvernance RH"}
        title={locale === "en" ? "Contracts & organization" : "Contrats & organisation"}
        description={locale === "en" ? "Official positions, controlled assignments, contract versions and independent approval." : "Postes officiels, affectations contrôlées, versions contractuelles et validation indépendante."}
        count={`${collection.pagination.total}`}
        primaryAction={collection.canManage && tab === "CONTRACTS" ? <Button onClick={openCreate} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{locale === "en" ? "New contract" : "Nouveau contrat"}</Button> : undefined}
      />
      <ModuleMetrics label="RH">
        <ModuleMetric label={locale === "en" ? "Active contracts" : "Contrats actifs"} value={collection.metrics.active || 0} />
        <ModuleMetric label={locale === "en" ? "Pending approval" : "En attente de validation"} value={collection.metrics.pendingApproval || 0} />
        <ModuleMetric label={locale === "en" ? "Company collaborators" : "Collaborateurs entreprise"} value={lookups.members.length} />
      </ModuleMetrics>
      <ModuleToolbar
        controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={[
          { id: "CONTRACTS", label: locale === "en" ? "Contracts" : "Contrats", count: collection.pagination.total },
          { id: "ORG", label: locale === "en" ? "Organization" : "Organisation", count: lookups.employees.length },
        ]} />}
        summary={tab === "CONTRACTS" ? (locale === "en" ? "No free-text position: contract assignment comes from enterprise reference data." : "Aucun poste en texte libre : l’affectation contractuelle vient des référentiels entreprise.") : (locale === "en" ? "Organization chart built from canonical HR assignments." : "Organisation construite à partir des affectations RH canoniques.")}
      />
      <ModuleContent>
        {error && !formOpen && !decision ? <ProfessionalError message={error} /> : null}
        {tab === "CONTRACTS" ? <ModuleSection
          title={locale === "en" ? "Employment contracts" : "Contrats de travail"}
          description={locale === "en" ? "Search by workflow status and open a record before taking a sensitive decision." : "Filtrez par statut et ouvrez une fiche avant toute décision sensible."}
          action={<NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: locale === "en" ? "All statuses" : "Tous les statuts" }, ...["DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "ENDED", "CANCELLED"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentContractStatus", id) }))]} />}
        >
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <>
            <BusinessList ariaLabel={locale === "en" ? "Employment contracts" : "Contrats de travail"}>
              {collection.items.map((contract) => <BusinessListItem
                key={contract.id}
                title={`${contract.reference} · ${contract.employee.displayName}`}
                leading={<FileText className="h-5 w-5 text-dtsc-blue" />}
                status={<StatusBadge tone={contract.status === "ACTIVE" ? "success" : contract.status === "REJECTED" ? "danger" : contract.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>{professionalErpEnumLabel(locale, "employmentContractStatus", contract.status)}</StatusBadge>}
                meta={`${professionalErpEnumLabel(locale, "employmentContractType", canonicalContractType(contract.contractType))} · ${label(positionFor(contract), locale === "en" ? "Position not set" : "Poste non défini")}`}
                description={`${professionalErpMoney(contract.baseCompensation, contract.compensationCurrency, locale)} · ${professionalErpEnumLabel(locale, "payFrequency", contract.payFrequency)} · ${professionalErpDate(contract.startDate, locale)}`}
                onOpen={() => setDetail(contract)}
                openLabel={locale === "en" ? "Open contract" : "Ouvrir le contrat"}
                actions={<div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetail(contract)}><Eye className="h-4 w-4" />{locale === "en" ? "Review" : "Revoir"}</Button>
                  {contract.canEdit ? <Button size="sm" variant="outline" onClick={() => openEdit(contract)}><Pencil className="h-4 w-4" />{locale === "en" ? "Edit" : "Modifier"}</Button> : null}
                  {contract.canDecide ? <>
                    <Button size="sm" variant="outline" onClick={() => setDecision({ contract, decision: "APPROVE" })}><CheckCircle2 className="h-4 w-4" />{locale === "en" ? "Approve" : "Approuver"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setDecision({ contract, decision: "REJECT" })}><XCircle className="h-4 w-4" />{locale === "en" ? "Reject" : "Refuser"}</Button>
                  </> : null}
                </div>}
              />)}
            </BusinessList>
            <ProfessionalPager pagination={collection.pagination} onPageChange={setPage} locale={locale} />
          </> : <EmptyState compact title={locale === "en" ? "No contract" : "Aucun contrat"} description={locale === "en" ? "Create a contract for an active collaborator from Company administration." : "Créez un contrat pour un collaborateur actif d’Administration entreprise."} />}
        </ModuleSection> : <ModuleSection title={t("hr.orgSection")} description={locale === "en" ? "Department grouping uses canonical HR department identifiers." : "Le regroupement par département utilise les identifiants RH canoniques."}>
          {grouped.length ? <div className="grid gap-4 md:grid-cols-2">{grouped.map(([departmentId, employees]) => <div key={departmentId} className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
            <h3 className="font-black text-dtsc-ink">{departmentId === "NONE" ? (locale === "en" ? "No department" : "Sans département") : label(lookups.departments.find((item) => item.id === departmentId))}</h3>
            <div className="mt-3 grid gap-2">{employees.map((employee) => <div key={employee.id} className="flex items-center gap-2 rounded-xl bg-dtsc-soft px-3 py-2 text-sm"><UsersRound className="h-4 w-4 text-dtsc-blue" /><span className="font-bold">{employee.displayName}</span><span className="ml-auto text-xs text-dtsc-muted">{label(lookups.positions.find((item) => item.id === employee.positionId), employee.employeeNumber)}</span></div>)}</div>
          </div>)}</div> : <EmptyState compact title={locale === "en" ? "No initialized HR record" : "Aucun dossier RH initialisé"} description={locale === "en" ? "An HR record is initialized when a contract is submitted for an active Company administration collaborator." : "Un dossier RH est initialisé lors de la soumission d’un contrat pour un collaborateur actif d’Administration entreprise."} />}
        </ModuleSection>}
        <ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
      </ModuleContent>

      <Dialog
        open={formOpen}
        onClose={() => { if (!saving) { setFormOpen(false); setEditing(null); } }}
        title={editing ? (locale === "en" ? "Edit contract" : "Modifier le contrat") : t("hr.newContractDialog")}
        description={locale === "en" ? "Choose an active collaborator from Company administration. If no HR record exists yet, it is initialized only when you submit this contract." : "Choisissez un collaborateur actif d’Administration entreprise. S’il n’a pas encore de dossier RH, celui-ci est initialisé uniquement lors de la soumission de ce contrat."}
        presentation="editor"
        className="h-[96dvh] max-w-5xl"
      >
        <form key={editing?.id || "new"} onSubmit={saveContract} className="grid gap-6">
          {error ? <ProfessionalError message={error} /> : null}
          {!editing && contractCandidateItems.length === 0 ? <ProfessionalError message={locale === "en"
            ? "No active collaborator is available. Invite the person from Company administration → Collaborators and wait until the invitation is accepted before creating a contract."
            : "Aucun collaborateur actif n’est disponible. Invitez la personne depuis Administration entreprise → Collaborateurs et attendez l’acceptation de l’invitation avant de créer son contrat."} /> : null}
          {lookups.approvers.length === 0 ? <ProfessionalError message={locale === "en" ? "No independent approver is available. Another active member must receive approval permission for Human Resources before this contract can be submitted." : "Aucun validateur indépendant n’est disponible. Un autre membre actif doit recevoir le droit d’approuver Ressources humaines avant de pouvoir soumettre ce contrat."} /> : null}

          <ProfessionalFormSection title={locale === "en" ? "Employee & assignment" : "Collaborateur & affectation"} description={locale === "en" ? "Active Company administration collaborators are eligible. Existing HR records are reused; missing HR records are initialized transactionally when the contract is submitted." : "Les collaborateurs actifs d’Administration entreprise sont éligibles. Les dossiers RH existants sont réutilisés ; un dossier manquant est initialisé transactionnellement lors de la soumission du contrat."}>
            <Field label={locale === "en" ? "Employee" : "Collaborateur"} required help={locale === "en" ? "The source is Company administration → Collaborators. Accepting an invitation only grants company membership; submitting this contract explicitly initializes the HR record when needed." : "La source est Administration entreprise → Collaborateurs. Accepter une invitation donne seulement accès à l’entreprise ; la soumission de ce contrat initialise explicitement le dossier RH lorsqu’il manque."}>
              <NativeSelect
                name="collaboratorRef"
                disabled={Boolean(editing)}
                value={selectedCollaboratorRef}
                onChange={applyCollaboratorSelection}
                required
                items={[{ id: "", label: contractCandidateItems.length ? (locale === "en" ? "Select an active collaborator" : "Choisir un collaborateur actif") : (locale === "en" ? "No active collaborator" : "Aucun collaborateur actif") }, ...contractCandidateItems]}
              />
            </Field>
            <Field label={locale === "en" ? "Contract type" : "Type de contrat"} required>
              <NativeSelect name="contractType" value={selectedContractType} onChange={setSelectedContractType} required items={CONTRACT_TYPES.map((id) => ({ id, label: professionalErpEnumLabel(locale, "employmentContractType", id) }))} />
            </Field>
            <Field label={locale === "en" ? "Official position" : "Poste officiel"}>
              <NativeSelect name="jobTitle" value={selectedPositionCode} onChange={(value) => {
                setSelectedPositionCode(value);
                const position = lookups.positions.find((item) => item.positionCode === value);
                if (position?.departmentId) setSelectedDepartmentId(position.departmentId);
              }} items={positionItems} />
            </Field>
            <Field label={locale === "en" ? "Department" : "Département"}>
              <NativeSelect name="departmentId" value={selectedDepartmentId} onChange={setSelectedDepartmentId} items={departmentItems} />
            </Field>
            <Field label={locale === "en" ? "Site" : "Site"}>
              <NativeSelect name="siteId" value={selectedSiteId} onChange={setSelectedSiteId} items={siteItems} />
            </Field>
            <Field label={locale === "en" ? "Independent approver" : "Validateur indépendant"} required>
              <NativeSelect name="approverUserId" required disabled={lookups.approvers.length === 0} items={[{ id: "", label: lookups.approvers.length ? (locale === "en" ? "Select an authorized approver" : "Choisir un validateur autorisé") : (locale === "en" ? "No authorized approver available" : "Aucun validateur autorisé disponible") }, ...approverItems]} />
            </Field>
          </ProfessionalFormSection>

          <ProfessionalFormSection title={locale === "en" ? "Dates & compensation" : "Dates & rémunération"} description={locale === "en" ? "Contractual compensation remains the payroll authority. Planning and attendance never replace it." : "La rémunération contractuelle reste l’autorité de la paie. Le planning et les présences ne la remplacent jamais."}>
            <Field label={locale === "en" ? "Start date" : "Date de début"}><Input name="startDate" type="date" defaultValue={editing?.startDate?.slice(0, 10) || ""} required /></Field>
            <Field label={locale === "en" ? "End date" : "Date de fin"}><Input name="endDate" type="date" defaultValue={editing?.endDate?.slice(0, 10) || ""} /></Field>
            <Field label={locale === "en" ? "Probation end" : "Fin de période d’essai"}><Input name="probationEndDate" type="date" defaultValue={editing?.probationEndDate?.slice(0, 10) || ""} /></Field>
            <Field label={locale === "en" ? "Base compensation" : "Rémunération de base"}><Input name="baseCompensation" type="number" min="0" step="0.01" defaultValue={editing ? String(editing.baseCompensation) : ""} required /></Field>
            <Field label={locale === "en" ? "Currency" : "Devise"}><NativeSelect name="compensationCurrency" defaultValue={editing?.compensationCurrency || currencies[0]} required items={currencies.map((id) => ({ id, label: id }))} /></Field>
            <Field label={locale === "en" ? "Pay frequency" : "Fréquence"}><NativeSelect name="payFrequency" defaultValue={editing?.payFrequency || "MONTHLY"} required items={["MONTHLY", "BIWEEKLY", "WEEKLY", "DAILY", "HOURLY"].map((id) => ({ id, label: professionalErpEnumLabel(locale, "payFrequency", id) }))} /></Field>
            <Field label={locale === "en" ? "Standard hours / week" : "Heures standard / semaine"}><Input name="standardHoursPerWeek" type="number" min="0.1" max="168" step="0.1" defaultValue={editing?.standardHoursPerWeek == null ? "" : String(editing.standardHoursPerWeek)} /></Field>
            <Field label={locale === "en" ? "Terms" : "Conditions"} help={locale === "en" ? "Add only contractual conditions useful to the employment relationship. Do not duplicate structured position, compensation or schedule fields here." : "Ajoutez uniquement les conditions utiles à la relation de travail. Ne dupliquez pas ici le poste, la rémunération ou les horaires déjà structurés."}><textarea name="terms" defaultValue={editing?.terms || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm" /></Field>
          </ProfessionalFormSection>

          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" disabled={saving} onClick={() => { setFormOpen(false); setEditing(null); }}>{locale === "en" ? "Cancel" : "Annuler"}</Button>
            <Button type="submit" disabled={saving || (!editing && contractCandidateItems.length === 0) || lookups.approvers.length === 0} aria-busy={saving}>{saving ? (locale === "en" ? "Saving…" : "Enregistrement…") : (locale === "en" ? "Save & submit" : "Enregistrer & soumettre")}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.employee.displayName}` : ""} presentation="editor" className="h-[94dvh] max-w-4xl">
        {detail ? <div className="grid gap-5">
          <div className="flex flex-wrap gap-2"><StatusBadge tone={detail.status === "ACTIVE" ? "success" : detail.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>{professionalErpEnumLabel(locale, "employmentContractStatus", detail.status)}</StatusBadge><StatusBadge>{professionalErpEnumLabel(locale, "employmentContractType", canonicalContractType(detail.contractType))}</StatusBadge></div>
          <dl className="grid gap-4 border-y border-dtsc-border py-4 sm:grid-cols-2">
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{locale === "en" ? "Official position" : "Poste officiel"}</dt><dd className="mt-1 text-sm">{label(positionFor(detail), "—")}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{locale === "en" ? "Compensation" : "Rémunération"}</dt><dd className="mt-1 text-sm">{professionalErpMoney(detail.baseCompensation, detail.compensationCurrency, locale)}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{locale === "en" ? "Period" : "Période"}</dt><dd className="mt-1 text-sm">{professionalErpDate(detail.startDate, locale)} → {detail.endDate ? professionalErpDate(detail.endDate, locale) : "∞"}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">{locale === "en" ? "Frequency" : "Fréquence"}</dt><dd className="mt-1 text-sm">{professionalErpEnumLabel(locale, "payFrequency", detail.payFrequency)}</dd></div>
          </dl>
          {detail.terms ? <p className="whitespace-pre-wrap rounded-xl bg-dtsc-soft p-4 text-sm">{detail.terms}</p> : null}
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(decision)} onClose={() => { if (!saving) setDecision(null); }} title={decision?.decision === "APPROVE" ? (locale === "en" ? "Approve contract" : "Approuver le contrat") : (locale === "en" ? "Reject contract" : "Refuser le contrat")} presentation="editor" className="h-[72dvh] max-w-2xl">
        {decision ? <form onSubmit={decideContract} className="grid gap-5">
          {error ? <ProfessionalError message={error} /> : null}
          <p className="text-sm text-dtsc-muted">{decision.contract.reference} · {decision.contract.employee.displayName}</p>
          <Field label={decision.decision === "REJECT" ? (locale === "en" ? "Required reason" : "Motif obligatoire") : (locale === "en" ? "Review comment" : "Commentaire de contrôle")} required={decision.decision === "REJECT"} help={decision.decision === "REJECT" ? (locale === "en" ? "Explain what must be corrected before the contract is resubmitted." : "Expliquez ce qui doit être corrigé avant une nouvelle soumission du contrat.") : undefined}>
            <textarea name="comment" required={decision.decision === "REJECT"} className="min-h-36 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm" />
          </Field>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" disabled={saving} onClick={() => setDecision(null)}>{locale === "en" ? "Back" : "Retour"}</Button><Button type="submit" disabled={saving} aria-busy={saving}>{saving ? (locale === "en" ? "Saving…" : "Enregistrement…") : decision.decision === "APPROVE" ? (locale === "en" ? "Approve" : "Approuver") : (locale === "en" ? "Reject" : "Refuser")}</Button></div>
        </form> : null}
      </Dialog>
    </ModuleWorkspace>
  </div>;
}