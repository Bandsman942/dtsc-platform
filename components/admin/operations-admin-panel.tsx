"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Download, Eye, FileText, Plus, Save, Trash2, UploadCloud, X } from "lucide-react";
import { InternalFullScreenSurface } from "@/components/admin/internal-full-screen-surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { OperationalChecklistPanel } from "@/components/operations/operational-checklist-panel";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleHeader, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import type { OperationDataset, OperationField, OperationRecord } from "@/lib/admin-operations-types";
import { formatEnumLabel } from "@/lib/labels";
import type { OperationalObjectType } from "@/lib/operational-access";

const maxOperationFileSize = 6_000_000;

function currencyBreakdown(records: OperationRecord[], amount: (record: OperationRecord) => number = (record) => record.amount || 0) {
  const totals = new Map<string, number>();
  for (const item of records) {
    const currency = item.currency || "NON_CERTIFIÉ";
    totals.set(currency, (totals.get(currency) || 0) + amount(item));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => `${total.toFixed(2)} ${currency}`).join(" · ") || "0.00 —";
}
const medicalProjectFieldNames = new Set([
  "healthDigitalCategory",
  "healthObjective",
  "medicalDataConcerned",
  "medicalRisk",
  "confidentialityConstraint",
  "healthValidation",
  "ethicalCompliance",
]);

function resolveAdminChecklistType(dataset: OperationDataset): OperationalObjectType | null {
  const endpoint = dataset.endpoint.toLowerCase();
  if (endpoint.includes("/admin/coo/operations")) return "OPERATION";
  if (endpoint.includes("/admin/coo/tasks")) return "TASK";
  if (endpoint.includes("/admin/coo/departmentrequests")) return "DEPARTMENT_REQUEST";
  if (endpoint.includes("/admin/coo/blockers")) return "BLOCKER";
  if (endpoint.includes("/admin/coo/meetings")) return "MEETING";
  if (endpoint.includes("/admin/ceo/objectives")) return "CEO_OBJECTIVE";
  if (endpoint.includes("/admin/ceo/supervisionlogs")) return "CEO_SUPERVISION";
  if (endpoint.includes("/admin/sco/purchaserequests")) return "SCO_PURCHASE_REQUEST";
  if (endpoint.includes("/admin/sco/logistics")) return "SCO_LOGISTICS";
  if (endpoint.includes("/admin/mpo/projects")) return "MPO_PROJECT";
  if (endpoint.includes("/admin/mpo/records")) return "MPO_RECORD";
  if (endpoint.includes("/admin/cto/projects")) return "CTO_PROJECT";
  if (endpoint.includes("/admin/cto/records")) return "CTO_RECORD";
  return null;
}

export function OperationsAdminPanel({
  eyebrow,
  title,
  description,
  playbook,
  datasets,
  canEdit,
  embedded = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  playbook: string[];
  datasets: OperationDataset[];
  canEdit: boolean;
  embedded?: boolean;
}) {
  const [itemsByDataset, setItemsByDataset] = useState(() =>
    Object.fromEntries(datasets.map((dataset) => [dataset.id, dataset.records]))
  );
  const [message, setMessage] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const getDatasetSearchText = useCallback((dataset: OperationDataset) => `${dataset.label} ${dataset.description} ${dataset.id}`, []);
  const datasetList = useSmartList({ items: datasets, pageSize: 8, getSearchText: getDatasetSearchText });
  useToastMessage(message);

  const visibleItemsByDataset = useMemo(() => {
    return Object.fromEntries(
      Object.entries(itemsByDataset).map(([datasetId, records]) => [
        datasetId,
        records.filter((record) => isInDateRange(record.createdAt, dateStart, dateEnd)),
      ])
    );
  }, [dateEnd, dateStart, itemsByDataset]);

  const totals = useMemo(() => {
    const records = Object.values(visibleItemsByDataset).flat();
    const hrcfoRevenue = (visibleItemsByDataset.transactions || []).reduce((sum, item) => {
      const category = item.values?.transactionCategory;
      const itemTitle = (item.values?.title || item.title || "").trim().toLocaleLowerCase("fr-FR");
      const impactsRevenue = category === "IN" && (item.status === "VALIDATED" || item.status === "PAID") && itemTitle !== "capital de départ";
      return impactsRevenue ? sum + (item.amount || 0) : sum;
    }, 0);
    const transactions = visibleItemsByDataset.transactions || [];
    const financialTransactions = transactions.filter((item) => item.status === "VALIDATED" || item.status === "PAID");
    const revenueRecords = financialTransactions.filter((item) => item.values?.transactionCategory === "IN" && (item.values?.title || item.title || "").trim().toLocaleLowerCase("fr-FR") !== "capital de départ");
    const inflowRecords = financialTransactions.filter((item) => item.values?.transactionCategory === "IN");
    const outflowRecords = financialTransactions.filter((item) => item.values?.transactionCategory === "OUT");
    const capitalRecords = inflowRecords.filter((item) => (item.values?.title || item.title || "").trim().toLocaleLowerCase("fr-FR") === "capital de départ");
    const totalIn = financialTransactions.filter((item) => item.values?.transactionCategory === "IN").reduce((sum, item) => sum + (item.amount || 0), 0);
    const totalOut = financialTransactions.filter((item) => item.values?.transactionCategory === "OUT").reduce((sum, item) => sum + (item.amount || 0), 0);
    const startingCapital = financialTransactions
      .filter((item) => item.values?.transactionCategory === "IN" && (item.values?.title || item.title || "").trim().toLocaleLowerCase("fr-FR") === "capital de départ")
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const accountsBalance = (visibleItemsByDataset.accounts || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    const budgets = visibleItemsByDataset.budgets || [];
    const budgetTotal = budgets.reduce((sum, item) => sum + (item.amount || 0), 0);
    const budgetSpent = budgets.reduce((sum, item) => {
      const spentMeta = item.meta.find((entry) => entry.startsWith("Consommé:"));
      const value = Number((spentMeta || "").replace("Consommé:", "").replace("USD", "").trim());
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const payrolls = visibleItemsByDataset.payrolls || [];
    const netPayrollPaid = payrolls.filter((item) => item.status === "VALIDATED" || item.status === "PAID").reduce((sum, item) => sum + (item.amount || 0), 0);
    const budgetRecords = visibleItemsByDataset.budgets || [];
    const balanceBreakdown = currencyBreakdown(visibleItemsByDataset.accounts || []);
    const revenueBreakdown = currencyBreakdown(revenueRecords);
    const inflowBreakdown = currencyBreakdown(inflowRecords);
    const outflowBreakdown = currencyBreakdown(outflowRecords);
    const capitalBreakdown = currencyBreakdown(capitalRecords);
    const budgetBreakdown = currencyBreakdown(budgetRecords);
    const spentBreakdown = currencyBreakdown(budgetRecords, (item) => {
      const spentMeta = item.meta.find((entry) => entry.startsWith("Consommé:"));
      const value = Number((spentMeta || "").split(" ")[1]);
      return Number.isFinite(value) ? value : 0;
    });
    const remainingBreakdown = currencyBreakdown(budgetRecords, (item) => {
      const spentMeta = item.meta.find((entry) => entry.startsWith("Consommé:"));
      const value = Number((spentMeta || "").split(" ")[1]);
      return Math.max(0, (item.amount || 0) - (Number.isFinite(value) ? value : 0));
    });
    const payrollBreakdown = currencyBreakdown(payrolls.filter((item) => item.status === "VALIDATED" || item.status === "PAID"));
    const activeRecords = records.filter((item) => !isClosedStatus(item.status)).length;
    const attentionItems = records.filter((item) => needsAttention(item)).length;
    const taskRecords = visibleItemsByDataset.tasks || [];
    const blockedTasks = taskRecords.filter((item) => item.status === "BLOCKED" || item.status === "LATE").length;
    const operationalExecution = taskRecords.length
      ? Math.round((taskRecords.filter((item) => item.status === "COMPLETED" || item.status === "VALIDATED").length / taskRecords.length) * 100)
      : 0;
    const datasetCounts = datasets.map((dataset) => ({ label: dataset.label, count: (visibleItemsByDataset[dataset.id] || []).length }));
    const maxCount = Math.max(1, ...datasetCounts.map((item) => item.count));
    return { records: records.length, activeRecords, attentionItems, blockedTasks, hrcfoRevenue, operationalExecution, datasetCounts, maxCount, totalIn, totalOut, startingCapital, accountsBalance, budgetTotal, budgetSpent, netPayrollPaid, financialTransactionCount: financialTransactions.length, revenueBreakdown, inflowBreakdown, outflowBreakdown, balanceBreakdown, capitalBreakdown, budgetBreakdown, spentBreakdown, remainingBreakdown, payrollBreakdown };
  }, [datasets, visibleItemsByDataset]);
  const isHrcfoPanel = datasets.some((dataset) => dataset.id === "transactions" && dataset.endpoint.includes("/hr-cfo/"));
  const isCooPanel = datasets.some((dataset) => dataset.endpoint.includes("/admin/coo/"));
  const isCeoPanel = datasets.some((dataset) => dataset.endpoint.includes("/admin/ceo/"));
  const hasDateFilter = Boolean(dateStart || dateEnd);
  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId);
  const closeDataset = useCallback(() => setActiveDatasetId(null), []);

  async function createRecord(dataset: OperationDataset, form: HTMLFormElement) {
    let payload: Record<string, FormDataEntryValue>;
    try {
      payload = await buildPayloadWithUploads(form);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import de fichier impossible.");
      return;
    }
    const response = await fetch(dataset.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { record?: Record<string, unknown>; message?: string } | null;
    setMessage(response.ok ? `${dataset.label}: élément enregistré.` : body?.message || `${dataset.label}: enregistrement impossible.`);
    const savedRecord = body?.record;
    if (response.ok && savedRecord) {
      setItemsByDataset((current) => ({
        ...current,
        [dataset.id]: [recordFromRaw(dataset, savedRecord), ...(current[dataset.id] || [])],
      }));
      form.reset();
    }
  }

  async function updateRecord(dataset: OperationDataset, record: OperationRecord, form: HTMLFormElement) {
    let payload: Record<string, FormDataEntryValue>;
    try {
      payload = await buildPayloadWithUploads(form);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import de fichier impossible.");
      return;
    }
    const response = await fetch(`${dataset.endpoint}/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { record?: Record<string, unknown>; message?: string } | null;
    setMessage(response.ok ? "Élément opérationnel mis à jour." : body?.message || "Impossible de mettre à jour cet élément.");
    const savedRecord = body?.record;
    if (response.ok && savedRecord) {
      const saved = recordFromRaw(dataset, savedRecord);
      setItemsByDataset((current) => ({
        ...current,
        [dataset.id]: (current[dataset.id] || []).map((item) => item.id === saved.id ? saved : item),
      }));
    }
  }

  async function removeRecord(dataset: OperationDataset, record: OperationRecord) {
    const response = await fetch(`${dataset.endpoint}/${record.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Élément supprimé." : body?.message || "Suppression impossible.");
    if (response.ok) {
      setItemsByDataset((current) => ({
        ...current,
        [dataset.id]: (current[dataset.id] || []).filter((item) => item.id !== record.id),
      }));
    }
  }

  return (
    <ModuleWorkspace>
      {!embedded ? (
      <ModuleHeader
        eyebrow={eyebrow}
        title={title}
        count={`${totals.records} élément${totals.records > 1 ? "s" : ""}`}
        description={description}
      />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-y border-dtsc-border py-3 text-xs">
        <span className="text-dtsc-muted">Dossiers <strong className="ml-1 text-base font-black tabular-nums text-dtsc-ink">{totals.records}</strong></span>
        <span className="text-dtsc-muted">Actifs <strong className="ml-1 text-base font-black tabular-nums text-dtsc-ink">{totals.activeRecords}</strong></span>
        <span className="text-dtsc-muted">À traiter <strong className="ml-1 text-base font-black tabular-nums text-dtsc-ink">{totals.attentionItems}</strong></span>
        {(isCooPanel || isCeoPanel) ? <span className="text-dtsc-muted">Exécution <strong className="ml-1 text-base font-black text-dtsc-ink">{totals.operationalExecution}%</strong></span> : null}
        {isHrcfoPanel ? <span className="text-dtsc-muted">Chiffre d’affaires <strong className="ml-1 text-base font-black text-dtsc-ink">{totals.revenueBreakdown}</strong></span> : null}
      </div>
      {isHrcfoPanel ? <details className="border-b border-dtsc-border pb-2 text-xs"><summary className="min-h-10 cursor-pointer py-3 font-black text-dtsc-blue">Soldes et indicateurs financiers détaillés</summary><dl className="grid min-w-0 gap-x-5 gap-y-2 pb-3 sm:grid-cols-2 lg:grid-cols-3">{[["Comptes", totals.balanceBreakdown], ["Entrées", totals.inflowBreakdown], ["Sorties", totals.outflowBreakdown], ["Capital", totals.capitalBreakdown], ["Budgets", totals.budgetBreakdown], ["Consommé", totals.spentBreakdown], ["Restant", totals.remainingBreakdown], ["Paie validée/payée", totals.payrollBreakdown]].map(([label, value]) => <div key={label} className="min-w-0 border-b border-dtsc-border/50 py-2"><dt className="text-dtsc-muted">{label}</dt><dd className="break-words font-black text-dtsc-ink">{value}</dd></div>)}</dl></details> : null}
      <ol className="flex max-w-full gap-1 overflow-x-auto py-2 [scrollbar-width:none]" aria-label={`Flux recommandé ${title}`}>
        {playbook.map((step, index) => <li key={step} className="shrink-0 border-r border-dtsc-border px-2 text-[0.7rem] font-bold text-dtsc-muted last:border-0"><span className="mr-1 text-cyan-600">{index + 1}.</span>{step}</li>)}
      </ol>
      <ListControls query={datasetList.query} onQueryChange={datasetList.setQuery} page={datasetList.page} pageCount={datasetList.pageCount} totalCount={datasetList.totalCount} filteredCount={datasetList.filteredCount} onPageChange={datasetList.setPage} placeholder="Rechercher un registre, une activité…" />
      <div className="divide-y divide-dtsc-border border-y border-dtsc-border" aria-label={`Registres ${title}`}>
        {datasetList.paginatedItems.map((dataset) => <button type="button" key={dataset.id} onClick={() => setActiveDatasetId(dataset.id)} className="flex min-h-14 w-full min-w-0 items-center gap-3 px-2 py-2 text-left hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-dtsc-ink">{dataset.label}</span><span className="block truncate text-xs text-dtsc-muted">{dataset.description}</span></span><span className="shrink-0 text-xs font-black tabular-nums text-dtsc-muted">{(visibleItemsByDataset[dataset.id] || []).length}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-dtsc-blue" /></button>)}
      </div>
      {!datasetList.paginatedItems.length ? <p className="py-4 text-sm text-dtsc-muted">Aucun registre ne correspond à votre recherche.</p> : null}
      {datasets.map((dataset) => (
        <InternalFullScreenSurface key={dataset.id} open={activeDataset?.id === dataset.id} title={dataset.label} subtitle={dataset.description} onClose={closeDataset} level={2}>
          <DatasetSection dataset={dataset} records={visibleItemsByDataset[dataset.id] || []} canEdit={canEdit} onCreate={createRecord} onUpdate={updateRecord} onRemove={removeRecord} dateStart={dateStart} dateEnd={dateEnd} setDateStart={setDateStart} setDateEnd={setDateEnd} hasDateFilter={hasDateFilter} />
        </InternalFullScreenSurface>
      ))}
    </ModuleWorkspace>
  );
}

function isInDateRange(value: string, start: string, end: string) {
  if (!start && !end) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  if (start && time < new Date(`${start}T00:00:00`).getTime()) return false;
  if (end && time > new Date(`${end}T23:59:59.999`).getTime()) return false;
  return true;
}

function isClosedStatus(status: string) {
  return /ARCHIVED|CANCELED|CANCELLED|CLOSED|COMPLETED|RESOLVED|DELIVERED|RECEIVED|SIGNED|PAID|VALIDATED|APPROVED|TERMINATED|DONE/i.test(status);
}

function needsAttention(record: OperationRecord) {
  const status = `${record.status} ${record.meta.join(" ")}`;
  return /BLOCKED|LATE|OVERDUE|CRITICAL|URGENT|LOW_STOCK|OUT_OF_STOCK|MISSING|EXPIRED|REJECTED|TO_CORRECT|WAITING|PENDING|SUBMITTED|OPEN|ESCALATED|INSUFFICIENT/i.test(status);
}

function statusTone(status: string): StatusBadgeTone {
  if (/REJECTED|BLOCKED|LATE|OVERDUE|CRITICAL|EXPIRED|OUT_OF_STOCK|CANCELED|CANCELLED/i.test(status)) return "danger";
  if (/WAITING|PENDING|SUBMITTED|OPEN|LOW_STOCK|TO_CORRECT/i.test(status)) return "warning";
  if (/VALIDATED|APPROVED|PAID|COMPLETED|RESOLVED|DELIVERED|RECEIVED|SIGNED|DONE|ACTIVE/i.test(status)) return "success";
  if (/IN_PROGRESS|PROCESSING|REVIEW/i.test(status)) return "info";
  return "neutral";
}

function DatasetSection({
  dataset,
  records,
  canEdit,
  onCreate,
  onUpdate,
  onRemove,
  dateStart,
  dateEnd,
  setDateStart,
  setDateEnd,
  hasDateFilter,
}: {
  dataset: OperationDataset;
  records: OperationRecord[];
  canEdit: boolean;
  onCreate: (dataset: OperationDataset, form: HTMLFormElement) => Promise<void>;
  onUpdate: (dataset: OperationDataset, record: OperationRecord, form: HTMLFormElement) => Promise<void>;
  onRemove: (dataset: OperationDataset, record: OperationRecord) => Promise<void>;
  dateStart: string;
  dateEnd: string;
  setDateStart: (value: string) => void;
  setDateEnd: (value: string) => void;
  hasDateFilter: boolean;
}) {
  const [status, setStatus] = useState("ALL");
  const statuses = useMemo(() => Array.from(new Set([...dataset.statusOptions.map((option) => option.value), ...records.map((record) => record.status)])), [dataset.statusOptions, records]);
  const statusRecords = useMemo(() => status === "ALL" ? records : records.filter((record) => record.status === status), [records, status]);
  const getSearchText = useCallback((record: OperationRecord) => [record.id, record.title, record.subtitle, record.status, record.notes, record.currency, record.amount, ...record.meta, ...Object.values(record.values || {})].join(" "), []);
  const list = useSmartList({ items: statusRecords, pageSize: 12, getSearchText });
  const [createOpen, setCreateOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(dataset, event.currentTarget);
    setCreateOpen(false);
  }

  return (
    <section id={`operations-${dataset.id}`} data-dtsc-register-fullscreen className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-dtsc-border pb-2">
        <p className="text-xs font-bold text-dtsc-muted">{list.filteredCount} résultat{list.filteredCount > 1 ? "s" : ""} · {records.length} éléments dans la période</p>
        {canEdit ? <Button type="button" size="sm" onClick={() => setCreateOpen(true)} className="rounded-lg bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Nouveau</Button> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2" aria-label={`Période ${dataset.label}`}>
        <label className="grid min-w-0 flex-1 gap-1 text-[0.7rem] font-black text-dtsc-muted sm:max-w-48">Du<Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-10 min-w-0 rounded-lg bg-dtsc-surface" /></label>
        <label className="grid min-w-0 flex-1 gap-1 text-[0.7rem] font-black text-dtsc-muted sm:max-w-48">Au<Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-10 min-w-0 rounded-lg bg-dtsc-surface" /></label>
        {hasDateFilter ? <Button type="button" size="sm" variant="outline" onClick={() => { setDateStart(""); setDateEnd(""); }} className="h-10 rounded-lg border-dtsc-border">Effacer les dates</Button> : null}
      </div>
      <nav aria-label={`Filtrer ${dataset.label} par statut`} className="flex min-w-0 gap-1.5 overflow-x-auto py-1 [scrollbar-width:thin]">
        <button type="button" aria-pressed={status === "ALL"} onClick={() => { setStatus("ALL"); list.setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === "ALL" ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>Tous · {records.length}</button>
        {statuses.map((item) => <button key={item} type="button" aria-pressed={status === item} onClick={() => { setStatus(item); list.setPage(1); }} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold ${status === item ? "border-cyan-400 bg-cyan-400/15 text-dtsc-blue" : "border-dtsc-border text-dtsc-muted"}`}>{dataset.statusOptions.find((option) => option.value === item)?.label || formatEnumLabel(item)} · {records.filter((record) => record.status === item).length}</button>)}
      </nav>
      <ListControls
        query={list.query}
        onQueryChange={list.setQuery}
        page={list.page}
        pageCount={list.pageCount}
        totalCount={statusRecords.length}
        filteredCount={list.filteredCount}
        placeholder={`Rechercher nom, ID, montant, statut, référence…`}
        onPageChange={list.setPage}
      />

      {list.paginatedItems.length ? (
        <BusinessList ariaLabel={dataset.label}>
          {list.paginatedItems.map((record) => (
            <RecordRow key={record.id} dataset={dataset} record={record} canEdit={canEdit} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </BusinessList>
      ) : records.length ? (
        <EmptyState compact title="Aucun résultat" description="Aucun élément ne correspond à cette recherche." />
      ) : (
        <EmptyState compact title="Aucun contenu" description={`Aucun élément n'est encore enregistré dans ${dataset.label.toLowerCase()}.`} action={canEdit ? <Button type="button" variant="outline" onClick={() => setCreateOpen(true)} className="rounded-xl border-dtsc-border">Créer le premier élément</Button> : undefined} />
      )}

      <Dialog open={createOpen} title={`Nouveau: ${dataset.label}`} description="Remplissez le formulaire puis enregistrez l'élément." onClose={() => setCreateOpen(false)} className="h-[92dvh] max-w-5xl">
        <OperationForm fields={dataset.fields} disabled={!canEdit} onSubmit={submit} submitLabel="Ajouter" submitIcon="plus" />
      </Dialog>
    </section>
  );
}

function RecordRow({
  dataset,
  record,
  canEdit,
  onUpdate,
  onRemove,
}: {
  dataset: OperationDataset;
  record: OperationRecord;
  canEdit: boolean;
  onUpdate: (dataset: OperationDataset, record: OperationRecord, form: HTMLFormElement) => Promise<void>;
  onRemove: (dataset: OperationDataset, record: OperationRecord) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  const attachmentHref = typeof record.href === "string" && record.href.length > 0 ? record.href : undefined;
  const checklistType = resolveAdminChecklistType(dataset);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(dataset, record, event.currentTarget);
    setEditOpen(false);
  }

  const meta = [record.subtitle, ...record.meta, record.amount != null ? `${record.amount.toFixed(2)} ${record.currency || "USD"}` : null].filter(Boolean).join(" · ");

  return (
    <>
      <BusinessListItem
        title={record.title}
        status={<StatusBadge tone={statusTone(record.status)}>{formatEnumLabel(record.status)}</StatusBadge>}
        meta={meta || undefined}
        onOpen={() => setDetailOpen(true)}
        openLabel={`Consulter la fiche ${record.title}`}
        className="!py-1.5 sm:!py-2"
        actions={(
          <ContextActions
            label={`Actions pour ${record.title}`}
            actions={[
              { id: "open", label: "Voir la fiche", icon: Eye, onSelect: () => setDetailOpen(true) },
              ...(canEdit ? [{ id: "edit", label: "Modifier", icon: Save, onSelect: () => setEditOpen(true) }] : []),
              ...(attachmentHref ? [{ id: "download", label: "Télécharger le fichier", icon: Download, onSelect: () => window.open(attachmentHref, "_blank", "noopener,noreferrer") }] : []),
              ...(canEdit ? [{ id: "delete", label: "Supprimer", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setConfirmDelete(true) }] : []),
            ]}
          />
        )}
      />
      <InternalFullScreenSurface
        open={detailOpen}
        title={record.title}
        subtitle={`${dataset.label} · ${record.id}`}
        onClose={closeDetail}
        level={3}
        actions={<ContextActions label={`Actions pour ${record.title}`} actions={[
          { id: "back", label: "Retour aux résultats", icon: ArrowLeft, onSelect: closeDetail },
          ...(canEdit ? [{ id: "edit", label: "Modifier", icon: Save, onSelect: () => setEditOpen(true) }] : []),
          ...(attachmentHref ? [{ id: "download", label: "Télécharger", icon: Download, onSelect: () => window.open(attachmentHref, "_blank", "noopener,noreferrer") }] : []),
          ...(canEdit ? [{ id: "delete", label: "Supprimer", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setConfirmDelete(true) }] : []),
        ]} />}
      >
        <div data-dtsc-record-detail className="min-w-0 space-y-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-dtsc-border pb-3 text-xs text-dtsc-muted">
            <StatusBadge tone={statusTone(record.status)}>{formatEnumLabel(record.status)}</StatusBadge>
            <span>Créé le {Number.isNaN(Date.parse(record.createdAt)) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.createdAt))}</span>
            {record.amount != null ? <span className="font-black text-dtsc-ink">{record.amount.toFixed(2)} {record.currency || "USD"}</span> : null}
          </div>
          <dl className="grid min-w-0 gap-0 sm:grid-cols-2 lg:grid-cols-3">
            {record.subtitle ? <div className="min-w-0 border-b border-dtsc-border/70 px-2 py-3"><dt className="text-[0.7rem] font-bold uppercase text-dtsc-muted">Domaine</dt><dd className="mt-1 break-words text-sm font-semibold text-dtsc-ink">{record.subtitle}</dd></div> : null}
            {dataset.fields.filter((field) => field.type !== "hidden" && field.type !== "preview" && field.type !== "file" && Boolean(record.values?.[field.name])).map((field) => (
              <div key={field.name} className="min-w-0 border-b border-dtsc-border/70 px-2 py-3"><dt className="text-[0.7rem] font-bold uppercase text-dtsc-muted">{field.label}</dt><dd data-responsive-long-token className="mt-1 break-words text-sm font-semibold text-dtsc-ink [overflow-wrap:anywhere]">{record.values?.[field.name]}</dd></div>
            ))}
            {record.meta.map((item, index) => <div key={`${index}-${item}`} className="min-w-0 border-b border-dtsc-border/70 px-2 py-3"><dt className="text-[0.7rem] font-bold uppercase text-dtsc-muted">Information {index + 1}</dt><dd className="mt-1 break-words text-sm font-semibold text-dtsc-ink">{item}</dd></div>)}
          </dl>
          {record.notes ? <section className="border-b border-dtsc-border py-3"><h3 className="text-xs font-black uppercase text-dtsc-muted">Notes et observations</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-dtsc-ink">{record.notes}</p></section> : null}
          {attachmentHref ? <FileAttachmentPreview href={attachmentHref} label={record.hrefLabel || "Document associé"} compact /> : null}
          {checklistType ? <OperationalChecklistPanel objectType={checklistType} objectId={record.id} title="Tâches et résultats de progression" /> : null}
          <div data-responsive-actions className="flex flex-wrap gap-2 border-t border-dtsc-border pt-3">
            {canEdit ? <Button type="button" onClick={() => setEditOpen(true)} className="rounded-lg bg-dtsc-blue text-white"><Save className="h-4 w-4" /> Modifier</Button> : null}
            {attachmentHref ? <a href={attachmentHref} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dtsc-border px-3 text-xs font-black text-dtsc-blue"><Download className="h-4 w-4" /> Télécharger</a> : null}
            {canEdit ? <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)} className="rounded-lg border-red-400/50 text-red-600"><Trash2 className="h-4 w-4" /> Supprimer</Button> : null}
          </div>
        </div>
      </InternalFullScreenSurface>
      <Dialog open={editOpen} title={`Modifier: ${record.title}`} description="Mettez à jour les informations de l'opération puis envoyez la modification au serveur." onClose={() => setEditOpen(false)} className="h-[92dvh] max-w-5xl">
        <div className="space-y-5">
          {checklistType ? (
            <OperationalChecklistPanel
              objectType={checklistType}
              objectId={record.id}
              title="Tâches et résultats qui gouvernent la progression"
            />
          ) : null}
          <OperationForm fields={dataset.fields} defaults={{ ...(record.values || {}), status: record.status, notes: record.notes || "" }} disabled={!canEdit} onSubmit={submit} submitLabel="Enregistrer les modifications" submitIcon="save" />
        </div>
      </Dialog>
      <Dialog
        open={confirmDelete}
        title="Supprimer cet élément"
        description="Cette action retire l’élément du suivi opérationnel."
        onClose={() => setConfirmDelete(false)}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">Annuler</Button>
            <Button type="button" onClick={async () => { setConfirmDelete(false); await onRemove(dataset, record); }} className="rounded-xl bg-red-600 text-white hover:bg-red-700">Supprimer</Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">Confirmez la suppression de <span className="font-black text-dtsc-ink">{record.title}</span>. Les journaux d&apos;audit conserveront la trace de l&apos;action.</p>
      </Dialog>
    </>
  );
}

function OperationForm({
  fields,
  defaults = {},
  disabled,
  onSubmit,
  submitLabel,
  submitIcon,
}: {
  fields: OperationField[];
  defaults?: Record<string, string>;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  submitLabel: string;
  submitIcon: "plus" | "save";
}) {
  const initialPreviews = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (field.type !== "select") continue;
      const selected = field.options?.find((option) => option.value === defaults[field.name]);
      if (selected?.email) values[field.name] = selected.email;
    }
    return values;
  }, [defaults, fields]);
  const [previewValues, setPreviewValues] = useState(initialPreviews);
  const hasMedicalDefaults = useMemo(() => [...medicalProjectFieldNames].some((fieldName) => Boolean(defaults[fieldName])), [defaults]);
  const [medicalProjectEnabled, setMedicalProjectEnabled] = useState(hasMedicalDefaults || defaults.projectType === "DIGITAL_HEALTH");

  function setSelectPreview(fieldName: string, email: string) {
    setPreviewValues((current) => ({ ...current, [fieldName]: email }));
  }

  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-3 md:grid-cols-2">
      {fields.map((field) => {
        if (medicalProjectFieldNames.has(field.name) && !medicalProjectEnabled) return null;
        return (
          <FieldInput
            key={field.name}
            field={field}
            disabled={disabled}
            defaultValue={defaults[field.name] || ""}
            previewValue={field.previewFor ? previewValues[field.previewFor] || "" : ""}
            onSelectPreview={setSelectPreview}
            checkboxChecked={field.name === "isMedicalProject" ? medicalProjectEnabled : undefined}
            onCheckboxChange={field.name === "isMedicalProject" ? setMedicalProjectEnabled : undefined}
          />
        );
      })}
      <div className="md:col-span-2">
        <Button disabled={disabled} className="rounded-xl bg-dtsc-blue text-white">
          {submitIcon === "plus" ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldInput({
  field,
  disabled,
  defaultValue,
  previewValue,
  onSelectPreview,
  checkboxChecked,
  onCheckboxChange,
}: {
  field: OperationField;
  disabled: boolean;
  defaultValue: string;
  previewValue: string;
  onSelectPreview: (fieldName: string, email: string) => void;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const className = "w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink";
  const label = <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{field.label}</span>;
  const defaultValues = defaultValue.split(",").map((value) => value.trim()).filter(Boolean);

  function handleOperationFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      setFileError("");
      return;
    }
    if (file.size > maxOperationFileSize) {
      event.currentTarget.value = "";
      setSelectedFile(null);
      setFileError("Le fichier dépasse la limite autorisée de 6 Mo.");
      return;
    }
    setSelectedFile(file);
    setFileError("");
  }

  if (field.type === "hidden") return <input type="hidden" name={field.name} value={defaultValue || field.placeholder || ""} />;

  if (field.type === "preview") {
    return <label className="grid min-w-0 gap-1">{label}<Input value={previewValue} readOnly disabled placeholder={field.placeholder || "Sélectionnez d'abord un collaborateur"} />{field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}</label>;
  }

  if (field.type === "file") {
    return (
      <div className="grid min-w-0 gap-2 md:col-span-2">
        {label}
        {defaultValue && <FileAttachmentPreview href={defaultValue} label="Fichier déjà associé" />}
        <input type="hidden" name={field.name} value={defaultValue} />
        <input ref={fileInputRef} name={`${field.name}__file`} type="file" disabled={disabled} onChange={handleOperationFileChange} className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,application/pdf,image/png,image/jpeg,image/webp" />
        <button type="button" disabled={disabled} onClick={() => fileInputRef.current?.click()} className="flex min-h-28 w-full min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-300/70 bg-cyan-400/10 px-4 py-5 text-center transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60">
          <UploadCloud className="h-5 w-5 text-cyan-500" />
          <span className="text-sm font-black text-dtsc-ink">{selectedFile ? selectedFile.name : "Sélectionner un fichier depuis l'appareil"}</span>
          <span className="text-xs leading-5 text-dtsc-muted">PDF, image, Word, Excel ou texte. Taille maximale: 6 Mo.</span>
        </button>
        {selectedFile && (
          <div className="flex min-w-0 items-center justify-between gap-3 border-y border-dtsc-border px-1 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink"><FileText className="h-4 w-4 shrink-0 text-cyan-500" /><span className="truncate">{selectedFile.name}</span><span className="shrink-0 text-xs text-dtsc-muted">{formatFileSize(selectedFile.size)}</span></span>
            <Button type="button" size="icon" variant="ghost" onClick={() => { setSelectedFile(null); setFileError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="h-8 w-8 rounded-xl text-dtsc-muted hover:text-red-500" aria-label={`Retirer ${selectedFile.name}`}><X className="h-4 w-4" /></Button>
          </div>
        )}
        {fileError && <span className="text-xs font-bold text-red-500">{fileError}</span>}
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return <label className="grid min-w-0 gap-1 md:col-span-2">{label}<textarea name={field.name} required={field.required} disabled={disabled} defaultValue={defaultValue} placeholder={field.placeholder} className={`${className} min-h-20`} />{field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}</label>;
  }

  if (field.type === "checkbox") {
    const checked = checkboxChecked ?? (defaultValue === "true" || defaultValue === "on");
    return (
      <label className="flex min-w-0 items-start gap-3 border-y border-dtsc-border py-3 md:col-span-2">
        <input name={field.name} type="checkbox" checked={checked} disabled={disabled || field.readOnly} onChange={(event) => onCheckboxChange?.(event.currentTarget.checked)} className="mt-1 h-4 w-4 rounded border-dtsc-border text-cyan-500" />
        <span className="min-w-0">{label}{field.helperText && <span className="mt-1 block text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}</span>
      </label>
    );
  }

  if (field.type === "select-multiple") {
    return (
      <div className="grid min-w-0 gap-1 md:col-span-2">
        {label}
        <div className="max-h-48 min-h-28 overflow-y-auto border-y border-dtsc-border py-2">
          {field.options && field.options.length > 0 ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {field.options.map((option) => (
                <label key={option.value} className="flex min-w-0 items-start gap-2 px-2 py-2 text-sm font-semibold text-dtsc-ink">
                  <input name={field.name} value={option.value} type="checkbox" defaultChecked={defaultValues.includes(option.value) || defaultValues.includes(option.label)} disabled={disabled || field.readOnly} className="mt-1 h-4 w-4 rounded border-dtsc-border text-cyan-500" />
                  <span className="min-w-0"><span className="block truncate">{option.label}</span>{option.email && <span className="block truncate text-xs text-dtsc-muted">{option.email}</span>}</span>
                </label>
              ))}
            </div>
          ) : <p className="px-2 py-2 text-sm font-semibold text-dtsc-muted">Aucun collaborateur disponible.</p>}
        </div>
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="grid min-w-0 gap-1">
        {label}
        <select name={field.name} required={field.required} disabled={disabled || field.readOnly} defaultValue={defaultValue} className={className} onChange={(event) => onSelectPreview(field.name, event.currentTarget.selectedOptions[0]?.dataset.email || "")}>
          {!field.required && <option value="">Non renseigné</option>}
          {field.options?.map((option) => <option key={option.value} value={option.value} data-email={option.email || ""}>{option.label}</option>)}
        </select>
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </label>
    );
  }

  return <label className="grid min-w-0 gap-1">{label}<Input name={field.name} type={field.type} required={field.required} disabled={disabled || field.readOnly} defaultValue={defaultValue} placeholder={field.placeholder} />{field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}</label>;
}

function FileAttachmentPreview({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const lowerHref = href.toLowerCase();
  const canPreviewImage = /\.(png|jpe?g|webp)(\?|$)/i.test(lowerHref);
  const canPreviewPdf = /\.pdf(\?|$)/i.test(lowerHref) || lowerHref.includes("application/pdf");
  return (
    <div className={compact ? "border-b border-dtsc-border py-2 pl-3" : "mt-3 border-y border-dtsc-border py-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink"><FileText className="h-4 w-4 shrink-0 text-cyan-500" /><span className="truncate">{label}</span></span>
        <div className="flex flex-wrap gap-2">
          {(canPreviewImage || canPreviewPdf) && <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-page text-dtsc-blue"><Eye className="h-4 w-4" />Aperçu</Button>}
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-dtsc-blue px-3 py-2 text-xs font-black text-white"><Download className="h-4 w-4" />Télécharger</a>
        </div>
      </div>
      <Dialog open={previewOpen} title={`Aperçu: ${label}`} onClose={() => setPreviewOpen(false)} className="max-w-5xl">
        {canPreviewImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={label} className="mx-auto max-h-[70vh] max-w-full rounded-2xl border border-dtsc-border object-contain" />
        ) : canPreviewPdf ? <iframe src={href} title={label} className="h-[70vh] w-full rounded-2xl border border-dtsc-border bg-white" /> : <p className="text-sm text-dtsc-muted">Aperçu non disponible pour ce type de fichier. Utilisez le téléchargement.</p>}
      </Dialog>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

async function buildPayloadWithUploads(form: HTMLFormElement) {
  const formData = new FormData(form);
  const payload: Record<string, FormDataEntryValue> = {};
  const uploadEntries = Array.from(formData.entries()).filter(([key, value]) => key.endsWith("__file") && value instanceof File && value.size > 0);
  for (const [key, value] of formData.entries()) {
    if (key === "isMedicalProject") continue;
    if (!key.endsWith("__file")) {
      const existing = payload[key];
      payload[key] = existing ? `${existing}, ${value}` : value;
    }
  }
  for (const [key, value] of uploadEntries) {
    const targetName = key.replace(/__file$/, "");
    const fileData = new FormData();
    fileData.set("file", value);
    const response = await fetch("/api/admin/operation-files", { method: "POST", body: fileData });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) throw new Error(body?.error || "Import de la pièce justificative impossible.");
    payload[targetName] = body.url;
  }
  return payload;
}

function recordFromRaw(dataset: OperationDataset, record: Record<string, unknown>): OperationRecord {
  const title = pickString(record, ["title", "fullName", "employeeName", "name", "invoiceNumber", "tag"]) || dataset.label;
  const subtitle = pickString(record, ["department", "jobTitle", "category", "counterparty", "requesterName", "location", "ownerDepartment"]);
  const amount = pickNumber(record, ["amount", "netAmount", "monthlyCompensation", "estimatedAmount", "currentBalance"]);
  const operationAttachmentCandidate = pickString(record, ["href", "associatedDocuments", "attachmentUrl", "documentUrl", "documentationUrl", "fileUrl"]);
  const operationAttachmentHref = isAttachmentHref(operationAttachmentCandidate) ? operationAttachmentCandidate : "";
  const meta = compactStrings([
    pickString(record, ["project", "relatedProject", "selectedVendorName", "assignedTo", "ownerName"]),
    pickString(record, ["priority", "urgency", "riskLevel", "condition", "complianceStatus", "budgetStatus"]),
    pickString(record, ["accountName", "budgetName", "departmentName"]),
  ]);
  return {
    id: String(record.id || ""),
    title,
    subtitle,
    status: String(record.status || "ACTIVE"),
    amount,
    currency: typeof record.currency === "string" ? record.currency : "USD",
    notes: typeof record.notes === "string" ? record.notes : null,
    createdAt: String(record.createdAt || new Date().toISOString()),
    meta,
    href: operationAttachmentHref ? operationAttachmentHref : typeof record.invoiceId === "string" ? `/api/invoices/${record.invoiceId}/pdf` : dataset.id === "payrolls" && typeof record.id === "string" ? `/api/admin/payrolls/${record.id}/pdf` : null,
    hrefLabel: typeof record.hrefLabel === "string" ? record.hrefLabel : operationAttachmentHref ? "Document associé" : typeof record.invoiceId === "string" ? "Télécharger la facture" : dataset.id === "payrolls" ? "Télécharger le bulletin de paie" : null,
    values: Object.fromEntries(dataset.fields.map((field) => [field.name, stringifyValue(record[field.name])])),
  };
}

function stringifyValue(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") return String(value);
  }
  return "";
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") return Number(value);
  }
  return null;
}

function isAttachmentHref(value: string) {
  return value.startsWith("/api/") || value.startsWith("http://") || value.startsWith("https://");
}
