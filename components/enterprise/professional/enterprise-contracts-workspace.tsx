"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, Eye, FileCheck2, PauseCircle, Pencil, Plus, RefreshCcw, RotateCcw, Send, XCircle } from "lucide-react";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalWorkflowComments } from "@/components/enterprise/professional/professional-workflow-comments";
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
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Party = { id: string; code: string; legalName: string; displayName: string | null; partyType: string; roles: Array<{ roleCode: string }> };
type Member = { id: string; label: string; email: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; labelEn: string; departmentCode: string };
type Lookups = { members: Member[]; departments: Department[]; parties: Party[] };
type Approval = { id: string; status: string; approverUserId: string; requestedByUserId: string; requestedAt: string; decidedAt: string | null; decisionComment: string | null };
type ContractCapabilities = { isRequester: boolean; isApprover: boolean; canEdit: boolean; canSubmit: boolean; canDecide: boolean; canOperate: boolean; canComment: boolean };
type Contract = {
  id: string;
  reference: string;
  businessPartyId: string;
  businessParty: { id: string; code: string; legalName: string; displayName: string | null } | null;
  opportunityId: string | null;
  quoteId: string | null;
  contractType: string;
  title: string;
  description: string | null;
  status: string;
  ownerUserId: string | null;
  departmentId: string | null;
  startDate: string | null;
  endDate: string | null;
  indicativeAmount: string | number | null;
  currency: string | null;
  renewalMode: string | null;
  renewalNoticeDays: number | null;
  terms: string | null;
  approvedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  revision: number;
  approval: Approval | null;
  capabilities: ContractCapabilities;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_APPROVAL: "En attente de validation",
  APPROVED: "Validé",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  EXPIRED: "Expiré",
  TERMINATED: "Résilié",
  CANCELLED: "Annulé",
};
const APPROVAL_STATUS_LABELS: Record<string, string> = { PENDING: "En attente", APPROVED: "Approuvé", RETURNED: "Correction demandée", REJECTED: "Refusé" };
const CONTRACT_TYPES = [
  { id: "SERVICE", label: "Contrat de prestation" },
  { id: "SALE", label: "Contrat commercial" },
  { id: "PARTNERSHIP", label: "Convention de partenariat" },
  { id: "SUPPLY", label: "Contrat de fourniture" },
  { id: "CONSULTING", label: "Contrat de consultance" },
  { id: "OTHER", label: "Autre contrat" },
];

function statusTone(status: string) {
  if (["ACTIVE", "APPROVED"].includes(status)) return "success" as const;
  if (["PENDING_APPROVAL", "SUSPENDED"].includes(status)) return "warning" as const;
  if (["TERMINATED", "EXPIRED", "CANCELLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}
function money(value: Contract["indicativeAmount"], currency?: string | null) {
  if (value === null || value === undefined || value === "") return "Montant non défini";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(value));
}
function dateLabel(value?: string | null) {
  if (!value) return "Non définie";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export function EnterpriseContractsWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], parties: [] });
  const [lookupsError, setLookupsError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<Contract | null>(null);
  const [edit, setEdit] = useState<Contract | null>(null);
  const [actionTarget, setActionTarget] = useState<{ contract: Contract; action: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CONTRACTS`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || "Sélecteurs indisponibles.");
        if (active) setLookups(body);
      })
      .catch((error) => { if (active) setLookupsError(error instanceof Error ? error.message : "Sélecteurs indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search.trim()) value.set("search", search.trim());
    if (tab !== "ALL") value.set("status", tab);
    return value;
  }, [page, search, tab]);
  const collection = useProfessionalCollection<Contract>({ endpoint: `/api/enterprise/${organizationId}/contracts`, params, refreshKey });
  useEffect(() => {
    const contractId = searchParams.get("contract");
    if (!contractId) return;
    const target = collection.items.find((item) => item.id === contractId);
    if (target) setDetail(target);
  }, [collection.items, searchParams]);

  function contractPayload(form: FormData) {
    return {
      businessPartyId: String(form.get("businessPartyId") || ""),
      contractType: String(form.get("contractType") || "SERVICE"),
      title: String(form.get("title") || ""),
      description: String(form.get("description") || "") || null,
      ownerUserId: String(form.get("ownerUserId") || "") || null,
      departmentId: String(form.get("departmentId") || "") || null,
      startDate: String(form.get("startDate") || "") || null,
      endDate: String(form.get("endDate") || "") || null,
      indicativeAmount: String(form.get("indicativeAmount") || "") || null,
      currency: String(form.get("currency") || "") || null,
      renewalMode: String(form.get("renewalMode") || "NONE"),
      renewalNoticeDays: String(form.get("renewalNoticeDays") || "") || null,
      terms: String(form.get("terms") || "") || null,
      approverUserId: String(form.get("approverUserId") || "") || null,
    };
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, contractPayload(new FormData(event.currentTarget)));
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  async function updateContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts`, { contractId: edit.id, revision: edit.revision, ...contractPayload(new FormData(event.currentTarget)), approverUserId: undefined }, "PATCH");
      setEdit(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    }
  }

  async function transitionContract(contract: Contract, action: string, payload: Record<string, unknown> = {}) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/contracts/${contract.id}/transition`, { action, revision: contract.revision, ...payload });
      setActionTarget(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action contractuelle impossible.");
    }
  }

  function availableActions(contract: Contract) {
    const actions: Array<{ id: string; label: string; icon: typeof Send }> = [];
    if (contract.status === "DRAFT" && contract.capabilities.canEdit) actions.push({ id: "EDIT", label: "Modifier", icon: Pencil });
    if (contract.status === "DRAFT" && contract.capabilities.canSubmit) actions.push({ id: "SUBMIT", label: "Soumettre", icon: Send });
    if (contract.status === "PENDING_APPROVAL" && contract.capabilities.canDecide) {
      actions.push(
        { id: "APPROVE", label: "Approuver", icon: CheckCircle2 },
        { id: "REQUEST_CORRECTION", label: "Demander une correction", icon: RotateCcw },
        { id: "REJECT", label: "Refuser", icon: XCircle },
      );
    }
    if (!contract.capabilities.canOperate) return actions;
    if (contract.status === "APPROVED") actions.push({ id: "ACTIVATE", label: "Activer", icon: CheckCircle2 });
    if (contract.status === "ACTIVE") actions.push({ id: "SUSPEND", label: "Suspendre", icon: PauseCircle }, { id: "TERMINATE", label: "Résilier", icon: XCircle });
    if (contract.status === "SUSPENDED") actions.push({ id: "ACTIVATE", label: "Réactiver", icon: CheckCircle2 }, { id: "RENEW", label: "Renouveler", icon: RefreshCcw }, { id: "TERMINATE", label: "Résilier", icon: XCircle });
    if (contract.status === "EXPIRED") actions.push({ id: "RENEW", label: "Renouveler", icon: RefreshCcw }, { id: "ARCHIVE", label: "Archiver", icon: Archive });
    if (["TERMINATED", "CANCELLED"].includes(contract.status)) actions.push({ id: "ARCHIVE", label: "Archiver", icon: Archive });
    return actions;
  }

  const tabs = [
    { id: "ALL", label: "Tous", count: collection.pagination.total },
    { id: "DRAFT", label: "Brouillons", count: collection.metrics.draft },
    { id: "PENDING_APPROVAL", label: "À valider", count: collection.metrics.pendingApproval },
    { id: "ACTIVE", label: "Actifs", count: collection.metrics.active },
    { id: "SUSPENDED", label: "Suspendus", count: collection.metrics.suspended },
    { id: "EXPIRED", label: "Expirés", count: collection.metrics.expired },
    { id: "TERMINATED", label: "Résiliés", count: collection.metrics.terminated },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader eyebrow={`Cycle contractuel · ${organizationName}`} title="Contrats commerciaux" description={definition.descriptionFr} count={`${collection.pagination.total} contrat${collection.pagination.total > 1 ? "s" : ""}`} primaryAction={collection.canWrite ? <Button onClick={() => { setMessage(""); setCreateOpen(true); }} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouveau contrat</Button> : undefined} />
      <ModuleMetrics label="Indicateurs contractuels">
        <ModuleMetric label="Brouillons" value={collection.metrics.draft || 0} />
        <ModuleMetric label="En attente de validation" value={collection.metrics.pendingApproval || 0} />
        <ModuleMetric label="Actifs" value={collection.metrics.active || 0} />
        <ModuleMetric label="À renouveler bientôt" value={collection.metrics.expiring || 0} />
        <ModuleMetric label="Résiliés" value={collection.metrics.terminated || 0} />
      </ModuleMetrics>
      <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Titre ou référence du contrat…" />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={tabs} label="États des contrats" />} summary={`${collection.pagination.total} résultat${collection.pagination.total > 1 ? "s" : ""}`} />
      <ModuleContent>
        {message ? <ProfessionalError message={message} /> : null}
        {lookupsError ? <ProfessionalError message={lookupsError} /> : null}
        <ModuleSection title="Portefeuille contractuel" description="Les transitions sont décidées et validées par le serveur. Le frontend ne modifie jamais directement un statut.">
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? <BusinessList ariaLabel="Contrats commerciaux">{collection.items.map((contract) => <BusinessListItem key={contract.id} title={contract.title} leading={<FileCheck2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(contract.status)}>{STATUS_LABELS[contract.status] || contract.status}</StatusBadge>} meta={`${contract.reference} · ${contract.contractType} · ${money(contract.indicativeAmount, contract.currency)}`} description={`${contract.businessParty?.displayName || contract.businessParty?.legalName || "Partie à vérifier"} · ${dateLabel(contract.startDate)} → ${dateLabel(contract.endDate)}`} onOpen={() => setDetail(contract)} openLabel={`Ouvrir ${contract.title}`} actions={<Button size="sm" variant="outline" onClick={() => setDetail(contract)}><Eye className="h-4 w-4" />Détail</Button>} />)}</BusinessList> : <EmptyState compact title="Aucun contrat" description="Sélectionnez un client, définissez la période et soumettez le premier contrat à validation." />}
        </ModuleSection>
        <ProfessionalHelp moduleCode="CONTRACTS" />
      </ModuleContent>

      <ContractFormDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau contrat" onSubmit={createContract} lookups={lookups} message={message} />
      <ContractFormDialog open={Boolean(edit)} onClose={() => setEdit(null)} title="Modifier le contrat" onSubmit={updateContract} lookups={lookups} message={message} contract={edit} hideApprover />

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || "Contrat"} className="h-[94dvh] max-w-4xl">
        {detail ? <div className="grid gap-6">
          {message ? <ProfessionalError message={message} /> : null}
          <div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detail.status)}>{STATUS_LABELS[detail.status] || detail.status}</StatusBadge><StatusBadge>{detail.reference}</StatusBadge><StatusBadge>{detail.contractType}</StatusBadge>{detail.capabilities.isApprover ? <StatusBadge tone="warning">Votre décision est requise</StatusBadge> : null}</div>
          <dl className="grid gap-4 border-y border-dtsc-border py-5 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Partie</dt><dd className="mt-1 text-sm text-dtsc-ink">{detail.businessParty?.displayName || detail.businessParty?.legalName}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Période</dt><dd className="mt-1 text-sm text-dtsc-ink">{dateLabel(detail.startDate)} → {dateLabel(detail.endDate)}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Valeur indicative</dt><dd className="mt-1 text-sm text-dtsc-ink">{money(detail.indicativeAmount, detail.currency)}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Renouvellement</dt><dd className="mt-1 text-sm text-dtsc-ink">{detail.renewalMode === "AUTOMATIC" ? "Automatique" : detail.renewalMode === "MANUAL" ? "Manuel" : "Aucun"}{detail.renewalNoticeDays !== null ? ` · préavis ${detail.renewalNoticeDays} jours` : ""}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Validation</dt><dd className="mt-1 text-sm text-dtsc-ink">{detail.approval ? APPROVAL_STATUS_LABELS[detail.approval.status] || detail.approval.status : "Non demandée"}{detail.approval?.decisionComment ? ` · ${detail.approval.decisionComment}` : ""}</dd></div>
            <div><dt className="text-xs font-black uppercase text-dtsc-muted">Révision</dt><dd className="mt-1 text-sm text-dtsc-ink">Version {detail.revision}</dd></div>
          </dl>
          {detail.description ? <section><h3 className="font-black text-dtsc-ink">Objet et résumé</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">{detail.description}</p></section> : null}
          {detail.terms ? <section><h3 className="font-black text-dtsc-ink">Clauses ou conditions</h3><p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap border-y border-dtsc-border py-3 text-sm leading-6 text-dtsc-muted">{detail.terms}</p></section> : null}
          {detail.terminationReason ? <ProfessionalError message={`Motif de résiliation : ${detail.terminationReason}`} /> : null}
          <section><h3 className="font-black text-dtsc-ink">Documents</h3><p className="mt-1 text-sm text-dtsc-muted">Téléversez les versions de travail, signées ou annexes dans Documents. Le contrat et sa référence sont préremplis.</p><Link className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dtsc-border px-4 text-sm font-black text-dtsc-blue" href={`/enterprise-modules/DOCUMENTS?sourceEntityType=EnterpriseContract&sourceEntityId=${encodeURIComponent(detail.id)}&sourceReference=${encodeURIComponent(detail.reference)}&action=upload`}>Téléverser ou ouvrir les documents liés</Link></section>
          {detail.capabilities.canComment ? <ProfessionalWorkflowComments endpoint={`/api/enterprise/${organizationId}/contracts/${detail.id}/comments`} /> : null}
          {availableActions(detail).length ? <section id="validation" className="sticky bottom-0 border-t border-dtsc-border bg-dtsc-surface py-3"><div className="flex flex-wrap justify-end gap-2">{availableActions(detail).map((action) => { const Icon = action.icon; return <Button key={action.id} variant={action.id === "TERMINATE" || action.id === "REJECT" ? "destructive" : "outline"} onClick={() => action.id === "EDIT" ? setEdit(detail) : ["ACTIVATE", "ARCHIVE"].includes(action.id) ? void transitionContract(detail, action.id) : setActionTarget({ contract: detail, action: action.id })}><Icon className="h-4 w-4" />{action.label}</Button>; })}</div></section> : null}
        </div> : null}
      </Dialog>

      <Dialog open={Boolean(actionTarget)} onClose={() => setActionTarget(null)} title={actionTarget ? actionTitle(actionTarget.action) : "Action contractuelle"} className="max-w-xl">
        {actionTarget ? <ActionForm target={actionTarget} members={lookups.members} onCancel={() => setActionTarget(null)} onSubmit={(payload) => void transitionContract(actionTarget.contract, actionTarget.action, payload)} /> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}

function actionTitle(action: string) {
  return ({ SUBMIT: "Soumettre à validation", APPROVE: "Approuver le contrat", REQUEST_CORRECTION: "Demander une correction", REJECT: "Refuser le contrat", SUSPEND: "Suspendre le contrat", RENEW: "Renouveler le contrat", TERMINATE: "Résilier le contrat" } as Record<string, string>)[action] || "Action contractuelle";
}

function ActionForm({ target, members, onCancel, onSubmit }: { target: { contract: Contract; action: string }; members: Member[]; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const needsReason = ["REQUEST_CORRECTION", "REJECT", "SUSPEND", "TERMINATE"].includes(target.action);
  return <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ approverUserId: String(form.get("approverUserId") || "") || null, reason: String(form.get("reason") || "") || null, renewedEndDate: String(form.get("renewedEndDate") || "") || null }); }} className="grid gap-4">
    {target.action === "SUBMIT" ? <Field label="Validateur"><NativeSelect name="approverUserId" required items={[{ id: "", label: "Sélectionner un validateur…" }, ...members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}
    {needsReason ? <Field label={target.action === "REQUEST_CORRECTION" ? "Corrections demandées" : "Motif de la décision"}><textarea name="reason" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" placeholder={target.action === "REQUEST_CORRECTION" ? "Décrivez précisément les éléments à corriger avant une nouvelle soumission." : "Expliquez la décision."} /></Field> : null}
    {target.action === "APPROVE" ? <Field label="Commentaire facultatif"><textarea name="reason" className="min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field> : null}
    {target.action === "RENEW" ? <Field label="Nouvelle date de fin"><Input name="renewedEndDate" type="date" required /></Field> : null}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuler</Button><Button type="submit" variant={target.action === "REJECT" || target.action === "TERMINATE" ? "destructive" : "default"}>Confirmer</Button></div>
  </form>;
}

function ContractFormDialog({ open, onClose, title, onSubmit, lookups, message, contract, hideApprover = false }: { open: boolean; onClose: () => void; title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; lookups: Lookups; message: string; contract?: Contract | null; hideApprover?: boolean }) {
  return <Dialog open={open} onClose={onClose} title={title} className="h-[94dvh] max-w-4xl">
    <form onSubmit={onSubmit} className="grid gap-6">
      {message ? <ProfessionalError message={message} /> : null}
      <ProfessionalFormSection title="Identification et parties">
        <Field label="Client, collaborateur, fournisseur ou partenaire"><NativeSelect name="businessPartyId" required defaultValue={contract?.businessPartyId || ""} items={[{ id: "", label: "Sélectionner une partie…" }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))]} /></Field>
        <Field label="Type de contrat"><NativeSelect name="contractType" defaultValue={contract?.contractType || "SERVICE"} items={CONTRACT_TYPES} /></Field>
        <Field label="Titre"><Input name="title" required defaultValue={contract?.title || ""} /></Field>
        <Field label="Responsable interne"><NativeSelect name="ownerUserId" defaultValue={contract?.ownerUserId || ""} items={[{ id: "", label: "Moi-même" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field>
        <Field label="Département"><NativeSelect name="departmentId" defaultValue={contract?.departmentId || ""} items={[{ id: "", label: "Aucun" }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field>
        {!hideApprover ? <Field label="Validateur initial"><NativeSelect name="approverUserId" items={[{ id: "", label: "Enregistrer en brouillon" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field> : null}
      </ProfessionalFormSection>
      <ProfessionalFormSection title="Période, valeur et renouvellement">
        <Field label="Date de début"><Input name="startDate" type="date" defaultValue={contract?.startDate?.slice(0, 10) || ""} /></Field><Field label="Date de fin"><Input name="endDate" type="date" defaultValue={contract?.endDate?.slice(0, 10) || ""} /></Field>
        <Field label="Montant indicatif"><Input name="indicativeAmount" type="number" min="0" step="0.01" defaultValue={contract?.indicativeAmount !== null && contract?.indicativeAmount !== undefined ? String(contract.indicativeAmount) : ""} /></Field><Field label="Devise"><Input name="currency" defaultValue={contract?.currency || "USD"} maxLength={3} /></Field>
        <Field label="Renouvellement"><NativeSelect name="renewalMode" defaultValue={contract?.renewalMode || "NONE"} items={[{ id: "NONE", label: "Aucun" }, { id: "MANUAL", label: "Manuel" }, { id: "AUTOMATIC", label: "Automatique" }]} /></Field><Field label="Délai de préavis (jours)"><Input name="renewalNoticeDays" type="number" min="0" max="3650" defaultValue={contract?.renewalNoticeDays ?? ""} /></Field>
      </ProfessionalFormSection>
      <ProfessionalFormSection title="Objet, résumé et clauses">
        <Field label="Objet / description"><textarea name="description" defaultValue={contract?.description || ""} className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field>
        <Field label="Clauses ou conditions"><textarea name="terms" defaultValue={contract?.terms || ""} className="min-h-40 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-base" /></Field>
      </ProfessionalFormSection>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Enregistrer</Button></div>
    </form>
  </Dialog>;
}
