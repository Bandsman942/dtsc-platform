"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ClipboardList, Download, Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import type { OperationDataset, OperationField, OperationRecord } from "@/lib/admin-operations-types";
import { formatEnumLabel } from "@/lib/labels";

export function OperationsAdminPanel({
  eyebrow,
  title,
  description,
  playbook,
  datasets,
  canEdit,
}: {
  eyebrow: string;
  title: string;
  description: string;
  playbook: string[];
  datasets: OperationDataset[];
  canEdit: boolean;
}) {
  const [itemsByDataset, setItemsByDataset] = useState(() =>
    Object.fromEntries(datasets.map((dataset) => [dataset.id, dataset.records]))
  );
  const [message, setMessage] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

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
      const title = (item.values?.title || item.title || "").trim().toLocaleLowerCase("fr-FR");
      const impactsRevenue = category === "IN" && (item.status === "VALIDATED" || item.status === "PAID") && title !== "capital de départ";
      return impactsRevenue ? sum + (item.amount || 0) : sum;
    }, 0);
    const transactions = visibleItemsByDataset.transactions || [];
    const financialTransactions = transactions.filter((item) => item.status === "VALIDATED" || item.status === "PAID");
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
    const activeRecords = records.filter((item) => !isClosedStatus(item.status)).length;
    const attentionItems = records.filter((item) => needsAttention(item)).length;
    const taskRecords = visibleItemsByDataset.tasks || [];
    const blockedTasks = taskRecords.filter((item) => item.status === "BLOCKED" || item.status === "LATE").length;
    const operationalExecution = taskRecords.length
      ? Math.round((taskRecords.filter((item) => item.status === "COMPLETED" || item.status === "VALIDATED").length / taskRecords.length) * 100)
      : 0;
    const datasetCounts = datasets.map((dataset) => ({ label: dataset.label, count: (visibleItemsByDataset[dataset.id] || []).length }));
    const maxCount = Math.max(1, ...datasetCounts.map((item) => item.count));
    return { records: records.length, activeRecords, attentionItems, blockedTasks, hrcfoRevenue, operationalExecution, datasetCounts, maxCount, totalIn, totalOut, startingCapital, accountsBalance, budgetTotal, budgetSpent, netPayrollPaid, financialTransactionCount: financialTransactions.length };
  }, [datasets, visibleItemsByDataset]);
  const isHrcfoPanel = datasets.some((dataset) => dataset.id === "transactions" && dataset.endpoint.includes("/hr-cfo/"));
  const isCooPanel = datasets.some((dataset) => dataset.endpoint.includes("/admin/coo/"));
  const isCeoPanel = datasets.some((dataset) => dataset.endpoint.includes("/admin/ceo/"));

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
    <section className="space-y-5">
      <div className="dtsc-card p-6">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-600">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-black text-dtsc-ink">{title}</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-dtsc-muted">{description}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Metric label={isCooPanel ? "Éléments COO suivis" : "Dossiers suivis"} value={totals.records} />
          <Metric
            label={isCooPanel || isCeoPanel ? "Taux d'exécution" : isHrcfoPanel ? "Chiffre d'affaires" : "Éléments actifs"}
            value={isCooPanel || isCeoPanel ? `${totals.operationalExecution}%` : isHrcfoPanel ? `${totals.hrcfoRevenue.toFixed(2)} USD` : totals.activeRecords}
          />
          <Metric
            label={isCooPanel ? "Tâches bloquées/retard" : isCeoPanel ? "Décisions à suivre" : isHrcfoPanel ? "Transactions impactantes" : "Priorités à traiter"}
            value={isCooPanel ? totals.blockedTasks : isHrcfoPanel ? totals.financialTransactionCount : totals.attentionItems}
          />
        </div>
        {isHrcfoPanel && (
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Metric label="Entrées validées/payées" value={`${totals.totalIn.toFixed(2)} USD`} />
            <Metric label="Sorties validées/payées" value={`${totals.totalOut.toFixed(2)} USD`} />
            <Metric label="Solde global comptes" value={`${totals.accountsBalance.toFixed(2)} USD`} />
            <Metric label="Capital de départ" value={`${totals.startingCapital.toFixed(2)} USD`} />
            <Metric label="Budget total" value={`${totals.budgetTotal.toFixed(2)} USD`} />
            <Metric label="Budget consommé" value={`${totals.budgetSpent.toFixed(2)} USD`} />
            <Metric label="Budget restant" value={`${Math.max(0, totals.budgetTotal - totals.budgetSpent).toFixed(2)} USD`} />
            <Metric label="Net paie validé/payé" value={`${totals.netPayrollPaid.toFixed(2)} USD`} />
          </div>
        )}
        {isCooPanel && (
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Metric label="Tâches suivies" value={(visibleItemsByDataset.tasks || []).length} />
            <Metric label="Tâches terminées" value={(visibleItemsByDataset.tasks || []).filter((item) => item.status === "COMPLETED" || item.status === "VALIDATED").length} />
            <Metric label="Blocages ouverts" value={(visibleItemsByDataset.blockers || []).filter((item) => item.status !== "RESOLVED" && item.status !== "CANCELED").length} />
            <Metric label="Workflows partagés" value={(visibleItemsByDataset.workflows || []).filter((item) => item.meta.some((entry) => entry.includes("partage"))).length} />
          </div>
        )}
        <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h3 className="font-black text-dtsc-ink">Filtre de période</h3>
              <p className="mt-1 text-sm text-dtsc-muted">Affinez immédiatement les blocs, volumes et KPIs selon les dates de création.</p>
            </div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="grid min-w-0 gap-1 text-xs font-bold uppercase tracking-[0.1em] text-dtsc-muted">
                Début
                <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-11 rounded-xl bg-dtsc-surface text-dtsc-ink" />
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-bold uppercase tracking-[0.1em] text-dtsc-muted">
                Fin
                <Input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="h-11 rounded-xl bg-dtsc-surface text-dtsc-ink" />
              </label>
              <Button type="button" variant="outline" onClick={() => { setDateStart(""); setDateEnd(""); }} className="self-end rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                <CalendarDays className="h-4 w-4" />
                Tout afficher
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">Flux recommandé</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {playbook.map((step, index) => (
              <span key={step} className="rounded-full border border-dtsc-border bg-dtsc-surface px-3 py-2 text-xs font-bold text-dtsc-muted">
                {index + 1}. {step}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <h3 className="font-black text-dtsc-ink">Lecture rapide des volumes</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {totals.datasetCounts.map((item) => (
              <div key={item.label} className="min-w-0">
                <div className="flex items-center justify-between gap-3 text-xs font-black text-dtsc-muted">
                  <span className="truncate">{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-dtsc-soft">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(4, (item.count / totals.maxCount) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Accordion>
        {datasets.map((dataset) => (
          <AccordionItem
            key={dataset.id}
            title={`${dataset.label} · ${(visibleItemsByDataset[dataset.id] || []).length}`}
          >
            <DatasetCard
              dataset={dataset}
              records={visibleItemsByDataset[dataset.id] || []}
              canEdit={canEdit}
              onCreate={createRecord}
              onUpdate={updateRecord}
              onRemove={removeRecord}
            />
          </AccordionItem>
        ))}
      </Accordion>

      <Dialog open={Boolean(message)} title={title} onClose={() => setMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
      </Dialog>
    </section>
  );
}

function isInDateRange(value: string, start: string, end: string) {
  if (!start && !end) {
    return true;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return true;
  }
  if (start) {
    const startTime = new Date(`${start}T00:00:00`).getTime();
    if (time < startTime) {
      return false;
    }
  }
  if (end) {
    const endTime = new Date(`${end}T23:59:59.999`).getTime();
    if (time > endTime) {
      return false;
    }
  }
  return true;
}

function isClosedStatus(status: string) {
  return /ARCHIVED|CANCELED|CANCELLED|CLOSED|COMPLETED|RESOLVED|DELIVERED|RECEIVED|SIGNED|PAID|VALIDATED|APPROVED|TERMINATED|DONE/i.test(status);
}

function needsAttention(record: OperationRecord) {
  const status = `${record.status} ${record.meta.join(" ")}`;
  return /BLOCKED|LATE|OVERDUE|CRITICAL|URGENT|LOW_STOCK|OUT_OF_STOCK|MISSING|EXPIRED|REJECTED|TO_CORRECT|WAITING|PENDING|SUBMITTED|OPEN|ESCALATED|INSUFFICIENT/i.test(status);
}

function DatasetCard({
  dataset,
  records,
  canEdit,
  onCreate,
  onUpdate,
  onRemove,
}: {
  dataset: OperationDataset;
  records: OperationRecord[];
  canEdit: boolean;
  onCreate: (dataset: OperationDataset, form: HTMLFormElement) => Promise<void>;
  onUpdate: (dataset: OperationDataset, record: OperationRecord, form: HTMLFormElement) => Promise<void>;
  onRemove: (dataset: OperationDataset, record: OperationRecord) => Promise<void>;
}) {
  const getSearchText = useCallback((record: OperationRecord) => {
    return [record.title, record.subtitle, record.status, record.notes, ...record.meta].join(" ");
  }, []);
  const list = useSmartList({ items: records, pageSize: 5, getSearchText });
  const [createOpen, setCreateOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(dataset, event.currentTarget);
    setCreateOpen(false);
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_72%,transparent)] p-4 backdrop-blur-xl sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-500">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-dtsc-ink">{dataset.label}</h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{dataset.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
        <p className="text-sm font-bold text-dtsc-muted">Le formulaire est ouvert dans une fenêtre dédiée pour garder une liste mobile propre.</p>
        <Button type="button" disabled={!canEdit} onClick={() => setCreateOpen(true)} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Plus className="h-4 w-4" />
          Nouveau
        </Button>
      </div>

      <div className="mt-5">
        <ListControls
          query={list.query}
          onQueryChange={list.setQuery}
          page={list.page}
          pageCount={list.pageCount}
          totalCount={list.totalCount}
          filteredCount={list.filteredCount}
          placeholder={`Rechercher dans ${dataset.label.toLowerCase()}...`}
          onPageChange={list.setPage}
        />
        <div className="space-y-3">
          {list.paginatedItems.map((record) => (
            <RecordCard key={record.id} dataset={dataset} record={record} canEdit={canEdit} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
          {records.length === 0 && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun élément enregistré.</p>}
          {records.length > 0 && list.filteredCount === 0 && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun résultat pour cette recherche.</p>}
        </div>
      </div>
      <Dialog open={createOpen} title={`Nouveau: ${dataset.label}`} description="Remplissez le formulaire puis enregistrez l'élément." onClose={() => setCreateOpen(false)} className="h-[92dvh] max-w-5xl">
        <OperationForm fields={dataset.fields} disabled={!canEdit} onSubmit={submit} submitLabel="Ajouter" submitIcon="plus" />
      </Dialog>
    </article>
  );
}

function RecordCard({
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
  const attachmentHref = typeof record.href === "string" && record.href.length > 0 ? record.href : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(dataset, record, event.currentTarget);
    setEditOpen(false);
  }

  return (
    <div className="dtsc-glass-list-item rounded-2xl p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{formatEnumLabel(record.status)}</p>
          <h4 className="mt-1 break-words font-black text-dtsc-ink">{record.title}</h4>
          {record.subtitle && <p className="mt-1 text-sm text-dtsc-muted">{record.subtitle}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {record.meta.map((item) => (
              <span key={item} className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-bold text-dtsc-blue">{item}</span>
            ))}
          </div>
        </div>
        {record.amount != null && (
          <span className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm font-black text-dtsc-ink">
            {record.amount.toFixed(2)} {record.currency || "USD"}
          </span>
        )}
      </div>
      {record.notes && <p className="mt-3 text-sm leading-6 text-dtsc-muted">{record.notes}</p>}
      {attachmentHref && <FileAttachmentPreview href={attachmentHref} label={record.hrefLabel || "Document joint"} />}
      <div className="mt-4 flex justify-end">
        <ActionMenu
          items={[
            ...(canEdit ? [{ key: "edit", label: "Modifier", icon: Save, onSelect: () => setEditOpen(true) }] : []),
            ...(attachmentHref ? [{ key: "download", label: "Télécharger le fichier", icon: Download, onSelect: () => window.open(attachmentHref, "_blank", "noopener,noreferrer") }] : []),
            ...(canEdit ? [{ key: "delete", label: "Supprimer", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }] : []),
          ]}
        />
      </div>
      <Dialog
        open={editOpen}
        title={`Modifier: ${record.title}`}
        description="Mettez à jour les informations de l'opération puis envoyez la modification au serveur."
        onClose={() => setEditOpen(false)}
        className="h-[92dvh] max-w-5xl"
      >
        <OperationForm
          fields={dataset.fields}
          defaults={{ ...(record.values || {}), status: record.status, notes: record.notes || "" }}
          disabled={!canEdit}
          onSubmit={submit}
          submitLabel="Enregistrer les modifications"
          submitIcon="save"
        />
      </Dialog>
      <Dialog
        open={confirmDelete}
        title="Supprimer cet élément"
        description="Cette action retire l’élément du suivi opérationnel."
        onClose={() => setConfirmDelete(false)}
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-ink">
              Annuler
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setConfirmDelete(false);
                await onRemove(dataset, record);
              }}
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
            >
              Supprimer
            </Button>
          </>
        )}
      >
        <p className="text-sm leading-7 text-dtsc-muted">
          Confirmez la suppression de <span className="font-black text-dtsc-ink">{record.title}</span>.{" "}
          Les journaux d&apos;audit conserveront la trace de l&apos;action.
        </p>
      </Dialog>
    </div>
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
      if (field.type !== "select") {
        continue;
      }
      const selected = field.options?.find((option) => option.value === defaults[field.name]);
      if (selected?.email) {
        values[field.name] = selected.email;
      }
    }
    return values;
  }, [defaults, fields]);
  const [previewValues, setPreviewValues] = useState(initialPreviews);

  function setSelectPreview(fieldName: string, email: string) {
    setPreviewValues((current) => ({ ...current, [fieldName]: email }));
  }

  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          disabled={disabled}
          defaultValue={defaults[field.name] || ""}
          previewValue={field.previewFor ? previewValues[field.previewFor] || "" : ""}
          onSelectPreview={setSelectPreview}
        />
      ))}
      <div className="md:col-span-2">
        <Button disabled={disabled} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
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
}: {
  field: OperationField;
  disabled: boolean;
  defaultValue: string;
  previewValue: string;
  onSelectPreview: (fieldName: string, email: string) => void;
}) {
  const className = "w-full min-w-0 max-w-full truncate rounded-xl border border-dtsc-border bg-[color-mix(in_srgb,var(--dtsc-surface)_82%,transparent)] px-3 py-2 text-sm text-dtsc-ink backdrop-blur-xl";
  const label = (
    <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
      {field.label}
    </span>
  );

  if (field.type === "hidden") {
    return <input type="hidden" name={field.name} value={defaultValue || field.placeholder || ""} />;
  }

  if (field.type === "preview") {
    return (
      <label className="grid min-w-0 gap-1">
        {label}
        <Input value={previewValue} readOnly disabled placeholder={field.placeholder || "Sélectionnez d'abord un collaborateur"} />
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </label>
    );
  }

  if (field.type === "file") {
    return (
      <label className="grid min-w-0 gap-1 md:col-span-2">
        {label}
        {defaultValue && (
          <a href={defaultValue} target="_blank" rel="noreferrer" className="w-fit rounded-xl bg-dtsc-soft px-3 py-2 text-xs font-black text-dtsc-blue underline-offset-4 hover:underline">
            Voir le fichier existant
          </a>
        )}
        <input type="hidden" name={field.name} value={defaultValue} />
        <input
          name={`${field.name}__file`}
          type="file"
          disabled={disabled}
          className={`${className} file:mr-3 file:rounded-lg file:border-0 file:bg-dtsc-blue file:px-3 file:py-1 file:text-xs file:font-black file:text-white`}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,application/pdf,image/png,image/jpeg,image/webp"
        />
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="grid min-w-0 gap-1 md:col-span-2">
        {label}
        <textarea name={field.name} required={field.required} disabled={disabled} defaultValue={defaultValue} placeholder={field.placeholder} className={`${className} min-h-20`} />
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </label>
    );
  }

  if (field.type === "select" || field.type === "select-multiple") {
    const defaultValues = defaultValue.split(",").map((value) => value.trim()).filter(Boolean);
    return (
      <label className="grid min-w-0 gap-1">
        {label}
        <select
          name={field.name}
          required={field.required}
          disabled={disabled || field.readOnly}
          multiple={field.type === "select-multiple"}
          defaultValue={field.type === "select-multiple" ? defaultValues : defaultValue}
          className={`${className} ${field.type === "select-multiple" ? "min-h-28" : ""}`}
          onChange={(event) => {
            const email = event.currentTarget.selectedOptions[0]?.dataset.email || "";
            onSelectPreview(field.name, email);
          }}
        >
          {!field.required && field.type !== "select-multiple" && <option value="">Non renseigné</option>}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value} data-email={option.email || ""}>{option.label}</option>
          ))}
        </select>
        {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
      </label>
    );
  }

  return (
    <label className="grid min-w-0 gap-1">
      {label}
      <Input name={field.name} type={field.type} required={field.required} disabled={disabled || field.readOnly} defaultValue={defaultValue} placeholder={field.placeholder} />
      {field.helperText && <span className="text-xs leading-5 text-dtsc-muted">{field.helperText}</span>}
    </label>
  );
}

function FileAttachmentPreview({ href, label }: { href: string; label: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const lowerHref = href.toLowerCase();
  const canPreviewImage = /\.(png|jpe?g|webp)(\?|$)/i.test(lowerHref);
  const canPreviewPdf = /\.pdf(\?|$)/i.test(lowerHref) || lowerHref.includes("application/pdf");
  return (
    <div className="mt-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-dtsc-ink">
          <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
          <span className="truncate">{label}</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {(canPreviewImage || canPreviewPdf) && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} className="rounded-xl border-dtsc-border bg-dtsc-page text-dtsc-blue">
              <Eye className="h-4 w-4" />
              Aperçu
            </Button>
          )}
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#002b5b] px-3 py-2 text-xs font-black text-white shadow-[0_10px_30px_rgba(0,43,91,0.18)] transition hover:-translate-y-0.5 hover:bg-[#001736]">
            <Download className="h-4 w-4" />
            Télécharger
          </a>
        </div>
      </div>
      <Dialog open={previewOpen} title={`Aperçu: ${label}`} onClose={() => setPreviewOpen(false)} className="max-w-5xl">
        {canPreviewImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={label} className="mx-auto max-h-[70vh] max-w-full rounded-2xl border border-dtsc-border object-contain" />
        ) : canPreviewPdf ? (
          <iframe src={href} title={label} className="h-[70vh] w-full rounded-2xl border border-dtsc-border bg-white" />
        ) : (
          <p className="text-sm text-dtsc-muted">Aperçu non disponible pour ce type de fichier. Utilisez le téléchargement.</p>
        )}
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

async function buildPayloadWithUploads(form: HTMLFormElement) {
  const formData = new FormData(form);
  const payload: Record<string, FormDataEntryValue> = {};
  const uploadEntries = Array.from(formData.entries()).filter(([key, value]) => key.endsWith("__file") && value instanceof File && value.size > 0);

  for (const [key, value] of formData.entries()) {
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
    if (!response.ok || !body?.url) {
      throw new Error(body?.error || "Import de la pièce justificative impossible.");
    }
    payload[targetName] = body.url;
  }

  return payload;
}

function recordFromRaw(dataset: OperationDataset, record: Record<string, unknown>): OperationRecord {
  const title = pickString(record, ["title", "fullName", "employeeName", "name", "invoiceNumber", "tag"]) || dataset.label;
  const subtitle = pickString(record, ["department", "jobTitle", "category", "counterparty", "requesterName", "location", "ownerDepartment"]);
  const amount = pickNumber(record, ["amount", "netAmount", "monthlyCompensation", "estimatedAmount", "currentBalance"]);
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
    href: typeof record.href === "string"
      ? record.href
      : typeof record.invoiceId === "string"
        ? `/api/invoices/${record.invoiceId}/pdf`
        : dataset.id === "payrolls" && typeof record.id === "string"
          ? `/api/admin/payrolls/${record.id}/pdf`
          : null,
    hrefLabel: typeof record.hrefLabel === "string"
      ? record.hrefLabel
      : typeof record.invoiceId === "string"
        ? "Télécharger la facture"
        : dataset.id === "payrolls"
          ? "Télécharger le bulletin de paie"
          : null,
    values: Object.fromEntries(dataset.fields.map((field) => [field.name, stringifyValue(record[field.name])])),
  };
}

function stringifyValue(value: unknown) {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") {
      return String(value);
    }
  }
  return "";
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value !== "") {
      return Number(value);
    }
  }
  return null;
}
