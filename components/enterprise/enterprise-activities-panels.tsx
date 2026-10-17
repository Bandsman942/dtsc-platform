"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { getBusinessActivityFields } from "@/lib/enterprise/enterprise-activity-form-contract";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { workCoordinationDeepLink } from "@/lib/standard-work-coordination/deep-links";
import { FileText, Send } from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import type {
  EnterpriseActivitiesOrganization,
  EnterpriseActivityBlockItem,
  EnterpriseActivityMemberItem,
  EnterpriseActivityRequestItem,
  EnterpriseActivitySectorRecordItem,
  EnterpriseActivityWorkflowItem,
} from "@/lib/enterprise/enterprise-activities-types";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type ActivityField = {
  name: string;
  label: string;
  placeholder: string;
  type?: "textarea" | "text" | "number" | "date" | "select";
  labelEn?: string;
  placeholderEn?: string;
  source?: "patients" | "labRequests" | "pharmacyItems" | "members" | "pharmacyProducts" | "pharmacyBatches" | "pharmacySuppliers" | "pharmacySales" | "pharmacyPrescriptions" | "pharmacyInventories" | "pharmacyCash" | "gamingStations" | "gamingBookings" | "gamingSessions" | "gamingCloses" | "businessParties";
  options?: string[];
  required?: boolean;
};

const defaultActivityFields: ActivityField[] = [
  { name: "validationType", label: "Type de validation", placeholder: "Validation administrative, médicale, facture...", required: true },
  { name: "relatedItem", label: "Élément lié", placeholder: "Référence ou contexte", required: false },
];

const healthActivityFields: Record<string, ActivityField[]> = {
  REQUEST_VALIDATION: defaultActivityFields,
  REPORT_PATIENT_INCIDENT: [
    { name: "patient", label: "Patient concerné", placeholder: "Sélectionner un patient", source: "patients" },
    { name: "service", label: "Service concerné", placeholder: "Consultation, soins infirmiers, laboratoire...", required: true },
    { name: "severity", label: "Criticité", placeholder: "Criticité", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
  ],
  REQUEST_COVERAGE: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "insurer", label: "Assureur", placeholder: "Nom de l'assureur ou organisme", required: true },
    { name: "benefit", label: "Prestation concernée", placeholder: "Consultation, laboratoire, acte médical...", required: true },
    { name: "estimatedAmount", label: "Montant estimé", placeholder: "Montant estimé", type: "number" },
  ],
  SUBMIT_MEDICAL_REPORT: [
    { name: "period", label: "Période", placeholder: "Semaine, mois ou plage concernée", required: true },
    { name: "service", label: "Service", placeholder: "Service médical concerné", required: true },
    { name: "difficulties", label: "Difficultés", placeholder: "Difficultés rencontrées", type: "textarea" },
    { name: "recommendations", label: "Recommandations", placeholder: "Actions recommandées", type: "textarea" },
  ],
  REQUEST_MEDICAL_OPINION: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "context", label: "Contexte", placeholder: "Contexte clinique synthétique", type: "textarea", required: true },
    { name: "question", label: "Question médicale", placeholder: "Avis attendu", type: "textarea", required: true },
  ],
  REPORT_LAB_ISSUE: [
    { name: "patient", label: "Patient concerné", placeholder: "Sélectionner un patient", source: "patients" },
    { name: "labRequest", label: "Demande labo", placeholder: "Sélectionner une demande labo", source: "labRequests" },
    { name: "severity", label: "Criticité", placeholder: "Criticité", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    { name: "problem", label: "Problème constaté", placeholder: "Retard, résultat, prélèvement...", type: "textarea", required: true },
  ],
  REPORT_PHARMACY_STOCKOUT: [
    { name: "product", label: "Produit concerné", placeholder: "Sélectionner un produit", source: "pharmacyItems", required: true },
    { name: "quantity", label: "Quantité restante", placeholder: "Quantité disponible" },
    { name: "urgency", label: "Urgence", placeholder: "Urgence", type: "select", options: ["LOW", "NORMAL", "HIGH", "CRITICAL"] },
  ],
  SUBMIT_PATIENT_DOCUMENT: [
    { name: "patient", label: "Patient", placeholder: "Sélectionner un patient", source: "patients", required: true },
    { name: "documentType", label: "Type document", placeholder: "Type document", type: "select", options: ["Ordonnance", "Certificat", "Résultat", "Facture", "Assurance", "Autre"], required: true },
    { name: "reason", label: "Contexte du dépôt", placeholder: "Pourquoi ce document doit être traité", type: "textarea" },
  ],
};

const pharmacyActivityFields: Record<string, ActivityField[]> = {
  REPORT_LOW_STOCK: [
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts", required: true },
    { name: "batch", label: "Lot", placeholder: "Sélectionner un lot", source: "pharmacyBatches" },
    { name: "remainingQuantity", label: "Quantité restante", placeholder: "Quantité restante", type: "number", required: true },
    { name: "urgency", label: "Urgence", placeholder: "Urgence", type: "select", options: ["LOW", "NORMAL", "HIGH", "CRITICAL"], required: true },
  ],
  REQUEST_REPLENISHMENT: [
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts", required: true },
    { name: "quantity", label: "Quantité demandée", placeholder: "Quantité demandée", type: "number", required: true },
    { name: "supplier", label: "Fournisseur suggéré", placeholder: "Sélectionner un fournisseur", source: "pharmacySuppliers" },
    { name: "desiredDate", label: "Date souhaitée", placeholder: "Date souhaitée", required: true },
  ],
  DECLARE_NEAR_EXPIRY: [
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts", required: true },
    { name: "batch", label: "Lot", placeholder: "Sélectionner un lot", source: "pharmacyBatches", required: true },
    { name: "quantity", label: "Quantité concernée", placeholder: "Quantité concernée", type: "number", required: true },
    { name: "proposedAction", label: "Action proposée", placeholder: "Retour, promotion contrôlée, quarantaine...", type: "textarea", required: true },
  ],
  REQUEST_PURCHASE_VALIDATION: [
    { name: "supplier", label: "Fournisseur", placeholder: "Sélectionner un fournisseur", source: "pharmacySuppliers", required: true },
    { name: "products", label: "Produits demandés", placeholder: "Produits et quantités", type: "textarea", required: true },
    { name: "estimatedAmount", label: "Montant estimé", placeholder: "Montant estimé", type: "number", required: true },
  ],
  REQUEST_STOCK_ADJUSTMENT_VALIDATION: [
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts", required: true },
    { name: "batch", label: "Lot", placeholder: "Sélectionner un lot", source: "pharmacyBatches", required: true },
    { name: "adjustmentType", label: "Type ajustement", placeholder: "Perte, casse, inventaire...", required: true },
    { name: "quantity", label: "Quantité", placeholder: "Quantité", type: "number", required: true },
  ],
  SUBMIT_CASH_REPORT: [
    { name: "period", label: "Période", placeholder: "Période concernée", required: true },
    { name: "cashSession", label: "Caisse concernée", placeholder: "Sélectionner une caisse", source: "pharmacyCash" },
    { name: "declaredAmount", label: "Montant déclaré", placeholder: "Montant déclaré", type: "number", required: true },
    { name: "variance", label: "Écart éventuel", placeholder: "Écart éventuel", type: "number" },
  ],
  REPORT_SALE_ANOMALY: [
    { name: "sale", label: "Vente liée", placeholder: "Sélectionner une vente", source: "pharmacySales" },
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts" },
    { name: "anomalyType", label: "Type anomalie", placeholder: "Type anomalie", required: true },
    { name: "criticity", label: "Criticité", placeholder: "Criticité", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
  ],
  REPORT_QUALITY_INCIDENT: [
    { name: "incidentType", label: "Type incident", placeholder: "Qualité, effet indésirable, conservation...", required: true },
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts" },
    { name: "batch", label: "Lot", placeholder: "Sélectionner un lot", source: "pharmacyBatches" },
    { name: "immediateAction", label: "Action immédiate", placeholder: "Action immédiate réalisée", type: "textarea", required: true },
  ],
  REQUEST_PHARMACIST_OPINION: [
    { name: "product", label: "Produit", placeholder: "Sélectionner un produit", source: "pharmacyProducts" },
    { name: "prescription", label: "Ordonnance", placeholder: "Sélectionner une ordonnance", source: "pharmacyPrescriptions" },
    { name: "context", label: "Contexte", placeholder: "Contexte de dispensation", type: "textarea", required: true },
    { name: "question", label: "Question", placeholder: "Avis attendu", type: "textarea", required: true },
  ],
  SUBMIT_INVENTORY: [
    { name: "inventory", label: "Session inventaire", placeholder: "Sélectionner un inventaire", source: "pharmacyInventories", required: true },
    { name: "varianceSummary", label: "Écarts constatés", placeholder: "Résumé des écarts", type: "textarea", required: true },
  ],
};

function payloadText(record: EnterpriseActivitySectorRecordItem, key: string) {
  const value = record.payloadJson?.[key];
  return typeof value === "string" ? value : "";
}

function activityFields(blockCode: string, sectorCode: string | null, subtypeCode: string | null): ActivityField[] {
  if (sectorCode === "HEALTH_CARE") return healthActivityFields[blockCode] || defaultActivityFields;
  if (sectorCode === "PHARMACY") return pharmacyActivityFields[blockCode] || defaultActivityFields;
  return getBusinessActivityFields(sectorCode, subtypeCode, blockCode);
}

export function EnterpriseActivitiesDashboard({ organization }: { organization: EnterpriseActivitiesOrganization }) {
  return (
    <>
      <section className="dtsc-panel min-w-0 p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Activités entreprise</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-dtsc-ink sm:text-4xl">Activités {organization.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-dtsc-muted">
          Soumettez des demandes, rapports ou signalements liés à votre entreprise sans accéder aux sections sensibles d&apos;administration.
        </p>
      </section>
      <section className="dtsc-panel min-w-0 p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Périmètre actif</p>
        <span className="mt-3 inline-flex max-w-full rounded-full bg-cyan-400/14 px-3 py-1 text-xs font-black text-cyan-600">
          <span className="truncate">{organization.businessSector?.labelFr || organization.sector || "Socle commun"}</span>
        </span>
      </section>
    </>
  );
}

export function EnterpriseActivityBlocksPanel({ sectorCode, blocks, selectedBlockCode, selectedBlock, onSelectBlock, onOpenForm }: {
  sectorCode?: string | null;
  blocks: EnterpriseActivityBlockItem[];
  selectedBlockCode: string;
  selectedBlock: EnterpriseActivityBlockItem | null;
  onSelectBlock: (blockCode: string) => void;
  onOpenForm: () => void;
}) {
  const locale = useAppLocale();
  const english = locale === "en";
  return (
    <div className="w-full min-w-0 space-y-4">
      <div data-horizontal-rail tabIndex={0} aria-label={english ? "Business activity actions" : "Actions métier disponibles"} className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dtsc-blue">
        {blocks.map((item) => {
          const active = selectedBlockCode === item.blockCode;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectBlock(item.blockCode)}
              className={`w-[min(80vw,16rem)] min-w-0 shrink-0 snap-start rounded-xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-dtsc-blue ${active ? "border-cyan-400 bg-cyan-400/10 text-dtsc-ink" : "border-dtsc-border bg-dtsc-surface text-dtsc-ink hover:bg-dtsc-page"}`}
            >
              <span className="block break-words text-sm font-bold">{english ? item.labelEn : item.labelFr}</span>
              <span className="mt-1 block line-clamp-2 break-words text-xs text-dtsc-muted">{item.descriptionFr || (sectorCode === "HOSPITALITY_EVENTS" ? "Action sectorielle" : "Demande de service")}</span>
            </button>
          );
        })}
      </div>
      {!blocks.length ? <p role="status" className="rounded-xl border border-dtsc-border bg-dtsc-surface p-4 text-sm text-dtsc-muted">{english ? "No actions are available with your current permissions. Your existing requests remain accessible." : "Aucune action n’est disponible avec vos permissions actuelles. Vos demandes restent consultables."}</p> : null}
      {selectedBlock && <div className="flex min-w-0 flex-col gap-3 border-t border-dtsc-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="break-words font-semibold text-dtsc-ink">{english ? selectedBlock.labelEn : selectedBlock.labelFr}</p>
          <p className="mt-1 break-words text-sm text-dtsc-muted">{english ? "The business form is based on this action and its real organization references." : "Le formulaire est adapté à cette action et aux références réelles de l'entreprise."}</p>
        </div>
        <div data-responsive-actions className="shrink-0">
          <Button type="button" onClick={onOpenForm} className="rounded-xl bg-dtsc-blue text-white">
            <Send className="h-4 w-4" />{english ? "Open form" : "Ouvrir le formulaire"}
          </Button>
        </div>
      </div>}
    </div>
  );
}

function requestStage(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    DRAFT: ["Brouillon", "Draft"], SUBMITTED: ["Soumise", "Submitted"],
    ASSIGNED: ["Assignée", "Assigned"], IN_REVIEW: ["En validation", "Under review"],
    IN_PROGRESS: ["En cours", "In progress"], WAITING_REQUESTER: ["Information attendue", "Awaiting requester"],
    APPROVED: ["Approuvée", "Approved"], REJECTED: ["Refusée", "Rejected"],
    RESOLVED: ["Résolue", "Resolved"], FULFILLED: ["Traitée", "Fulfilled"],
    REOPENED: ["Rouverte", "Reopened"], CLOSED: ["Clôturée", "Closed"],
    COMPLETED: ["Terminée", "Completed"], CANCELLED: ["Annulée", "Cancelled"],
  };
  return labels[status]?.[english ? 1 : 0] || (english ? "Other state" : "Autre statut");
}

function workflowStage(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    QUEUED: ["En file d'attente", "Queued"], RUNNING: ["En cours", "Running"],
    WAITING_APPROVAL: ["Validation humaine attendue", "Awaiting human approval"],
    WAITING_TIME: ["En attente d'une échéance", "Waiting for time"],
    BLOCKED: ["Workflow bloqué — voir le diagnostic", "Workflow blocked — see diagnostics"],
    COMPLETED: ["Workflow terminé", "Workflow completed"],
    REJECTED: ["Workflow rejeté", "Workflow rejected"],
    FAILED: ["Workflow en erreur", "Workflow failed"],
    CANCELLED: ["Workflow annulé", "Workflow cancelled"],
  };
  return labels[status]?.[english ? 1 : 0] || (english ? "Unknown workflow state" : "État workflow inconnu");
}

export function EnterpriseWorkflowsPanel({ workflows }: { workflows: EnterpriseActivityWorkflowItem[] }) {
  const locale = useAppLocale();
  const english = locale === "en";
  return (
    <div className="min-w-0">
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {workflows.map((workflow) => (
          <article key={workflow.id} className="dtsc-glass-list-item min-w-0 rounded-2xl p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/14 text-cyan-600"><FileText className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{workflow.workflowCode}</p>
                <h3 className="mt-1 break-words font-black text-dtsc-ink">{english ? workflow.labelEn : workflow.labelFr}</h3>
                <p className="mt-1 break-words text-sm text-dtsc-muted">{workflow.descriptionFr || (english ? "Authorized workflow in your organization." : "Workflow autorisé dans votre entreprise.")}</p>
                {workflow.triggerEntityType === "EnterpriseRequest" && workflow.triggerEventType === "ENTERPRISE_REQUEST_SUBMITTED" ? (
                  <p className="mt-2 text-xs text-dtsc-muted">{english ? "Trigger: canonical internal request submission. Execution depends on active outbox processing." : "Déclencheur : soumission d'une demande interne canonique. L'exécution dépend du traitement actif des événements."}</p>
                ) : null}
                <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-dtsc-blue underline underline-offset-4" href="/enterprise-modules/WORKFLOWS">{english ? "Open Workflows" : "Ouvrir Workflows"}</Link>
              </div>
            </div>
          </article>
        ))}
        {!workflows.length && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">{english ? "No published, authorized workflow is visible for your company." : "Aucun workflow publié et autorisé n'est visible pour cette entreprise."}</p>}
      </div>
    </div>
  );
}

export function EnterpriseRequestsPanel({ requests, focusActivityId }: { requests: EnterpriseActivityRequestItem[]; focusActivityId?: string | null }) {
  const locale = useAppLocale();
  const english = locale === "en";
  const list = useSmartList({
    items: focusActivityId ? [...requests].sort((a, b) => Number(b.id === focusActivityId) - Number(a.id === focusActivityId)) : requests,
    pageSize: 8,
    getSearchText: (request) => `${request.title} ${request.description} ${request.workflowLink?.canonicalRequestStatus || request.status} ${request.priority} ${request.blockCode}`,
  });
  return (
    <div className="min-w-0">
      <ListControls
        query={list.query}
        onQueryChange={list.setQuery}
        page={list.page}
        pageCount={list.pageCount}
        totalCount={list.totalCount}
        filteredCount={list.filteredCount}
        placeholder={english ? "Search an activity…" : "Rechercher une activité..."}
        onPageChange={list.setPage}
      />
      <div className="mt-3 grid min-w-0 gap-3">
        {list.paginatedItems.map((request) => {
          const canonical = request.workflowLink;
          const status = canonical?.canonicalRequestStatus || request.status;
          return (
            <article key={request.id} id={`activity-${request.id}`} className={`dtsc-glass-list-item min-w-0 rounded-2xl p-4 ${request.id === focusActivityId ? "ring-2 ring-cyan-400" : ""}`}>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{(english ? request.block?.labelEn : request.block?.labelFr) || request.blockCode}</p>
                  <h3 className="mt-1 break-words font-black text-dtsc-ink">{request.title}</h3>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-dtsc-muted">{request.description}</p>
                </div>
                <span className="max-w-full rounded-full border border-dtsc-border bg-dtsc-page px-3 py-1 text-xs font-bold text-dtsc-ink">{requestStage(status, english)}</span>
              </div>
              {canonical?.workflowState ? (
                <div className="mt-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted">
                  <p className="font-semibold text-dtsc-ink">{english ? "Internal-request workflow" : "Workflow de demande interne"}</p>
                  <p className="mt-1 break-words">
                    {canonical.workflowState === "STARTED" && canonical.workflowRunStatus ? workflowStage(canonical.workflowRunStatus, english)
                      : canonical.workflowState === "NOT_CONFIGURED" ? (english ? "No active published internal-request workflow. Request tracking remains available." : "Aucun workflow de demande interne actif et publié. Le suivi de la demande reste accessible.")
                      : canonical.workflowState === "LIMITED_ACCESS" ? (english ? "Workflow execution is not accessible with your current permissions. Follow the canonical request status." : "Le suivi détaillé du workflow exige des permissions supplémentaires. Consultez le statut de votre demande interne.")
                      : (english ? "No workflow run recorded yet. This does not confirm that the event worker is active." : "Aucune exécution enregistrée pour le moment. Cela ne confirme pas que le traitement des événements est activé.")}
                  </p>
                </div>
              ) : null}
              <div className="mt-3 flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-sm">
                {canonical?.canonicalRequestId && canonical.canOpenRequest ? (
                  <Link href={workCoordinationDeepLink("REQUEST", canonical.canonicalRequestId)} className="min-h-11 inline-flex items-center font-semibold text-dtsc-blue underline underline-offset-4">{english ? "Open internal request" : "Ouvrir la demande interne"}</Link>
                ) : null}
                {canonical?.workflowRunId && canonical.canOpenWorkflow ? (
                  <Link href={workCoordinationDeepLink("WORKFLOW_RUN", canonical.workflowRunId)} className="min-h-11 inline-flex items-center font-semibold text-dtsc-blue underline underline-offset-4">{english ? "View workflow run" : "Voir l'exécution du workflow"}</Link>
                ) : null}
              </div>
            </article>
          );
        })}
        {!list.filteredCount && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">{english ? "No business request found." : "Aucune activité entreprise pour le moment."}</p>}
      </div>
    </div>
  );
}

export function EnterpriseHealthcareActivitiesPanel({ sectorRecords }: { sectorRecords: EnterpriseActivitySectorRecordItem[] }) {
  const healthMetrics = useMemo(
    () => [
      { label: "Patients", value: sectorRecords.filter((record) => record.moduleCode === "PATIENTS" && record.status !== "ARCHIVED").length },
      { label: "Rendez-vous", value: sectorRecords.filter((record) => record.moduleCode === "APPOINTMENTS" && record.status !== "ARCHIVED").length },
      { label: "Rendez-vous confirmés", value: sectorRecords.filter((record) => record.moduleCode === "APPOINTMENTS" && record.status === "CONFIRMED").length },
      { label: "Patients absents", value: sectorRecords.filter((record) => record.moduleCode === "APPOINTMENTS" && record.status === "NO_SHOW").length },
      { label: "Convertis en consultation", value: sectorRecords.filter((record) => record.moduleCode === "APPOINTMENTS" && record.status === "CONVERTED").length },
      { label: "Consultations", value: sectorRecords.filter((record) => record.moduleCode === "CONSULTATIONS" && record.status !== "ARCHIVED").length },
      { label: "Consultations en cours", value: sectorRecords.filter((record) => record.moduleCode === "CONSULTATIONS" && record.status === "IN_PROGRESS").length },
      { label: "Consultations à revoir", value: sectorRecords.filter((record) => record.moduleCode === "CONSULTATIONS" && record.status === "REVIEW").length },
      { label: "Laboratoire", value: sectorRecords.filter((record) => record.moduleCode === "LABORATORY" && record.status !== "ARCHIVED").length },
      { label: "Pharmacie", value: sectorRecords.filter((record) => record.moduleCode === "INTERNAL_PHARMACY" && record.status !== "ARCHIVED").length },
      { label: "Facturation", value: sectorRecords.filter((record) => record.moduleCode === "MEDICAL_BILLING" && record.status !== "ARCHIVED").length },
      { label: "Assurance", value: sectorRecords.filter((record) => record.moduleCode === "INSURANCE_COVERAGE" && record.status !== "ARCHIVED").length },
      { label: "Confidentialité", value: sectorRecords.filter((record) => record.moduleCode === "MEDICAL_CONFIDENTIALITY" && record.status !== "ARCHIVED").length },
      { label: "Rapports", value: sectorRecords.filter((record) => record.moduleCode === "HEALTH_REPORTS" && record.status !== "ARCHIVED").length },
    ],
    [sectorRecords],
  );

  if (!sectorRecords.length) {
    return null;
  }

  return (
    <AccordionItem title="Repères santé">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {healthMetrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">{metric.label}</p>
            <p className="mt-2 text-2xl font-black text-dtsc-ink">{metric.value}</p>
          </article>
        ))}
      </div>
    </AccordionItem>
  );
}

export function EnterprisePharmacyActivitiesPanel({ sectorRecords }: { sectorRecords: EnterpriseActivitySectorRecordItem[] }) {
  if (!sectorRecords.length) return null;
  const batches = sectorRecords.filter((record) => record.moduleCode === "BATCH_EXPIRY");
  const today = new Date().toISOString().slice(0, 10);
  const near = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const metrics = [
    ["Produits", sectorRecords.filter((record) => record.moduleCode === "MEDICINES_PRODUCTS").length],
    ["Lots actifs", batches.filter((record) => record.status === "ACTIVE").length],
    ["Ruptures", sectorRecords.filter((record) => record.status === "OUT_OF_STOCK" || record.status === "DEPLETED").length],
    ["Péremptions proches", batches.filter((record) => payloadText(record, "expiryDate") >= today && payloadText(record, "expiryDate") <= near).length],
    ["Ventes", sectorRecords.filter((record) => record.moduleCode === "SALES_DISPENSATION").length],
    ["Alertes ouvertes", sectorRecords.filter((record) => record.moduleCode === "ALERTS_EXPIRY_LOW_STOCK" && !["RESOLVED", "CLOSED"].includes(record.status)).length],
  ];
  return <AccordionItem title="Repères pharmacie"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <article key={label} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">{label}</p><p className="mt-2 text-2xl font-black text-dtsc-ink">{value}</p></article>)}</div></AccordionItem>;
}

export function EnterpriseActivityFormDialog({
  organization,
  selectedBlockCode,
  selectedBlock,
  open,
  onClose,
  members,
  departments,
  sectorRecords,
  gamingReferences,
  onMessage,
}: {
  organization: EnterpriseActivitiesOrganization;
  selectedBlockCode: string;
  selectedBlock: EnterpriseActivityBlockItem | null;
  open: boolean;
  onClose: () => void;
  members: EnterpriseActivityMemberItem[];
  departments: { value: string; labelFr: string; labelEn: string }[];
  sectorRecords: EnterpriseActivitySectorRecordItem[];
  gamingReferences: Partial<Record<"gamingStations" | "gamingBookings" | "gamingSessions" | "gamingCloses" | "businessParties", { value: string; label: string }[]>>;
  onMessage: (message: string, tone?: "success" | "error") => void;
}) {
  const router = useRouter();
  const locale = useAppLocale();
  const english = locale === "en";
  const [busy, setBusy] = useState(false);
  const selectedActivityFields = activityFields(selectedBlockCode, organization.sectorCode, organization.businessSubtypeCode);
  const patients = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "PATIENTS" && record.status !== "ARCHIVED"), [sectorRecords]);
  const labRequests = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "LABORATORY"), [sectorRecords]);
  const pharmacyItems = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "INTERNAL_PHARMACY"), [sectorRecords]);
  const pharmacyProducts = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "MEDICINES_PRODUCTS"), [sectorRecords]);
  const pharmacyBatches = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "BATCH_EXPIRY"), [sectorRecords]);
  const pharmacySuppliers = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "SUPPLIERS_ORDERS" && payloadText(record, "recordKind") === "SUPPLIER"), [sectorRecords]);
  const pharmacySales = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "SALES_DISPENSATION"), [sectorRecords]);
  const pharmacyPrescriptions = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "PRESCRIPTIONS"), [sectorRecords]);
  const pharmacyInventories = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "STOCK_INVENTORY"), [sectorRecords]);
  const pharmacyCash = useMemo(() => sectorRecords.filter((record) => record.moduleCode === "CASH_INVOICES_PAYMENTS"), [sectorRecords]);

  function fieldOptions(field: ActivityField) {
    if (field.source === "patients") {
      return patients.map((record) => ({ value: record.id, label: payloadText(record, "patientName") || record.title }));
    }
    if (field.source === "labRequests") {
      return labRequests.map((record) => ({ value: record.id, label: record.title }));
    }
    if (field.source === "pharmacyItems") {
      return pharmacyItems.map((record) => ({ value: record.id, label: record.title }));
    }
    if (field.source && gamingReferences[field.source as keyof typeof gamingReferences]) {
      return gamingReferences[field.source as keyof typeof gamingReferences] || [];
    }
    if (field.source === "members") {
      return members.map((member) => ({ value: member.user.id, label: member.user.name }));
    }
    const pharmacySources: Partial<Record<NonNullable<ActivityField["source"]>, EnterpriseActivitySectorRecordItem[]>> = { pharmacyProducts, pharmacyBatches, pharmacySuppliers, pharmacySales, pharmacyPrescriptions, pharmacyInventories, pharmacyCash };
    if (field.source && pharmacySources[field.source]) {
      return pharmacySources[field.source]?.map((record) => ({ value: record.id, label: record.title })) || [];
    }
    return (field.options || []).map((option) => ({ value: option, label: option }));
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    if (!selectedBlockCode) {
      onMessage(english ? "Select a business activity first." : "Choisissez un bloc d'activité.", "error");
      return;
    }
    onMessage("");
    setBusy(true);
    const formData = new FormData(formElement);
    const title = String(formData.get("title") || "");
    const baseDescription = String(formData.get("description") || "");
    const priority = String(formData.get("priority") || "NORMAL");
    const assignedToUserId = String(formData.get("assignedToUserId") || "");
    const departmentId = String(formData.get("departmentId") || "");
    const metadata: Record<string, string> = {};
    for (const field of selectedActivityFields) {
      const value = String(formData.get(field.name) || "").trim();
      if (value) metadata[field.name] = value;
    }
    // Sector details remain scoped metadata; never copy clinical or financial
    // references into the broad description of an EnterpriseRequest.
    const description = baseDescription;

    try {
      const response = await fetch(`/api/enterprise/${organization.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority, assignedToUserId, departmentId, blockCode: selectedBlockCode, metadata }),
      });
      const responseBody = (await response.json().catch(() => null)) as { message?: string } | null;
      onMessage(response.ok ? (english ? "Request sent to the selected colleague." : "Demande envoyée au destinataire sélectionné.") : (english ? "Request could not be sent. Check the fields or contact the manager." : responseBody?.message || "Envoi impossible."), response.ok ? "success" : "error");
      if (response.ok) {
        formElement.reset();
        onClose();
        router.refresh();
      }
    } catch {
      onMessage(english ? "Unable to send. Check your connection and try again." : "Envoi impossible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={(english ? selectedBlock?.labelEn : selectedBlock?.labelFr) || (english ? "New business request" : "Nouvelle demande entreprise")}
      description={english ? "This action creates a tracked request for the selected company." : selectedBlock?.descriptionFr || "Cette action crée une demande suivie dans l'entreprise active."}
      onClose={onClose}
      className="h-[96dvh] max-w-5xl"
      presentation="editor"
    >
      <form onSubmit={createRequest} className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <FormField label={english ? "Request subject" : "Objet de la demande"} hint={english ? "Summarize what you are requesting." : "Résumez précisément ce que vous envoyez au destinataire."}>
            <Input name="title" placeholder={english ? "Request subject" : "Objet de la demande"} required />
          </FormField>
          <FormField label={english ? "Recipient" : "Destinataire"} hint={english ? "Choose an active team member of this company." : "Choisissez un collaborateur actif de cette entreprise."}>
            <select name="assignedToUserId" required className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
              <option value="">{members.length ? (english ? "Select recipient" : "Destinataire") : (english ? "No active team member" : "Aucun collaborateur actif")}</option>
              {members.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name} · {member.role}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label={english ? "Department for manager approval (optional)" : "Département de validation manager (facultatif)"} hint={english ? "If a manager-approval workflow is published, its department manager must have the right to approve internal requests. Otherwise the workflow may be blocked." : "Si un workflow de validation manager est publié, son responsable de département doit être habilité. Sans département admissible, ce workflow peut rester bloqué."}>
          <select name="departmentId" defaultValue="" className="min-h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
            <option value="">{english ? "No department specified" : "Aucun département précisé"}</option>
            {departments.map((department) => <option key={department.value} value={department.value}>{english ? department.labelEn : department.labelFr}</option>)}
          </select>
        </FormField>
        <FormField label={english ? "Description" : "Description"} hint={english ? "Describe the context, need, report or problem." : "Décrivez le contexte, le besoin, le rapport ou le problème à traiter."}>
          <textarea name="description" required placeholder={english ? "Describe the request, report or issue." : "Décrivez précisément la demande, le rapport ou le problème."} className="min-h-36 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink" />
        </FormField>
        {!!selectedActivityFields.length && (
          <div className="grid min-w-0 gap-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-3 md:grid-cols-2">
            {selectedActivityFields.map((field) => (
              <FormField key={field.name} label={english ? field.labelEn || field.label : field.label} hint={english ? field.placeholderEn || field.placeholder : field.placeholder}>
                {field.type === "textarea" ? (
                  <textarea name={field.name} required={field.required} placeholder={english ? field.placeholderEn || field.placeholder : field.placeholder} className="min-h-24 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-semibold text-dtsc-ink" />
                ) : field.type === "select" || field.source ? (
                  <select name={field.name} required={field.required} disabled={Boolean(field.source && !fieldOptions(field).length)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink disabled:opacity-50">
                    <option value="">{field.source && !fieldOptions(field).length ? (english ? "No eligible record available" : "Aucun élément éligible disponible") : (english ? field.placeholderEn || field.placeholder : field.placeholder)}</option>
                    {fieldOptions(field).map((option) => (
                      <option key={option.value} value={option.value}>
                        {({ LOW: english ? "Low" : "Faible", MEDIUM: english ? "Medium" : "Modérée", NORMAL: english ? "Normal" : "Normale", HIGH: english ? "High" : "Élevée", CRITICAL: english ? "Critical" : "Critique" } as Record<string,string>)[option.label] || option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input name={field.name} type={field.type || "text"} required={field.required} min={field.type === "number" ? "0" : undefined} placeholder={english ? field.placeholderEn || field.placeholder : field.placeholder} />
                )}
              </FormField>
            ))}
          </div>
        )}
        <FormField label={english ? "Priority" : "Priorité"} hint={english ? "Choose the expected urgency." : "Indiquez l'urgence de traitement attendue."}>
          <select name="priority" defaultValue="NORMAL" className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-semibold text-dtsc-ink">
            <option value="LOW">{english ? "Low" : "Faible"}</option>
            <option value="NORMAL">{english ? "Normal" : "Normale"}</option>
            <option value="HIGH">{english ? "High" : "Élevée"}</option>
            <option value="CRITICAL">{english ? "Critical" : "Critique"}</option>
          </select>
        </FormField>
        <Button disabled={busy || selectedActivityFields.some((field) => field.required && field.source && !fieldOptions(field).length)} aria-busy={busy} className="w-fit rounded-xl bg-dtsc-blue text-white">
          <Send className="h-4 w-4" />
          {busy ? (english ? "Sending…" : "Envoi…") : (english ? "Submit request" : "Envoyer la demande")}
        </Button>
      </form>
    </Dialog>
  );
}
