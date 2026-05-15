"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CircleAlert, ClipboardList, GitBranch, MessageSquare, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type EntityType = "TASK" | "OPERATION" | "DEPARTMENT_REQUEST" | "BLOCKER" | "MEETING" | "REPORT" | "WORKFLOW" | "PAYROLL" | "CEO_OBJECTIVE" | "CEO_SUPERVISION";

type ActivityItem = {
  id: string;
  entityType: EntityType;
  title: string;
  status: string;
  detail: string;
  body?: string | null;
  date: string;
  href?: string | null;
  hrefLabel?: string | null;
  priority?: string | null;
  progress?: number | null;
};

type ActivitySection = {
  id: string;
  title: string;
  description: string;
  items: ActivityItem[];
};

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  author: { name: string; role: string; avatarUrl?: string | null };
};

type CollaboratorOption = { id: string; label: string };

export function ActivitiesDashboard({
  sections,
  collaborators,
  operations,
  metrics,
}: {
  sections: ActivitySection[];
  collaborators: CollaboratorOption[];
  operations: CollaboratorOption[];
  metrics: { openTasks: number; completed: number; blocked: number };
}) {
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [activeSection, setActiveSection] = useState<ActivitySection | null>(null);
  const filteredSections = useMemo(() => sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => isInDateRange(item.date, dateStart, dateEnd)),
  })), [dateEnd, dateStart, sections]);

  return (
    <div className="space-y-6">
      <section className="dtsc-panel p-6">
        <p className="text-sm font-bold text-cyan-600">Espace collaborateur</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Activités DTSC</h1>
        <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
          Retrouvez les tâches, opérations internes, demandes inter-départements, réunions, rapports et workflows qui vous sont partagés par l&apos;équipe COO.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Tâches ouvertes" value={metrics.openTasks} />
          <Metric label="Terminées / validées" value={metrics.completed} />
          <Metric label="Points bloqués" value={metrics.blocked} />
        </div>
        <div className="mt-5 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-black text-dtsc-ink">Filtre de période</h2>
              <p className="text-sm text-dtsc-muted">Filtre immédiatement les blocs d&apos;activités selon leur date.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
                Début
                <Input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="h-11 rounded-xl bg-dtsc-surface text-dtsc-ink" />
              </label>
              <label className="grid gap-1 text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">
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
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {filteredSections.map((section) => (
          <button key={section.id} type="button" onClick={() => setActiveSection(section)} className="dtsc-card min-w-0 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_18px_60px_rgba(0,186,217,0.14)]">
            <div className="flex items-start gap-3">
              <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-500">{sectionIcon(section.id)}</span>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-dtsc-ink">{section.title}</h2>
                <p className="text-sm text-dtsc-muted">{section.items.length} élément(s) visible(s) avec le filtre actuel.</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-dtsc-muted">{section.description}</p>
              </div>
            </div>
            <div className="mt-5 max-h-56 space-y-3 overflow-y-auto pr-1">
              {section.items.slice(0, 4).map((item) => <MiniItem key={`${item.entityType}-${item.id}`} item={item} />)}
              {section.items.length === 0 && <p className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm text-dtsc-muted">Aucun élément sur cette période.</p>}
            </div>
          </button>
        ))}
      </div>

      {activeSection && (
        <SectionDialog
          section={activeSection}
          onClose={() => setActiveSection(null)}
          collaborators={collaborators}
          operations={operations}
        />
      )}
    </div>
  );
}

function SectionDialog({ section, onClose, collaborators, operations }: { section: ActivitySection; onClose: () => void; collaborators: CollaboratorOption[]; operations: CollaboratorOption[] }) {
  const [selected, setSelected] = useState<ActivityItem | null>(section.items[0] || null);
  const getSearchText = useCallback((item: ActivityItem) => [item.title, item.status, item.detail, item.body].join(" "), []);
  const list = useSmartList({ items: section.items, pageSize: 8, getSearchText });

  useEffect(() => {
    setSelected(section.items[0] || null);
  }, [section]);

  return (
    <Dialog open={true} title={section.title} description={section.description} onClose={onClose} className="max-w-6xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <ListControls
            query={list.query}
            onQueryChange={list.setQuery}
            page={list.page}
            pageCount={list.pageCount}
            totalCount={list.totalCount}
            filteredCount={list.filteredCount}
            placeholder="Rechercher dans ces activités..."
            onPageChange={list.setPage}
          />
          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {list.paginatedItems.map((item) => (
              <button key={`${item.entityType}-${item.id}`} type="button" onClick={() => setSelected(item)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === item.id && selected.entityType === item.entityType ? "border-cyan-300 bg-cyan-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
                <MiniItem item={item} />
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
          {section.id === "reports" && <ReportComposer collaborators={collaborators} operations={operations} />}
          {section.id === "blockers" && <BlockerComposer operations={operations} />}
          {selected ? <ActivityDetail item={selected} /> : <p className="text-sm text-dtsc-muted">Sélectionnez un élément.</p>}
        </div>
      </div>
    </Dialog>
  );
}

function ActivityDetail({ item }: { item: ActivityItem }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [message, setMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/activities/comments?entityType=${item.entityType}&entityId=${item.id}`);
    const body = (await response.json().catch(() => null)) as { comments?: CommentItem[] } | null;
    setComments(body?.comments || []);
  }, [item.entityType, item.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) {
      return;
    }
    const response = await fetch("/api/activities/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: item.entityType, entityId: item.id, content: message }),
    });
    setStatusMessage(response.ok ? "Commentaire ajouté." : "Impossible d'ajouter le commentaire.");
    if (response.ok) {
      setMessage("");
      await loadComments();
    }
  }

  async function updateTask(status: string) {
    const response = await fetch(`/api/activities/tasks/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress: status === "IN_PROGRESS" ? item.progress || 10 : 100 }),
    });
    setStatusMessage(response.ok ? "Tâche mise à jour." : "Mise à jour impossible.");
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">{formatEnumLabel(item.entityType)} · {formatEnumLabel(item.status)}</p>
        <h3 className="mt-2 text-2xl font-black text-dtsc-ink">{item.title}</h3>
        <p className="mt-2 text-sm text-dtsc-muted">{item.detail}</p>
        {item.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-dtsc-muted">{item.body}</p>}
        {item.href && (
          <a href={item.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-[#002b5b] px-4 py-2 text-sm font-black text-white transition hover:bg-[#001736]">
            {item.hrefLabel || "Ouvrir le document"}
          </a>
        )}
      </div>

      {item.entityType === "TASK" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => updateTask("IN_PROGRESS")} className="rounded-xl bg-[#002b5b] text-white">Marquer en cours</Button>
          <Button type="button" onClick={() => updateTask("COMPLETED")} className="rounded-xl bg-cyan-500 text-[#001736]">Marquer terminée</Button>
        </div>
      )}

      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><MessageSquare className="h-4 w-4 text-cyan-500" /> Commentaires</h4>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{comment.author.name} · {formatEnumLabel(comment.author.role)} · {new Date(comment.createdAt).toLocaleString("fr-FR")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">{comment.content}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p>}
        </div>
        <form onSubmit={addComment} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ajouter un commentaire..." className="rounded-xl bg-dtsc-page" />
          <Button className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /> Envoyer</Button>
        </form>
        {statusMessage && <p className="mt-2 text-xs font-bold text-cyan-600">{statusMessage}</p>}
      </div>
    </div>
  );
}

function BlockerComposer({ operations }: { operations: CollaboratorOption[] }) {
  const [statusMessage, setStatusMessage] = useState("");

  async function createBlocker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/activities/blockers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatusMessage(response.ok ? "Blocage transmis au COO." : "Impossible de transmettre le blocage.");
    if (response.ok) {
      form.reset();
    }
  }

  return (
    <form onSubmit={createBlocker} className="mb-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <h4 className="font-black text-dtsc-ink">Déclarer un blocage</h4>
      <p className="mt-1 text-sm leading-6 text-dtsc-muted">Signalez un obstacle opérationnel pour le faire remonter au COO avec contexte et criticité.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Input name="title" placeholder="Titre du blocage" required className="rounded-xl bg-dtsc-page" />
        <select name="severity" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="MEDIUM">
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => <option key={severity} value={severity}>{formatEnumLabel(severity)}</option>)}
        </select>
        <select name="sourceType" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="TASK">
          {["TASK", "OPERATION", "DEPARTMENT_REQUEST", "HR", "FINANCE", "TECHNICAL", "INFORMATION", "VALIDATION_DELAY", "OTHER"].map((source) => <option key={source} value={source}>{formatEnumLabel(source)}</option>)}
        </select>
        <select name="operationId" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
          <option value="">Opération liée</option>
          {operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}
        </select>
      </div>
      <textarea name="description" required placeholder="Description du blocage..." className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <textarea name="impact" placeholder="Impact sur le travail, le client ou le délai..." className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <textarea name="correctiveAction" placeholder="Action attendue ou solution proposée..." className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <Button className="mt-3 rounded-xl bg-[#002b5b] text-white"><CircleAlert className="h-4 w-4" /> Déclarer</Button>
      {statusMessage && <p className="mt-2 text-xs font-bold text-cyan-600">{statusMessage}</p>}
    </form>
  );
}

function ReportComposer({ collaborators, operations }: { collaborators: CollaboratorOption[]; operations: CollaboratorOption[] }) {
  const [statusMessage, setStatusMessage] = useState("");

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/activities/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setStatusMessage(response.ok ? "Rapport envoyé au collaborateur sélectionné." : "Impossible d'envoyer le rapport.");
    if (response.ok) {
      event.currentTarget.reset();
    }
  }

  return (
    <form onSubmit={createReport} className="mb-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <h4 className="font-black text-dtsc-ink">Envoyer un rapport opérationnel</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Input name="title" placeholder="Titre du rapport" required className="rounded-xl bg-dtsc-page" />
        <select name="recipientEmployeeId" required className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
          <option value="">Destinataire</option>
          {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}
        </select>
        <select name="operationId" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
          <option value="">Opération liée</option>
          {operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}
        </select>
        <select name="priority" className="rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="NORMAL">
          {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
        </select>
      </div>
      <textarea name="content" required placeholder="Contenu du rapport..." className="mt-3 min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <Button className="mt-3 rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /> Envoyer</Button>
      {statusMessage && <p className="mt-2 text-xs font-bold text-cyan-600">{statusMessage}</p>}
    </form>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-dtsc-muted">{label}</p>
      <p className="mt-2 text-3xl font-black text-dtsc-ink">{value}</p>
    </div>
  );
}

function MiniItem({ item }: { item: ActivityItem }) {
  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black text-dtsc-ink">{item.title}</p>
          {item.detail && <p className="mt-1 text-sm text-dtsc-muted">{item.detail}</p>}
        </div>
        <span className="rounded-full bg-dtsc-soft px-3 py-1 text-xs font-black text-dtsc-blue">{formatEnumLabel(item.status)}</span>
      </div>
      {item.body && <p className="mt-3 line-clamp-2 text-sm leading-6 text-dtsc-muted">{item.body}</p>}
    </article>
  );
}

function sectionIcon(id: string) {
  if (id === "tasks") {
    return <ClipboardList className="h-5 w-5" />;
  }
  if (id === "operations" || id === "workflows") {
    return <GitBranch className="h-5 w-5" />;
  }
  if (id === "requests" || id === "reports") {
    return <Users className="h-5 w-5" />;
  }
  if (id === "payrolls") {
    return <CalendarDays className="h-5 w-5" />;
  }
  if (id === "ceo-follow-up") {
    return <ClipboardList className="h-5 w-5" />;
  }
  return <CircleAlert className="h-5 w-5" />;
}

function isInDateRange(value: string, start: string, end: string) {
  if (!start && !end) {
    return true;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return true;
  }
  if (start && time < new Date(`${start}T00:00:00`).getTime()) {
    return false;
  }
  if (end && time > new Date(`${end}T23:59:59.999`).getTime()) {
    return false;
  }
  return true;
}
