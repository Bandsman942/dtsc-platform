"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { ClipboardList, Plus, Save, Trash2 } from "lucide-react";
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

  const totals = useMemo(() => {
    const records = Object.values(itemsByDataset).flat();
    const amount = records.reduce((sum, item) => sum + (item.amount || 0), 0);
    const alerts = records.filter((item) => /OVER|URGENT|CRITICAL|LOW_STOCK|OVERDUE|BLOCKED|MISSING|EXPIRED/i.test(item.status)).length;
    return { records: records.length, amount, alerts };
  }, [itemsByDataset]);

  async function createRecord(dataset: OperationDataset, form: HTMLFormElement) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(dataset.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { record?: Record<string, unknown> } | null;
    setMessage(response.ok ? `${dataset.label}: élément enregistré.` : `${dataset.label}: enregistrement impossible.`);
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
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(`${dataset.endpoint}/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { record?: Record<string, unknown> } | null;
    setMessage(response.ok ? "Statut opérationnel mis à jour." : "Impossible de mettre à jour cet élément.");
    const savedRecord = body?.record;
    if (response.ok && savedRecord) {
      const saved = recordFromRaw(dataset, savedRecord);
      setItemsByDataset((current) => ({
        ...current,
        [dataset.id]: (current[dataset.id] || []).map((item) => item.id === saved.id ? { ...item, status: saved.status, notes: saved.notes } : item),
      }));
    }
  }

  async function removeRecord(dataset: OperationDataset, record: OperationRecord) {
    const response = await fetch(`${dataset.endpoint}/${record.id}`, { method: "DELETE" });
    setMessage(response.ok ? "Élément supprimé." : "Suppression impossible.");
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
          <Metric label="Dossiers suivis" value={totals.records} />
          <Metric label="Valeur suivie" value={`${totals.amount.toFixed(2)} USD`} />
          <Metric label="Alertes opérationnelles" value={totals.alerts} />
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
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {datasets.map((dataset) => (
          <DatasetCard
            key={dataset.id}
            dataset={dataset}
            records={itemsByDataset[dataset.id] || []}
            canEdit={canEdit}
            onCreate={createRecord}
            onUpdate={updateRecord}
            onRemove={removeRecord}
          />
        ))}
      </div>

      <Dialog open={Boolean(message)} title={title} onClose={() => setMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
      </Dialog>
    </section>
  );
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(dataset, event.currentTarget);
  }

  return (
    <article className="dtsc-card min-w-0 p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-500">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-dtsc-ink">{dataset.label}</h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">{dataset.description}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-3 md:grid-cols-2">
        {dataset.fields.map((field) => (
          <FieldInput key={field.name} field={field} disabled={!canEdit} />
        ))}
        <div className="md:col-span-2">
          <Button disabled={!canEdit} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </form>

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(dataset, record, event.currentTarget);
  }

  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
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
      <form onSubmit={submit} className="mt-4 grid gap-2 md:grid-cols-[180px_1fr_auto_auto]">
        <select name="status" defaultValue={record.status} disabled={!canEdit} className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-bold text-dtsc-ink">
          {dataset.statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <Input name="notes" defaultValue={record.notes || ""} placeholder="Note de suivi" disabled={!canEdit} />
        <Button type="submit" disabled={!canEdit} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
          <Save className="h-4 w-4" />
        </Button>
        <Button type="button" disabled={!canEdit} variant="outline" onClick={() => setConfirmDelete(true)} className="rounded-xl border-red-200 text-red-500">
          <Trash2 className="h-4 w-4" />
        </Button>
      </form>
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

function FieldInput({ field, disabled }: { field: OperationField; disabled: boolean }) {
  const className = "rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm text-dtsc-ink";
  const label = (
    <span className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
      {field.label}
    </span>
  );

  if (field.type === "textarea") {
    return (
      <label className="grid gap-1 md:col-span-2">
        {label}
        <textarea name={field.name} required={field.required} disabled={disabled} placeholder={field.placeholder} className={`${className} min-h-20`} />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="grid gap-1">
        {label}
        <select name={field.name} required={field.required} disabled={disabled} className={className}>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="grid gap-1">
      {label}
      <Input name={field.name} type={field.type} required={field.required} disabled={disabled} placeholder={field.placeholder} />
    </label>
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

function recordFromRaw(dataset: OperationDataset, record: Record<string, unknown>): OperationRecord {
  const title = pickString(record, ["title", "fullName", "name", "invoiceNumber", "tag"]) || dataset.label;
  const subtitle = pickString(record, ["department", "jobTitle", "category", "counterparty", "requesterName", "location", "ownerDepartment"]);
  const amount = pickNumber(record, ["amount", "monthlyCompensation", "estimatedAmount"]);
  const meta = compactStrings([
    pickString(record, ["project", "relatedProject", "selectedVendorName", "assignedTo", "ownerName"]),
    pickString(record, ["priority", "urgency", "riskLevel", "condition", "complianceStatus", "budgetStatus"]),
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
  };
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
