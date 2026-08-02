"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, FileText, Plus, UsersRound, XCircle } from "lucide-react";
import { EnterpriseEmployeesIdentityWorkspace } from "@/components/enterprise/professional/enterprise-employees-identity-workspace";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
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
type Department = { id: string; departmentCode: string; labelFr: string };
type Site = { id: string; code: string; name: string };
type Lookups = { employees: Employee[]; members: Member[]; departments: Department[]; sites: Site[] };
type EmploymentContract = { id: string; reference: string; employeeId: string; contractType: string; status: string; versionNumber: number; startDate: string; endDate: string | null; probationEndDate: string | null; jobTitle: string | null; departmentId: string | null; siteId: string | null; baseCompensation: string | number; compensationCurrency: string; payFrequency: string; standardHoursPerWeek: string | number | null; terms: string | null; revision: number; employee: { id: string; employeeNumber: string; displayName: string; employmentStatus: string } };

const STATUS_LABELS: Record<string, string> = { DRAFT: "Brouillon", PENDING_APPROVAL: "En attente de validation", APPROVED: "Approuvé", ACTIVE: "Actif", REJECTED: "Rejeté", SUSPENDED: "Suspendu", ENDED: "Terminé", CANCELLED: "Annulé" };
function statusTone(status: string) { if (["ACTIVE", "APPROVED"].includes(status)) return "success" as const; if (["PENDING_APPROVAL", "SUSPENDED"].includes(status)) return "warning" as const; if (["REJECTED", "ENDED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }
function money(value: string | number, currency: string) { try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value)); } catch { return `${Number(value).toFixed(2)} ${currency}`; } }

export function EnterpriseHumanResourcesWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
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
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || "Les sélecteurs RH sont indisponibles."); if (active) setLookups({ employees: body.employees || [], members: body.members || [], departments: body.departments || [], sites: body.sites || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Les sélecteurs RH sont indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (status) value.set("status", status); return value; }, [page, status]);
  const contracts = useProfessionalCollection<EmploymentContract>({ endpoint: `/api/enterprise/${organizationId}/employment-contracts`, params, refreshKey });

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/employment-contracts`, { employeeId: String(form.get("employeeId") || ""), contractType: String(form.get("contractType") || "EMPLOYMENT"), startDate: String(form.get("startDate") || ""), endDate: String(form.get("endDate") || "") || null, probationEndDate: String(form.get("probationEndDate") || "") || null, jobTitle: String(form.get("jobTitle") || "") || null, departmentId: String(form.get("departmentId") || "") || null, siteId: String(form.get("siteId") || "") || null, baseCompensation: Number(form.get("baseCompensation") || 0), compensationCurrency: String(form.get("compensationCurrency") || "USD"), payFrequency: String(form.get("payFrequency") || "MONTHLY"), standardHoursPerWeek: String(form.get("standardHoursPerWeek") || "") ? Number(form.get("standardHoursPerWeek")) : null, terms: String(form.get("terms") || "") || null, approverUserId: String(form.get("approverUserId") || "") }); setCreateOpen(false); setRefreshKey((value) => value + 1); setMessage("Le contrat a été soumis à validation indépendante."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le contrat n’a pas pu être créé."); }
  }

  async function decide(contract: EmploymentContract, decision: "APPROVE" | "REJECT") {
    const comment = decision === "REJECT" ? window.prompt("Motif du rejet") || "Contrat rejeté" : "Contrat contrôlé";
    try { await professionalMutation(`/api/enterprise/${organizationId}/employment-contracts/${contract.id}/decision`, { decision, revision: contract.revision, comment }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? "Le contrat a été approuvé." : "Le contrat a été rejeté."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée."); }
  }

  function actionsFor(contract: EmploymentContract): BusinessContextAction[] { return [{ id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setDetail(contract) }, ...(contract.status === "PENDING_APPROVAL" ? [{ id: "approve", label: "Approuver", icon: CheckCircle2, onSelect: () => void decide(contract, "APPROVE") }, { id: "reject", label: "Rejeter", icon: XCircle, destructive: true, onSelect: () => void decide(contract, "REJECT") }] : [])]; }

  const departments = lookups.departments.map((department) => ({ department, employees: lookups.employees.filter((employee) => employee.departmentId === department.id) }));
  const unassignedEmployees = lookups.employees.filter((employee) => !employee.departmentId);

  return <div className="grid gap-8">
    <EnterpriseEmployeesIdentityWorkspace organizationId={organizationId} organizationName={organizationName} definition={definition} />
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`Contrats et structure RH · ${organizationName}`} title="Contrats de travail et organigramme" description="La rémunération, les documents RH et l’historique de paie restent limités aux permissions sensibles. Un manager ne devient pas administrateur RH." count={`${contracts.pagination.total} contrat${contracts.pagination.total > 1 ? "s" : ""}`} primaryAction={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Nouveau contrat</Button>} />
      <ModuleMetrics label="Indicateurs contrats RH"><ModuleMetric label="Contrats actifs" value={contracts.metrics.active || 0} /><ModuleMetric label="À valider" value={contracts.metrics.pendingApproval || 0} /><ModuleMetric label="Collaborateurs actifs" value={lookups.employees.length} /><ModuleMetric label="Départements" value={lookups.departments.length} /></ModuleMetrics>
      <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={setTab} items={[{ id: "CONTRACTS", label: "Contrats", count: contracts.pagination.total }, { id: "ORG", label: "Organigramme", count: lookups.employees.length }]} />{tab === "CONTRACTS" ? <NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: "Tous les statuts" }, ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /> : null}</>} summary="La fiche collaborateur peut exister sans compte DTSC ; la liaison reste volontaire et révocable." />
      <ModuleContent>
        {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
        {tab === "CONTRACTS" ? <ModuleSection title="Contrats de travail" description="Type, période, poste, département, rémunération autorisée, temps standard et validation.">{contracts.error ? <ProfessionalError message={contracts.error} /> : contracts.loading ? <ProfessionalLoading /> : contracts.items.length ? <BusinessList ariaLabel="Contrats de travail">{contracts.items.map((contract) => <BusinessListItem key={contract.id} title={`${contract.reference} · ${contract.employee.displayName}`} leading={<FileText className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(contract.status)}>{STATUS_LABELS[contract.status] || contract.status}</StatusBadge>} meta={`${contract.contractType} · ${money(contract.baseCompensation, contract.compensationCurrency)} · ${contract.payFrequency}`} description={`Version ${contract.versionNumber} · du ${new Date(contract.startDate).toLocaleDateString("fr-FR")}${contract.endDate ? ` au ${new Date(contract.endDate).toLocaleDateString("fr-FR")}` : " sans date de fin"}`} onOpen={() => setDetail(contract)} actions={<ContextActions label="Actions du contrat" actions={actionsFor(contract)} />} />)}</BusinessList> : <EmptyState compact title="Aucun contrat" description="Créez un contrat pour un collaborateur déjà enregistré dans l’entreprise." />}</ModuleSection> : <ModuleSection title="Organigramme mobile" description="Une vue structurée par département, lisible sans tableau débordant."><div className="grid gap-4 md:grid-cols-2">{departments.map(({ department, employees }) => <section key={department.id} className="rounded-2xl border border-dtsc-border p-4"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-dtsc-blue" /><h3 className="font-black text-dtsc-ink">{department.labelFr}</h3></div><div className="mt-3 grid gap-2">{employees.length ? employees.map((employee) => <div key={employee.id} className="rounded-xl bg-dtsc-page px-3 py-2 text-sm"><p className="font-black">{employee.displayName}</p><p className="text-dtsc-muted">{employee.employeeNumber}</p></div>) : <p className="text-sm text-dtsc-muted">Aucun collaborateur actif.</p>}</div></section>)}{unassignedEmployees.length ? <section className="rounded-2xl border border-dashed border-dtsc-border p-4"><h3 className="font-black">Sans département</h3><div className="mt-3 grid gap-2">{unassignedEmployees.map((employee) => <div key={employee.id} className="rounded-xl bg-dtsc-page px-3 py-2 text-sm">{employee.employeeNumber} · {employee.displayName}</div>)}</div></section> : null}</div></ModuleSection>}
        <ProfessionalHelp moduleCode="HUMAN_RESOURCES" />
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau contrat de travail" className="h-[96dvh] max-w-5xl"><form onSubmit={createContract} className="grid gap-5"><ProfessionalFormSection title="Collaborateur et emploi"><Field label="Collaborateur"><NativeSelect name="employeeId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.employees.map((employee) => ({ id: employee.id, label: `${employee.employeeNumber} · ${employee.displayName}` }))]} /></Field><Field label="Type de contrat"><NativeSelect name="contractType" defaultValue="EMPLOYMENT" items={[{ id: "EMPLOYMENT", label: "Contrat de travail" }, { id: "FIXED_TERM", label: "Durée déterminée" }, { id: "INDEFINITE", label: "Durée indéterminée" }, { id: "CONSULTING", label: "Consultance" }, { id: "INTERNSHIP", label: "Stage" }]} /></Field><Field label="Poste"><Input name="jobTitle" /></Field><Field label="Département"><NativeSelect name="departmentId" items={[{ id: "", label: "Non renseigné" }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field><Field label="Site"><NativeSelect name="siteId" items={[{ id: "", label: "Non renseigné" }, ...lookups.sites.map((site) => ({ id: site.id, label: `${site.code} · ${site.name}` }))]} /></Field><Field label="Approbateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner une autre personne" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field></ProfessionalFormSection><ProfessionalFormSection title="Période et rémunération"><Field label="Date de début"><Input name="startDate" type="date" required /></Field><Field label="Date de fin"><Input name="endDate" type="date" /></Field><Field label="Fin de période d’essai"><Input name="probationEndDate" type="date" /></Field><Field label="Rémunération de base"><Input name="baseCompensation" type="number" min="0" step="0.01" required /></Field><Field label="Devise"><Input name="compensationCurrency" defaultValue="USD" maxLength={3} required /></Field><Field label="Fréquence"><NativeSelect name="payFrequency" defaultValue="MONTHLY" items={[{ id: "MONTHLY", label: "Mensuelle" }, { id: "BIWEEKLY", label: "Bimensuelle" }, { id: "WEEKLY", label: "Hebdomadaire" }, { id: "DAILY", label: "Journalière" }, { id: "HOURLY", label: "Horaire" }]} /></Field><Field label="Heures standard / semaine"><Input name="standardHoursPerWeek" type="number" min="1" max="168" step="0.5" /></Field><Field label="Conditions"><textarea name="terms" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit">Soumettre le contrat</Button></div></form></Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.employee.displayName}` : "Détail du contrat"} className="h-[90dvh] max-w-4xl">{detail ? <div className="grid gap-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{STATUS_LABELS[detail.status] || detail.status}</StatusBadge><StatusBadge>{money(detail.baseCompensation, detail.compensationCurrency)}</StatusBadge></div><div className="grid gap-3 text-sm leading-6 md:grid-cols-2"><p><strong>Type :</strong> {detail.contractType}</p><p><strong>Poste :</strong> {detail.jobTitle || "Non renseigné"}</p><p><strong>Début :</strong> {new Date(detail.startDate).toLocaleDateString("fr-FR")}</p><p><strong>Fin :</strong> {detail.endDate ? new Date(detail.endDate).toLocaleDateString("fr-FR") : "Non définie"}</p><p><strong>Régime :</strong> {detail.payFrequency}</p><p><strong>Temps standard :</strong> {detail.standardHoursPerWeek || "—"} h/semaine</p></div><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}</Dialog>
    </ModuleWorkspace>
  </div>;
}
