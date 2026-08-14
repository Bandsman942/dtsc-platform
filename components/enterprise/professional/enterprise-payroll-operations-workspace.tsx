"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, Eye, FileText, Plus, Send, XCircle } from "lucide-react";
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
import { ProfessionalReportView } from "@/components/reports/professional-report-view";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
import { buildPayrollProfessionalReport } from "@/lib/reporting/payroll-professional-report";

type Employee = { id: string; employeeNumber: string; displayName: string };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type PayrollPeriodLookup = { id: string; code: string; name: string; status: string; periodStart: string; periodEnd: string; payDate: string | null };
type Lookups = { employees: Employee[]; members: Member[]; payrollPeriods: PayrollPeriodLookup[] };
type PayrollPeriod = PayrollPeriodLookup & { revision: number; _count: { payrollRuns: number } };
type PayrollItem = { id: string; employeeId: string; baseGrossAmount: string | number; approvedTimeMinutes: number | null; bonusAmount: string | number; bonusReason: string | null; deductionAmount: string | number; deductionReason: string | null; grossAmount: string | number; netAmount: string | number; status: string; employee: Employee; payslip: { id: string; payslipNumber: string; status: string; generatedAt: string | null; netAmount: string | number; currency: string } | null };
type PayrollRun = { id: string; payrollPeriodId: string; reference: string; status: string; currency: string; employeeCount: number; grossAmount: string | number; bonusAmount: string | number; deductionAmount: string | number; netAmount: string | number; preparedByUserId: string; submittedByUserId: string | null; approverUserId: string | null; revision: number; payrollPeriod: PayrollPeriodLookup; items: PayrollItem[] };

const STATUS_LABELS: Record<string, string> = { OPEN: "Ouverte", CLOSED: "Clôturée", PREPARED: "Préparée", PENDING_APPROVAL: "En attente d’approbation", APPROVED: "Approuvée", REJECTED: "Rejetée", CANCELLED: "Annulée", GENERATED: "Disponible" };
function statusTone(status: string) { if (["APPROVED", "GENERATED", "CLOSED"].includes(status)) return "success" as const; if (["PREPARED", "PENDING_APPROVAL", "OPEN"].includes(status)) return "warning" as const; if (["REJECTED", "CANCELLED"].includes(status)) return "danger" as const; return "neutral" as const; }
function money(value: string | number, currency: string) { try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value || 0)); } catch { return `${Number(value || 0).toFixed(2)} ${currency}`; } }
function minutesLabel(value: number | null) { if (!value) return "Aucun temps approuvé"; return `${Math.floor(value / 60)} h ${(value % 60).toString().padStart(2, "0")} approuvées`; }

export function EnterprisePayrollOperationsWorkspace({ organizationId, organizationName, organizationLogoUrl, locale, definition }: { organizationId: string; organizationName: string; organizationLogoUrl?: string | null; locale?: string | null; definition: EnterpriseModuleDefinition }) {
  const [tab, setTab] = useState("RUNS");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ employees: [], members: [], payrollPeriods: [] });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [detail, setDetail] = useState<PayrollRun | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/operational-lookups?module=PAYROLL_OPERATIONS`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as Lookups & { message?: string } | null; if (!response.ok || !body) throw new Error(body?.message || "Les données de préparation de paie sont indisponibles."); if (active) setLookups({ employees: body.employees || [], members: body.members || [], payrollPeriods: body.payrollPeriods || [] }); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Les données de préparation de paie sont indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "25" }); if (status) value.set("status", status); return value; }, [page, status]);
  const periods = useProfessionalCollection<PayrollPeriod>({ endpoint: `/api/enterprise/${organizationId}/payroll-periods`, params, refreshKey });
  const runs = useProfessionalCollection<PayrollRun>({ endpoint: `/api/enterprise/${organizationId}/payroll-runs`, params, refreshKey });
  const activeCollection = tab === "RUNS" ? runs : periods;
  const payrollReportModel = useMemo(() => detail ? buildPayrollProfessionalReport({ organizationName, locale, run: detail, previousRun: runs.items.find((run) => run.id !== detail.id && run.currency === detail.currency) || null }) : null, [detail, locale, organizationName, runs.items]);

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-periods`, { code: String(form.get("code") || ""), name: String(form.get("name") || ""), periodStart: String(form.get("periodStart") || ""), periodEnd: String(form.get("periodEnd") || ""), payDate: String(form.get("payDate") || "") || null }); setPeriodOpen(false); setTab("PERIODS"); setRefreshKey((value) => value + 1); setMessage("La période de paie est ouverte."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La période n’a pas pu être créée."); }
  }

  async function prepareRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs`, { payrollPeriodId: String(form.get("payrollPeriodId") || ""), currency: String(form.get("currency") || "USD"), employeeIds: selectedEmployees, adjustments: selectedEmployees.map((employeeId) => ({ employeeId, bonusAmount: Number(form.get(`bonus_${employeeId}`) || 0), bonusReason: String(form.get(`bonusReason_${employeeId}`) || "") || null, deductionAmount: Number(form.get(`deduction_${employeeId}`) || 0), deductionReason: String(form.get(`deductionReason_${employeeId}`) || "") || null })) }); setPrepareOpen(false); setSelectedEmployees([]); setTab("RUNS"); setRefreshKey((value) => value + 1); setMessage("La paie a été préparée sans créer de paiement financier."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La paie n’a pas pu être préparée."); }
  }

  async function submitRun(run: PayrollRun) {
    const approverUserId = window.prompt("Identifiant de l’approbateur sélectionné dans la liste des membres actifs");
    if (!approverUserId) return;
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${run.id}/submit`, { approverUserId, revision: run.revision }); setDetail(null); setRefreshKey((value) => value + 1); setMessage("La paie a été soumise à une autre personne pour approbation."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La paie n’a pas pu être soumise."); }
  }

  async function decide(run: PayrollRun, decision: "APPROVE" | "REJECT") {
    const comment = decision === "REJECT" ? window.prompt("Motif du rejet") || "Paie rejetée" : "Paie contrôlée";
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${run.id}/decision`, { decision, revision: run.revision, comment }); setDetail(null); setRefreshKey((value) => value + 1); setMessage(decision === "APPROVE" ? "La paie est approuvée et les bulletins privés ont été générés." : "La paie a été rejetée."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La décision n’a pas pu être enregistrée."); }
  }

  async function cancel(run: PayrollRun) {
    const reason = window.prompt("Motif d’annulation"); if (!reason || reason.trim().length < 3) return;
    try { await professionalMutation(`/api/enterprise/${organizationId}/payroll-runs/${run.id}/cancel`, { revision: run.revision, reason }); setDetail(null); setRefreshKey((value) => value + 1); setMessage("La paie a été annulée. Une nouvelle paie peut être préparée pour la même période."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "La paie n’a pas pu être annulée."); }
  }

  function actionsFor(run: PayrollRun): BusinessContextAction[] { return [{ id: "open", label: "Ouvrir", icon: Eye, onSelect: () => setDetail(run) }, ...(run.status === "PREPARED" ? [{ id: "submit", label: "Soumettre", icon: Send, onSelect: () => void submitRun(run) }, { id: "cancel", label: "Annuler", icon: Ban, destructive: true, onSelect: () => void cancel(run) }] : []), ...(run.status === "PENDING_APPROVAL" ? [{ id: "approve", label: "Approuver", icon: CheckCircle2, onSelect: () => void decide(run, "APPROVE") }, { id: "reject", label: "Rejeter", icon: XCircle, destructive: true, onSelect: () => void decide(run, "REJECT") }] : []), ...(run.status === "REJECTED" ? [{ id: "cancel", label: "Annuler définitivement", icon: Ban, destructive: true, onSelect: () => void cancel(run) }] : [])]; }

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={`Paie opérationnelle · ${organizationName}`} title="Préparation, contrôle et approbation de la paie" description={`${definition.descriptionFr} La paie approuvée ne crée jamais automatiquement un paiement financier.`} count={`${runs.pagination.total} traitement${runs.pagination.total > 1 ? "s" : ""}`} primaryAction={<div data-responsive-actions><Button variant="outline" onClick={() => setPeriodOpen(true)}><Plus className="h-4 w-4" />Nouvelle période</Button><Button onClick={() => setPrepareOpen(true)}><FileText className="h-4 w-4" />Préparer une paie</Button></div>} />
    <ModuleMetrics label="Indicateurs de paie"><ModuleMetric label="Périodes ouvertes" value={periods.metrics.open || 0} /><ModuleMetric label="À approuver" value={runs.metrics.pendingApproval || 0} /><ModuleMetric label="Paies approuvées" value={runs.metrics.approved || 0} /><ModuleMetric label="Population active" value={lookups.employees.length} /></ModuleMetrics>
    <ModuleToolbar controls={<><ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setStatus(""); setPage(1); }} items={[{ id: "RUNS", label: "Traitements de paie", count: runs.pagination.total }, { id: "PERIODS", label: "Périodes", count: periods.pagination.total }]} /><NativeSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={[{ id: "", label: "Tous les statuts" }, ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))]} /></>} summary="Préparateur, soumissionnaire et approbateur sont contrôlés côté serveur." />
    <ModuleContent>
      {message ? <div role="status" className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-semibold">{message}</div> : null}
      <ModuleSection title={tab === "RUNS" ? "Traitements de paie" : "Périodes de paie"} description={tab === "RUNS" ? "Contrats actifs, temps approuvé, variables, contrôles, soumission, approbation et bulletins." : "Une période ouverte peut être utilisée pour une paie active à la fois. Une paie annulée ne bloque pas sa recréation."}>
        {activeCollection.error ? <ProfessionalError message={activeCollection.error} /> : activeCollection.loading ? <ProfessionalLoading /> : tab === "RUNS" ? (runs.items.length ? <BusinessList ariaLabel="Traitements de paie">{runs.items.map((run) => <BusinessListItem key={run.id} title={`${run.reference} · ${run.payrollPeriod.name}`} status={<StatusBadge tone={statusTone(run.status)}>{STATUS_LABELS[run.status] || run.status}</StatusBadge>} meta={`${run.employeeCount} collaborateur${run.employeeCount > 1 ? "s" : ""} · ${money(run.netAmount, run.currency)} net`} description={`Brut ${money(run.grossAmount, run.currency)} · Primes ${money(run.bonusAmount, run.currency)} · Retenues ${money(run.deductionAmount, run.currency)}`} onOpen={() => setDetail(run)} actions={<ContextActions label="Actions de paie" actions={actionsFor(run)} />} />)}</BusinessList> : <EmptyState compact title="Aucune paie préparée" description="Ouvrez une période, vérifiez les contrats et temps approuvés, puis préparez la paie." />) : periods.items.length ? <BusinessList ariaLabel="Périodes de paie">{periods.items.map((period) => <BusinessListItem key={period.id} title={`${period.code} · ${period.name}`} status={<StatusBadge tone={statusTone(period.status)}>{STATUS_LABELS[period.status] || period.status}</StatusBadge>} meta={`${new Date(period.periodStart).toLocaleDateString("fr-FR")} – ${new Date(period.periodEnd).toLocaleDateString("fr-FR")}`} description={`${period._count.payrollRuns} traitement${period._count.payrollRuns > 1 ? "s" : ""}${period.payDate ? ` · Paiement prévu le ${new Date(period.payDate).toLocaleDateString("fr-FR")}` : ""}`} />)}</BusinessList> : <EmptyState compact title="Aucune période" description="Créez la première période avant de préparer une paie." />}
      </ModuleSection>
      <ProfessionalHelp moduleCode="PAYROLL_OPERATIONS" />
    </ModuleContent>

    <Dialog open={periodOpen} onClose={() => setPeriodOpen(false)} title="Nouvelle période de paie" className="h-[88dvh] max-w-3xl"><form onSubmit={createPeriod} className="grid gap-5"><ProfessionalFormSection title="Période"><Field label="Code"><Input name="code" placeholder="2026-08" required /></Field><Field label="Nom"><Input name="name" placeholder="Paie août 2026" required /></Field><Field label="Début"><Input name="periodStart" type="date" required /></Field><Field label="Fin"><Input name="periodEnd" type="date" required /></Field><Field label="Date de paiement prévue"><Input name="payDate" type="date" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setPeriodOpen(false)}>Annuler</Button><Button type="submit">Ouvrir la période</Button></div></form></Dialog>

    <Dialog open={prepareOpen} onClose={() => setPrepareOpen(false)} title="Assistant de préparation de paie" description="Sélectionnez la période et la population. Le serveur vérifiera contrats actifs, devise, temps approuvé, doublons et variables." className="h-[96dvh] max-w-5xl"><form onSubmit={prepareRun} className="grid gap-5"><ProfessionalFormSection title="1. Période et devise"><Field label="Période ouverte"><NativeSelect name="payrollPeriodId" required items={[{ id: "", label: "Sélectionner" }, ...lookups.payrollPeriods.filter((period) => period.status === "OPEN").map((period) => ({ id: period.id, label: `${period.code} · ${period.name}` }))]} /></Field><Field label="Devise"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field></ProfessionalFormSection><ProfessionalFormSection title="2. Population et variables" description="Chaque collaborateur doit posséder un contrat actif dans la même devise."><div className="md:col-span-2 grid gap-3">{lookups.employees.map((employee) => { const selected = selectedEmployees.includes(employee.id); return <div key={employee.id} className="grid gap-3 rounded-xl border border-dtsc-border p-3 md:grid-cols-5"><label className="md:col-span-2 flex min-h-11 items-center gap-3 font-black"><input type="checkbox" checked={selected} onChange={(event) => setSelectedEmployees((current) => event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id))} />{employee.employeeNumber} · {employee.displayName}</label><Field label="Prime"><Input name={`bonus_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" disabled={!selected} /></Field><Field label="Retenue"><Input name={`deduction_${employee.id}`} type="number" min="0" step="0.01" defaultValue="0" disabled={!selected} /></Field><Field label="Motif"><Input name={`bonusReason_${employee.id}`} disabled={!selected} placeholder="Prime ou retenue" /><input name={`deductionReason_${employee.id}`} type="hidden" value="Variable de paie" /></Field></div>; })}</div></ProfessionalFormSection><div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6">Contrôles serveur : contrat manquant ou inactif, devise incohérente, période déjà utilisée, doublon de collaborateur, retenue supérieure au brut et paie active existante.</div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setPrepareOpen(false)}>Annuler</Button><Button type="submit" disabled={selectedEmployees.length === 0}>Calculer et préparer</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.reference} · ${detail.payrollPeriod.name}` : "Détail de la paie"} className="h-[96dvh] max-w-6xl">{detail && payrollReportModel ? <div className="grid gap-5"><ProfessionalReportView model={payrollReportModel} locale={locale} logoUrl={organizationLogoUrl} /><section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><h3 className="font-black text-dtsc-ink">Bulletins et contrôles individuels</h3><div className="mt-3"><BusinessList ariaLabel="Collaborateurs de la paie">{detail.items.map((item) => <BusinessListItem key={item.id} title={`${item.employee.employeeNumber} · ${item.employee.displayName}`} status={<StatusBadge tone={item.payslip ? "success" : "neutral"}>{item.payslip ? `${item.payslip.payslipNumber} · ${STATUS_LABELS[item.payslip.status] || item.payslip.status}` : "Bulletin non généré"}</StatusBadge>} meta={`${money(item.netAmount, detail.currency)} net · ${minutesLabel(item.approvedTimeMinutes)}`} description={`Base ${money(item.baseGrossAmount, detail.currency)} · Prime ${money(item.bonusAmount, detail.currency)} · Retenue ${money(item.deductionAmount, detail.currency)}`} />)}</BusinessList></div></section><div data-responsive-actions>{actionsFor(detail).filter((action) => action.id !== "open").map((action) => <Button key={action.id} type="button" variant={action.destructive ? "outline" : "default"} onClick={() => action.onSelect?.()}>{action.label}</Button>)}</div></div> : null}</Dialog>
  </ModuleWorkspace>;
}
