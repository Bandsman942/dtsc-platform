"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, Plus, UsersRound } from "lucide-react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
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
type LookupItem = { id: string; labelFr?: string; name?: string; code?: string; positionCode?: string; employeeNumber?: string; displayName?: string };
type Lookups = { members: Member[]; departments: LookupItem[]; positions: LookupItem[]; employees: LookupItem[]; sites: LookupItem[] };

const IDENTITY_LABELS: Record<string, string> = { INVITATION_PENDING: "Invitation en attente", REQUEST_PENDING: "Demande en attente", USER_CONSENT_REQUIRED: "Consentement requis", ORGANIZATION_APPROVAL_REQUIRED: "Approbation requise", ACTIVE: "Relation active", REFUSED: "Refusée", EXPIRED: "Expirée", REVOKED: "Révoquée", CANCELLED: "Annulée" };
function identityTone(status?: string | null) { return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const; }

export function EnterpriseEmployeesIdentityWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
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
      if (!response.ok || !body) throw new Error(body?.message || body?.error || "Sélecteurs indisponibles.");
      if (active) setLookups(body);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Sélecteurs indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

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
        if (!email) throw new Error("Une adresse e-mail professionnelle exacte est nécessaire pour remettre l’invitation privée.");
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
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`Socle RH et identité · ${organizationName}`} title="Employés et collaborateurs" description={`${definition.descriptionFr} Cette vue professionnalise uniquement la création du dossier et la liaison consentie ; les autres fonctions RH conservent leur maturité propre.`} count={`${collection.pagination.total} dossier${collection.pagination.total > 1 ? "s" : ""}`} primaryAction={collection.canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouveau dossier</Button> : undefined} />
    <ModuleMetrics label="Indicateurs RH"><ModuleMetric label="Dossiers actifs" value={collection.metrics.active || 0} /><ModuleMetric label="Sans contrat actif" value={collection.metrics.withoutContract || 0} /><ModuleMetric label="Relations DTSC actives" value={collection.items.filter((item) => item.identityLink?.status === "ACTIVE").length} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nom, matricule ou e-mail…" />} summary="Une fiche RH reste distincte du compte global DTSC." />
    <ModuleContent>
      {message ? <ProfessionalError message={message} /> : null}
      <ModuleSection title="Dossiers employés" description="La révocation d’une liaison retire les accès sans supprimer le dossier RH ni ses historiques légitimes.">
        {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <BusinessList ariaLabel="Employés et collaborateurs">{collection.items.map((employee) => <BusinessListItem key={employee.id} title={employee.displayName} leading={<UsersRound className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={employee.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{employee.employmentStatus === "ACTIVE" ? "Actif" : employee.employmentStatus}</StatusBadge>} meta={`${employee.employeeNumber} · ${employee.positionCode || "Poste à compléter"}`} description={`${employee.workEmail || employee.workPhone || "Coordonnées à compléter"} · ${employee.contracts[0] ? `Contrat ${employee.contracts[0].status}` : "Sans contrat actif"}`} onOpen={() => setDetail(employee)} openLabel={`Ouvrir ${employee.displayName}`} actions={<div className="flex items-center gap-2">{employee.identityLink ? <StatusBadge tone={identityTone(employee.identityLink.status)}>{IDENTITY_LABELS[employee.identityLink.status] || employee.identityLink.status}</StatusBadge> : <StatusBadge>Non lié</StatusBadge>}<Button size="sm" variant="outline" onClick={() => setDetail(employee)}><Eye className="h-4 w-4" />Détail</Button></div>} />)}</BusinessList> : <EmptyState compact title="Aucun dossier RH" description="Créez une fiche manuellement, invitez un compte existant ou proposez la création d’un compte DTSC." />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau dossier employé" className="h-[94dvh] max-w-4xl"><form onSubmit={createEmployee} className="grid gap-6">
      {message ? <ProfessionalError message={message} /> : null}
      <ProfessionalFormSection title="Identité professionnelle">
        <Field label="Prénom"><Input name="firstName" required /></Field><Field label="Nom"><Input name="lastName" required /></Field>
        <Field label="E-mail professionnel"><Input name="workEmail" type="email" /></Field><Field label="Téléphone professionnel"><Input name="workPhone" /></Field>
        <Field label="Membre actif déjà présent"><NativeSelect name="organizationMemberId" items={[{ id: "", label: "Aucun — fiche manuelle ou invitation" }, ...lookups.members.map((member) => ({ id: member.membershipId, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field>
        <Field label="Type de relation"><NativeSelect name="employmentType" defaultValue="EMPLOYEE" items={[{ id: "EMPLOYEE", label: "Employé" }, { id: "CONTRACTOR", label: "Collaborateur / prestataire" }, { id: "INTERN", label: "Stagiaire" }, { id: "TEMPORARY", label: "Temporaire" }]} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title="Affectation">
        <Field label="Poste"><NativeSelect name="positionId" items={[{ id: "", label: "Poste à définir" }, ...lookups.positions.map((position) => ({ id: position.id, label: position.labelFr || position.positionCode || "Poste" }))]} /></Field>
        <Field label="Département"><NativeSelect name="departmentId" items={[{ id: "", label: "Aucun" }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr || department.id }))]} /></Field>
        <Field label="Responsable hiérarchique"><NativeSelect name="managerEmployeeId" items={[{ id: "", label: "Aucun" }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.displayName || employee.id} · ${employee.employeeNumber || ""}` }))]} /></Field>
        <Field label="Site"><NativeSelect name="siteId" items={[{ id: "", label: "Aucun" }, ...lookups.sites.map((site) => ({ id: site.id, label: site.name || site.code || site.id }))]} /></Field>
        <Field label="Date d’entrée"><Input name="hireDate" type="date" required /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title="Base de rémunération" description="Ces données restent dans le dossier RH de l’entreprise et ne sont jamais synchronisées silencieusement vers le compte global.">
        <Field label="Rémunération de base"><Input name="baseCompensation" type="number" min="0" step="0.01" /></Field><Field label="Devise"><Input name="compensationCurrency" defaultValue="USD" maxLength={3} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title="Relation avec le compte DTSC"><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} helper="La rémunération, les documents RH, les données médicales et les performances ne sont jamais copiés dans le compte global." /></div></ProfessionalFormSection>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit">Enregistrer le dossier</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || "Dossier RH"} className="h-[92dvh] max-w-3xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{detail.employeeNumber}</StatusBadge><StatusBadge tone={detail.employmentStatus === "ACTIVE" ? "success" : "neutral"}>{detail.employmentStatus}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{IDENTITY_LABELS[detail.identityLink.status] || detail.identityLink.status}</StatusBadge> : <StatusBadge>Compte non lié</StatusBadge>}</div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">Coordonnées de travail</dt><dd className="mt-1 text-sm">{detail.workEmail || detail.workPhone || "À compléter"}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Entrée</dt><dd className="mt-1 text-sm">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(detail.hireDate))}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Affectation</dt><dd className="mt-1 text-sm">{detail.positionCode || "Poste à compléter"}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Contrat</dt><dd className="mt-1 text-sm">{detail.contracts[0]?.reference || "Aucun contrat actif"}</dd></div></dl><ModuleSection title="Protection de la vie privée" description="La fiche RH reste l’autorité pour les données d’emploi. La liaison DTSC ne fournit que les accès autorisés tant qu’elle reste active.">{detail.identityLink ? <p className="text-sm text-dtsc-muted">État : {IDENTITY_LABELS[detail.identityLink.status] || detail.identityLink.status}. Une révocation ne supprime pas le dossier.</p> : <EmptyState compact title="Aucune relation DTSC" description="Le dossier RH est pleinement utilisable sans compte global." />}</ModuleSection></div> : null}</Dialog>
  </ModuleWorkspace>;
}
