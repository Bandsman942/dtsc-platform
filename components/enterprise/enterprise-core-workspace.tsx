"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { BadgeCheck, CircleHelp, Clock3, Eye, Link2, MessageSquare, Play, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { CollapsibleThread } from "@/components/workspace/collapsible-thread";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { useSmartList } from "@/lib/hooks/use-smart-list";

type CoreRecord = {
  id: string;
  moduleCode: string;
  recordType: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  validatorUserId: string | null;
  dueAt: string | null;
  sourceModule: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  updatedAt: string;
  events: Array<{ id: string; summary: string; eventType: string; createdAt: string }>;
  comments: Array<{ id: string; content: string; createdAt: string }>;
};

type ChoiceItem = { id: string; label: string };

const TYPE_LABELS: Record<string, string> = {
  TASK: "Tâche", OPERATION: "Opération", MEETING: "Réunion", MINUTES: "Compte rendu", INTERNAL_REQUEST: "Demande interne",
  VALIDATION: "Validation", DOCUMENT: "Référence documentaire", REPORT: "Rapport", BUDGET: "Budget", EXPENSE: "Dépense", SUPPLIER: "Fournisseur", PURCHASE: "Achat", NOTICE: "Notification métier",
};
const STATUS_LABELS: Record<string, string> = {
  OPEN: "Ouvert", SUBMITTED: "Soumis", IN_PROGRESS: "En cours", PENDING_VALIDATION: "En validation", APPROVED: "Validé", REJECTED: "Rejeté", COMPLETED: "Terminé", CANCELLED: "Annulé", ARCHIVED: "Archivé",
};
const PRIORITY_LABELS: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Haute", CRITICAL: "Critique" };

export function EnterpriseCoreWorkspace({
  organizationId,
  moduleCode,
  title,
  description,
  recordTypes,
  initialRecords,
  members,
  departments,
  canCreate,
  canManage,
}: {
  organizationId: string;
  moduleCode: string;
  title: string;
  description: string;
  recordTypes: readonly string[];
  initialRecords: CoreRecord[];
  members: ChoiceItem[];
  departments: ChoiceItem[];
  canCreate: boolean;
  canManage: boolean;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<CoreRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<{ record: CoreRecord; action: string } | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  useToastMessage(message);
  const list = useSmartList({
    items: records,
    pageSize: 12,
    getSearchText: useCallback((item: CoreRecord) => `${item.title} ${item.description || ""} ${TYPE_LABELS[item.recordType] || item.recordType} ${STATUS_LABELS[item.status] || item.status}`, []),
  });

  async function reload() {
    const response = await fetch(`/api/enterprise/${organizationId}/core?moduleCode=${encodeURIComponent(moduleCode)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { records?: CoreRecord[]; message?: string } | null;
    if (response.ok && body?.records) setRecords(body.records);
    else setMessage(body?.message || "Actualisation impossible.");
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch(`/api/enterprise/${organizationId}/core`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, moduleCode }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Élément enregistré et ajouté à l’historique." : body?.message || "Enregistrement impossible.");
    if (response.ok) {
      setFormOpen(false);
      await reload();
    }
  }

  async function runAction() {
    if (!pendingAction) return;
    const response = await fetch(`/api/enterprise/${organizationId}/core/${pendingAction.record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: pendingAction.action, comment: comment.trim() || undefined }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setMessage(response.ok ? "Action enregistrée et historisée." : body?.message || "Action impossible.");
    if (response.ok) {
      setPendingAction(null);
      setDetail(null);
      setComment("");
      await reload();
    }
  }

  return (
    <ModuleSection
      title={title}
      description={description}
      count={`${list.filteredCount}/${records.length}`}
      action={canCreate ? <Button className="rounded-xl bg-dtsc-blue text-white" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Créer un élément</Button> : undefined}
    >
      <ListControls query={list.query} onQueryChange={list.setQuery} page={list.page} pageCount={list.pageCount} totalCount={list.totalCount} filteredCount={list.filteredCount} onPageChange={list.setPage} placeholder="Rechercher par titre, type, statut ou description..." />

      {list.paginatedItems.length ? (
        <BusinessList ariaLabel={title}>
          {list.paginatedItems.map((record) => (
            <BusinessListItem
              key={record.id}
              title={record.title}
              status={<StatusBadge tone={statusTone(record.status)}>{STATUS_LABELS[record.status] || record.status}</StatusBadge>}
              meta={(
                <span className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                  <span>{TYPE_LABELS[record.recordType] || record.recordType}</span>
                  <span>· {PRIORITY_LABELS[record.priority] || record.priority}</span>
                  {record.dueAt ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(record.dueAt)}</span> : null}
                  {record.sourceModule ? <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />{record.sourceModule}</span> : null}
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{record.comments.length}</span>
                </span>
              )}
              description={record.description || "Aucune précision complémentaire n’a été ajoutée."}
              onOpen={() => setDetail(record)}
              openLabel={`Ouvrir ${record.title}`}
              actions={<ContextActions label={`Actions pour ${record.title}`} actions={actionsFor(record, canCreate, canManage, setDetail, setPendingAction)} />}
            />
          ))}
        </BusinessList>
      ) : records.length ? (
        <EmptyState compact title="Aucun résultat" description="Aucun élément ne correspond à cette recherche." />
      ) : (
        <EmptyState compact title="Aucun contenu" description="Aucun élément n’est encore enregistré dans ce module." action={canCreate ? <Button type="button" variant="outline" onClick={() => setFormOpen(true)} className="rounded-xl border-dtsc-border">Créer le premier élément</Button> : undefined} />
      )}

      <CoreCreateDialog open={formOpen} close={() => setFormOpen(false)} submit={createRecord} recordTypes={recordTypes} members={members} departments={departments} />
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title || "Détail"} description="Historique récent et informations de suivi de cet élément." className="h-[92dvh] max-w-4xl">
        {detail ? <CoreDetail record={detail} /> : null}
      </Dialog>
      <Dialog open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} title="Confirmer l’action" description="Cette décision sera conservée dans l’historique et le journal d’audit.">
        <Field label="Commentaire ou motif" help="Expliquez la décision pour faciliter le suivi. Un motif est obligatoire en cas de rejet.">
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-28 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" />
        </Field>
        <Button className="mt-4 bg-dtsc-blue text-white" onClick={() => void runAction()} disabled={pendingAction?.action === "REJECT" && comment.trim().length < 2}>Confirmer</Button>
      </Dialog>
    </ModuleSection>
  );
}

function CoreCreateDialog({ open, close, submit, recordTypes, members, departments }: { open: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => Promise<void>; recordTypes: readonly string[]; members: ChoiceItem[]; departments: ChoiceItem[] }) {
  return (
    <Dialog open={open} onClose={close} title="Nouvel élément de gestion" description="Les informations seront isolées dans l’entreprise active et ajoutées à l’historique." className="h-[94dvh] max-w-5xl">
      <form onSubmit={submit} className="grid min-w-0 gap-4 overflow-x-hidden">
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Field label="Type d’élément" help="Choisissez la nature métier correspondant au suivi à créer."><Select name="recordType" required items={recordTypes.map((id) => ({ id, label: TYPE_LABELS[id] || id }))} /></Field>
          <Field label="Titre facilement identifiable" help="Résumez clairement l’action, la demande ou l’objet à traiter."><Input name="title" required minLength={3} /></Field>
          <Field label="Priorité" help="Indique le niveau d’attention attendu par les responsables."><Select name="priority" required items={Object.entries(PRIORITY_LABELS).map(([id, label]) => ({ id, label }))} /></Field>
          <Field label="Échéance" help="Date attendue de traitement ou de décision."><Input name="dueAt" type="datetime-local" /></Field>
          <Field label="Responsable" help="Collaborateur chargé du traitement."><Select name="assignedToUserId" items={members} /></Field>
          <Field label="Validateur" help="Collaborateur attendu pour la décision finale, si nécessaire."><Select name="validatorUserId" items={members} /></Field>
          <Field label="Département concerné" help="Service responsable ou bénéficiaire de cet élément."><Select name="departmentId" items={departments} /></Field>
          <Field label="Montant indicatif" help="Montant utile pour un budget, une dépense ou un achat."><Input name="amount" type="number" min="0" step="0.01" /></Field>
        </div>
        <Field label="Description opérationnelle" help="Décrivez le besoin, le résultat attendu et les informations utiles au traitement."><textarea name="description" className="min-h-32 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field>
        <Button className="w-full bg-dtsc-blue text-white sm:w-fit"><Send className="h-4 w-4" />Enregistrer</Button>
      </form>
    </Dialog>
  );
}

function CoreDetail({ record }: { record: CoreRecord }) {
  return (
    <div className="grid min-w-0 gap-5">
      <section className="border-b border-dtsc-border pb-4">
        <h3 className="font-black text-dtsc-ink">Informations</h3>
        <p className="mt-2 break-words text-sm leading-6 text-dtsc-muted">{record.description || "Aucune précision complémentaire."}</p>
        <div className="mt-3 flex flex-wrap gap-2"><StatusBadge>{TYPE_LABELS[record.recordType] || record.recordType}</StatusBadge><StatusBadge tone={statusTone(record.status)}>{STATUS_LABELS[record.status] || record.status}</StatusBadge><StatusBadge>{PRIORITY_LABELS[record.priority] || record.priority}</StatusBadge></div>
      </section>
      <section>
        <h3 className="font-black text-dtsc-ink">Historique récent</h3>
        {record.events.length ? (
          <BusinessList ariaLabel="Historique récent" className="mt-2">
            {record.events.map((event) => <BusinessListItem key={event.id} title={event.summary} status={<StatusBadge>{STATUS_LABELS[event.eventType] || event.eventType}</StatusBadge>} meta={formatDate(event.createdAt)} />)}
          </BusinessList>
        ) : <EmptyState compact title="Aucun événement récent" />}
      </section>
      <CollapsibleThread count={record.comments.length} label="commentaire(s)" defaultOpen={false}>
        {record.comments.length ? (
          <BusinessList ariaLabel="Commentaires de l’élément">
            {record.comments.map((item) => <BusinessListItem key={item.id} title={item.content} meta={formatDate(item.createdAt)} />)}
          </BusinessList>
        ) : <EmptyState compact title="Aucun commentaire" description="Aucun commentaire n’a encore été ajouté à cet élément." />}
      </CollapsibleThread>
    </div>
  );
}

function actionsFor(record: CoreRecord, canCreate: boolean, canManage: boolean, detail: (record: CoreRecord) => void, action: (value: { record: CoreRecord; action: string }) => void): BusinessContextAction[] {
  const items: BusinessContextAction[] = [{ id: "details", label: "Voir le détail", icon: Eye, onSelect: () => detail(record) }];
  if (!canCreate) return items;
  items.push({ id: "comment", label: "Ajouter un commentaire", icon: MessageSquare, onSelect: () => action({ record, action: "COMMENT" }) });
  if (record.status === "OPEN" || record.status === "SUBMITTED") items.push({ id: "start", label: "Commencer le traitement", icon: Play, onSelect: () => action({ record, action: "START" }) });
  if (!["COMPLETED", "APPROVED", "CANCELLED"].includes(record.status)) items.push({ id: "validation", label: "Demander une validation", icon: Send, onSelect: () => action({ record, action: "REQUEST_VALIDATION" }) });
  if (canManage && record.status === "PENDING_VALIDATION") {
    items.push({ id: "approve", label: "Valider", icon: BadgeCheck, onSelect: () => action({ record, action: "APPROVE" }) });
    items.push({ id: "reject", label: "Rejeter", destructive: true, separatorBefore: true, onSelect: () => action({ record, action: "REJECT" }) });
  }
  if (!["COMPLETED", "APPROVED", "CANCELLED"].includes(record.status)) items.push({ id: "complete", label: "Marquer terminé", icon: BadgeCheck, onSelect: () => action({ record, action: "COMPLETE" }) });
  return items;
}

function statusTone(status: string): StatusBadgeTone {
  if (/REJECTED|CANCELLED|CRITICAL/i.test(status)) return "danger";
  if (/PENDING|SUBMITTED|OPEN/i.test(status)) return "warning";
  if (/APPROVED|COMPLETED|ARCHIVED/i.test(status)) return "success";
  if (/IN_PROGRESS/i.test(status)) return "info";
  return "neutral";
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <label className="grid min-w-0 gap-1"><span className="flex min-w-0 items-center gap-1 text-xs font-black uppercase text-dtsc-muted"><span className="min-w-0 break-words">{label}</span><span title={help} aria-label={`${label} : ${help}`} className="shrink-0 cursor-help"><CircleHelp className="h-3.5 w-3.5" /></span></span>{children}</label>;
}
function Select({ name, items, required }: { name: string; items: ChoiceItem[]; required?: boolean }) {
  return <select name={name} required={required} className="h-11 w-full min-w-0 truncate rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="">Sélectionner...</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
