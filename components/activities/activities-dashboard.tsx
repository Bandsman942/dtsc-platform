"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CircleAlert, ClipboardList, Copy, GitBranch, MessageSquare, Send, Users } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListControls } from "@/components/ui/list-controls";
import { useSmartList } from "@/lib/hooks/use-smart-list";
import { formatEnumLabel } from "@/lib/labels";

type EntityType = "TASK" | "OPERATION" | "DEPARTMENT_REQUEST" | "BLOCKER" | "MEETING" | "REPORT" | "WORKFLOW" | "PAYROLL" | "CEO_OBJECTIVE" | "CEO_SUPERVISION" | "COLLAB_REQUEST" | "SCO_PURCHASE_REQUEST" | "SCO_VENDOR" | "SCO_MATERIAL" | "SCO_INVENTORY" | "SCO_ASSET" | "SCO_LOGISTICS" | "MPO_PROJECT" | "MPO_RECORD" | "CTO_PROJECT" | "CTO_RECORD" | "LEGAL_CASE" | "LEGAL_CONTRACT" | "LEGAL_TEMPLATE" | "LEGAL_RISK" | "LEGAL_DOCUMENT" | "LEGAL_DISPUTE" | "LEGAL_REQUEST" | "LEGAL_REPORT";

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
  mentions?: Array<{ mentionedUser: { id: string; name: string } }>;
};

type CollaboratorOption = { id: string; userId?: string | null; label: string };

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
      {section.id === "collaborator-forms" ? (
        <CollaboratorWorkflowComposer collaborators={collaborators} operations={operations} />
      ) : (
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
          {section.id === "collab-requests" && <RequestComposer collaborators={collaborators} selected={selected} />}
          {section.id === "reports" && <ReportComposer collaborators={collaborators} operations={operations} />}
          {section.id === "blockers" && <BlockerComposer operations={operations} />}
          {selected ? <ActivityDetail item={selected} collaborators={collaborators} /> : <p className="text-sm text-dtsc-muted">Sélectionnez un élément.</p>}
        </div>
      </div>
      )}
    </Dialog>
  );
}

function CollaboratorWorkflowComposer({ collaborators, operations }: { collaborators: CollaboratorOption[]; operations: CollaboratorOption[] }) {
  const [statusMessage, setStatusMessage] = useState("");
  const [workflowType, setWorkflowType] = useState("COO_MEETING");

  async function submitWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
    payload.workflowType = workflowType;
    payload.participantIds = formData.getAll("participantIds").map(String);
    payload.strategic = formData.get("strategic") === "on";
    const response = await fetch("/api/activities/collaborator-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setStatusMessage(response.ok ? "Formulaire transmis. L'élément apparaît dans votre suivi." : body?.message || "Transmission impossible.");
    if (response.ok) {
      form.reset();
    }
  }

  return (
    <form onSubmit={submitWorkflow} className="min-w-0 space-y-5 overflow-hidden">
      <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">
          Formulaire
          <select value={workflowType} onChange={(event) => setWorkflowType(event.target.value)} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-sm normal-case tracking-normal text-dtsc-ink">
            <option value="COO_MEETING">Mes réunions & comptes rendus</option>
            <option value="LEGAL_CASE">Soumettre un dossier juridique</option>
            <option value="LEGAL_CONTRACT">Soumettre un contrat ou une convention</option>
            <option value="LEGAL_RISK">Signaler un risque juridique</option>
            <option value="LEGAL_DISPUTE">Soumettre un litige ou une réclamation</option>
            <option value="LEGAL_REQUEST">Faire une demande juridique</option>
          </select>
        </label>
      </div>

      {workflowType === "COO_MEETING" && (
        <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h4 className="font-black text-dtsc-ink">Mes réunions & comptes rendus</h4>
          <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
            <Input name="title" placeholder="Titre de la réunion" required className="rounded-xl bg-dtsc-page" />
            <select name="meetingType" defaultValue="COORDINATION" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              {["COORDINATION", "STRATEGIC", "OPERATIONAL", "FOLLOW_UP", "TECHNICAL", "FINANCIAL", "HR", "CLIENT", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}
            </select>
            <Input name="meetingDate" type="date" className="rounded-xl bg-dtsc-page" />
            <Input name="meetingTime" placeholder="Heure" className="rounded-xl bg-dtsc-page" />
            <Input name="duration" placeholder="Durée prévue" className="rounded-xl bg-dtsc-page" />
            <select name="confidentialityLevel" defaultValue="INTERNAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              {["INTERNAL", "CONFIDENTIAL", "STRATEGIC"].map((level) => <option key={level} value={level}>{formatEnumLabel(level)}</option>)}
            </select>
            <select name="participantIds" multiple className="min-h-36 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}
            </select>
            <select name="operationId" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
              <option value="">Opération liée</option>
              {operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.label}</option>)}
            </select>
          </div>
          <textarea name="agenda" placeholder="Ordre du jour" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <textarea name="minutes" placeholder="Compte rendu" className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <textarea name="decisions" placeholder="Décisions prises" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <textarea name="generatedTasks" placeholder="Actions à suivre" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
          <textarea name="comments" placeholder="Commentaire initial" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
        </div>
      )}

      {workflowType !== "COO_MEETING" && (
        <LegalWorkflowFields workflowType={workflowType} />
      )}

      <Button className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /> Transmettre</Button>
      {statusMessage && <p className="text-sm font-bold text-cyan-600">{statusMessage}</p>}
    </form>
  );
}

function LegalWorkflowFields({ workflowType }: { workflowType: string }) {
  const titlePlaceholder = workflowType === "LEGAL_REQUEST" ? "Objet de la demande" : workflowType === "LEGAL_RISK" ? "Titre du risque" : workflowType === "LEGAL_DISPUTE" ? "Titre du litige ou de la réclamation" : workflowType === "LEGAL_CONTRACT" ? "Titre du contrat" : "Titre du dossier";
  return (
    <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <h4 className="font-black text-dtsc-ink">{legalWorkflowTitle(workflowType)}</h4>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <Input name={workflowType === "LEGAL_REQUEST" ? "subject" : "title"} placeholder={titlePlaceholder} required className="rounded-xl bg-dtsc-page" />
        <LegalTypeSelect workflowType={workflowType} />
        {workflowType === "LEGAL_CONTRACT" && <Input name="counterparty" placeholder="Partie concernée" className="rounded-xl bg-dtsc-page" />}
        {workflowType === "LEGAL_DISPUTE" && <Input name="counterparty" placeholder="Partie concernée" className="rounded-xl bg-dtsc-page" />}
        {workflowType === "LEGAL_CONTRACT" && <Input name="desiredValidationDate" type="date" title="Date souhaitée de validation" className="rounded-xl bg-dtsc-page" />}
        {workflowType === "LEGAL_REQUEST" && <Input name="desiredDueDate" type="date" title="Date limite souhaitée" className="rounded-xl bg-dtsc-page" />}
        {workflowType === "LEGAL_DISPUTE" && <Input name="occurredAt" type="date" title="Date de survenue" className="rounded-xl bg-dtsc-page" />}
        {(workflowType === "LEGAL_CASE" || workflowType === "LEGAL_REQUEST") && (
          <select name="priority" defaultValue="NORMAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
            {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
          </select>
        )}
        {workflowType === "LEGAL_RISK" && (
          <select name="urgency" defaultValue="NORMAL" className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
            {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((urgency) => <option key={urgency} value={urgency}>{formatEnumLabel(urgency)}</option>)}
          </select>
        )}
        <Input name={workflowType === "LEGAL_CONTRACT" || workflowType === "LEGAL_DISPUTE" || workflowType === "LEGAL_REQUEST" ? "documentUrl" : "attachmentUrl"} placeholder="Document joint ou lien interne" className="rounded-xl bg-dtsc-page" />
        <Input name="linkedEntityType" placeholder="Élément lié: projet, fournisseur, client..." className="rounded-xl bg-dtsc-page" />
        <Input name="linkedEntityId" placeholder="Référence de l'élément lié" className="rounded-xl bg-dtsc-page" />
      </div>
      {workflowType === "LEGAL_CONTRACT" ? (
        <textarea name="subject" required placeholder="Objet du contrat et instruction de relecture" className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      ) : (
        <textarea name="description" required placeholder="Description" className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      )}
      {workflowType === "LEGAL_CASE" && <textarea name="reason" placeholder="Raison de la demande" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />}
      {(workflowType === "LEGAL_RISK" || workflowType === "LEGAL_DISPUTE") && <textarea name="potentialImpact" placeholder="Impact perçu ou estimé" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />}
      {workflowType === "LEGAL_CONTRACT" && (
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-dtsc-muted">
          <input name="strategic" type="checkbox" className="h-4 w-4 rounded border-dtsc-border" />
          Contrat stratégique ou nécessitant signature CEO
        </label>
      )}
      <textarea name="comments" placeholder="Commentaire initial" className="mt-3 min-h-20 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
    </div>
  );
}

function LegalTypeSelect({ workflowType }: { workflowType: string }) {
  const config = {
    LEGAL_CASE: { name: "caseType", values: ["CLIENT_CONTRACT", "ADMINISTRATIVE_DOCUMENT", "DISPUTE", "COMPLIANCE", "SENSITIVE_DATA", "PARTNERSHIP", "SUPPLIER_CONTRACT", "EMPLOYMENT_CONTRACT", "OTHER"] },
    LEGAL_CONTRACT: { name: "contractType", values: ["CLIENT_CONTRACT", "SUPPLIER_CONTRACT", "CONSULTING_CONTRACT", "SERVICE_CONTRACT", "PARTNERSHIP_AGREEMENT", "NDA", "MOU", "TECHNICAL_CONTRACT", "OTHER"] },
    LEGAL_RISK: { name: "source", values: ["CONTRACT", "CLIENT", "SUPPLIER", "EMPLOYEE", "PROJECT", "SENSITIVE_DATA", "MEDICAL_DATA", "FINANCE", "OPERATION", "TECHNICAL", "OTHER"] },
    LEGAL_DISPUTE: { name: "disputeType", values: ["CLIENT", "SUPPLIER", "EMPLOYEE", "PARTNER", "ADMINISTRATION", "TECHNICAL", "FINANCIAL", "OPERATIONAL", "PROJECT", "OTHER"] },
    LEGAL_REQUEST: { name: "requestType", values: ["HR_CONTRACT", "PROJECT_CONTRACT", "SUPPLIER_CONTRACT", "CLIENT_CONTRACT", "OFFICIAL_NOTE", "NDA", "IP_DATA", "DISPUTE", "CONFIDENTIALITY", "SENSITIVE_DATA", "OTHER"] },
  }[workflowType] || { name: "type", values: ["OTHER"] };
  return (
    <select name={config.name} className="w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
      {config.values.map((value) => <option key={value} value={value}>{formatEnumLabel(value)}</option>)}
    </select>
  );
}

function legalWorkflowTitle(workflowType: string) {
  if (workflowType === "LEGAL_CONTRACT") {
    return "Soumettre un contrat ou une convention";
  }
  if (workflowType === "LEGAL_RISK") {
    return "Signaler un risque juridique";
  }
  if (workflowType === "LEGAL_DISPUTE") {
    return "Soumettre un litige ou une réclamation";
  }
  if (workflowType === "LEGAL_REQUEST") {
    return "Faire une demande juridique";
  }
  return "Soumettre un dossier juridique";
}

function ActivityDetail({ item, collaborators }: { item: ActivityItem; collaborators: CollaboratorOption[] }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [hasOlderComments, setHasOlderComments] = useState(false);
  const [isLoadingOlderComments, setIsLoadingOlderComments] = useState(false);
  const [message, setMessage] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [requestResponse, setRequestResponse] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const loadComments = useCallback(async (cursor?: string | null) => {
    if (cursor) {
      setIsLoadingOlderComments(true);
    }
    const query = new URLSearchParams({ entityType: item.entityType, entityId: item.id, limit: "20" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    const response = await fetch(`/api/activities/comments?${query.toString()}`);
    const body = (await response.json().catch(() => null)) as { comments?: CommentItem[]; nextCursor?: string | null; hasMore?: boolean } | null;
    const nextComments = body?.comments || [];
    setComments((current) => (cursor ? [...nextComments, ...current] : nextComments));
    setCommentsCursor(body?.nextCursor || null);
    setHasOlderComments(Boolean(body?.hasMore));
    setIsLoadingOlderComments(false);
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
      body: JSON.stringify({ entityType: item.entityType, entityId: item.id, content: message, mentionedUserIds }),
    });
    setStatusMessage(response.ok ? "Commentaire ajouté." : "Impossible d'ajouter le commentaire.");
    if (response.ok) {
      setMessage("");
      setMentionedUserIds([]);
      await loadComments();
    }
  }

  const mentionSuggestions = useMemo(() => {
    const match = message.match(/@([\p{L}\p{N}\s._-]{0,40})$/u);
    if (!match) {
      return [];
    }
    const query = match[1].toLowerCase();
    return collaborators.filter((collaborator) => collaborator.label.toLowerCase().includes(query)).slice(0, 6);
  }, [collaborators, message]);

  function insertMention(collaborator: CollaboratorOption) {
    const name = collaborator.label.split(" · ")[0] || collaborator.label;
    setMessage((current) => current.replace(/@([\p{L}\p{N}\s._-]{0,40})$/u, `@${name} `));
    if (collaborator.userId) {
      setMentionedUserIds((current) => [...new Set([...current, collaborator.userId as string])]);
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

  async function updateCollaboratorRequest(status: string) {
    const response = await fetch(`/api/activities/requests/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, response: requestResponse }),
    });
    setStatusMessage(response.ok ? "Demande mise à jour." : "Mise à jour de la demande impossible.");
    if (response.ok) {
      setRequestResponse("");
    }
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

      {item.entityType === "COLLAB_REQUEST" && (
        <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
          <h4 className="font-black text-dtsc-ink">Répondre ou faire avancer la demande</h4>
          <textarea
            value={requestResponse}
            onChange={(event) => setRequestResponse(event.target.value)}
            placeholder="Réponse, précision ou information transmise..."
            className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => updateCollaboratorRequest("IN_PROGRESS")} className="rounded-xl bg-[#002b5b] text-white">Prendre en charge</Button>
            <Button type="button" onClick={() => updateCollaboratorRequest("ANSWERED")} className="rounded-xl bg-cyan-500 text-[#001736]">Marquer répondue</Button>
            <Button type="button" onClick={() => updateCollaboratorRequest("TREATED")} variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">Marquer traitée</Button>
            <Button type="button" onClick={() => updateCollaboratorRequest("REJECTED")} variant="outline" className="rounded-xl border-red-200 text-red-500">Rejeter</Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
        <h4 className="flex items-center gap-2 font-black text-dtsc-ink"><MessageSquare className="h-4 w-4 text-cyan-500" /> Commentaires</h4>
        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-dtsc-border bg-dtsc-page/50 p-2 pr-1">
          {hasOlderComments && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={() => loadComments(commentsCursor)} disabled={isLoadingOlderComments} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue">
                {isLoadingOlderComments ? "Chargement..." : "Charger les précédents"}
              </Button>
            </div>
          )}
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{comment.author.name} · {formatEnumLabel(comment.author.role)} · {new Date(comment.createdAt).toLocaleString("fr-FR")}</p>
                <ActionMenu
                  label="Actions du commentaire"
                  items={[
                    { key: "copy", label: "Copier le texte", icon: Copy, onSelect: () => copyText(comment.content) },
                  ]}
                />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dtsc-muted">
                <ActivityMentionText content={comment.content} mentions={comment.mentions?.map((mention) => mention.mentionedUser) || []} />
              </p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-dtsc-muted">Aucun commentaire pour le moment.</p>}
        </div>
        <form onSubmit={addComment} className="relative mt-3 flex flex-col gap-2 sm:flex-row">
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-14 left-0 z-20 w-[min(26rem,100%)] rounded-2xl border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_18px_60px_rgba(0,23,54,0.18)]">
              {mentionSuggestions.map((collaborator) => (
                <button key={collaborator.id} type="button" onClick={() => insertMention(collaborator)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-dtsc-ink hover:bg-dtsc-soft">
                  @{collaborator.label}
                </button>
              ))}
            </div>
          )}
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ajouter un commentaire..." className="rounded-xl bg-dtsc-page" />
          <Button className="rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /> Envoyer</Button>
        </form>
        {statusMessage && <p className="mt-2 text-xs font-bold text-cyan-600">{statusMessage}</p>}
      </div>
    </div>
  );
}

function RequestComposer({ collaborators, selected }: { collaborators: CollaboratorOption[]; selected: ActivityItem | null }) {
  const [statusMessage, setStatusMessage] = useState("");

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/activities/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setStatusMessage(response.ok ? "Demande envoyée au collaborateur." : body?.message || "Impossible d'envoyer la demande.");
    if (response.ok) {
      form.reset();
    }
  }

  return (
    <form onSubmit={createRequest} className="mb-5 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4">
      <h4 className="font-black text-dtsc-ink">Formuler une demande à un collaborateur</h4>
      <p className="mt-1 text-sm leading-6 text-dtsc-muted">
        Envoyez une demande d&apos;information, validation, document ou action. La discussion reste attachée à la demande et visible par les personnes concernées.
      </p>
      <input type="hidden" name="relatedEntityType" value={selected?.entityType || ""} />
      <input type="hidden" name="relatedEntityId" value={selected?.id || ""} />
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <Input name="title" placeholder={selected ? `Demande liée à: ${selected.title}` : "Titre de la demande"} required className="rounded-xl bg-dtsc-page" />
        <select name="targetEmployeeId" required className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink">
          <option value="">Collaborateur destinataire</option>
          {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.label}</option>)}
        </select>
        <select name="requestType" className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="INFORMATION">
          {["INFORMATION", "DOCUMENT", "VALIDATION", "SUPPORT", "ACTION", "MEETING", "FOLLOW_UP", "OTHER"].map((type) => <option key={type} value={type}>{formatEnumLabel(type)}</option>)}
        </select>
        <select name="priority" className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" defaultValue="NORMAL">
          {["LOW", "NORMAL", "HIGH", "CRITICAL"].map((priority) => <option key={priority} value={priority}>{formatEnumLabel(priority)}</option>)}
        </select>
        <Input name="dueDate" type="date" className="rounded-xl bg-dtsc-page" />
      </div>
      <textarea name="message" required placeholder="Expliquez clairement ce que vous attendez du collaborateur..." className="mt-3 min-h-24 w-full rounded-xl border border-dtsc-border bg-dtsc-page px-3 py-2 text-sm text-dtsc-ink" />
      <Button className="mt-3 rounded-xl bg-[#002b5b] text-white"><Send className="h-4 w-4" /> Envoyer la demande</Button>
      {statusMessage && <p className="mt-2 text-xs font-bold text-cyan-600">{statusMessage}</p>}
    </form>
  );
}

function ActivityMentionText({ content, mentions }: { content: string; mentions: Array<{ id: string; name: string }> }) {
  if (!mentions.length) {
    return <>{content}</>;
  }
  const mentionByName = new Map(mentions.map((mention) => [`@${mention.name}`, mention]));
  const pattern = new RegExp(`(${mentions.map((mention) => escapeRegExp(`@${mention.name}`)).join("|")})`, "g");
  return (
    <>
      {content.split(pattern).map((part, index) => {
        const mention = mentionByName.get(part);
        if (!mention) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }
        return (
          <button
            key={`${mention.id}-${index}`}
            type="button"
            onClick={() => copyText(mention.name)}
            className="font-black text-cyan-600 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            title="Copier le nom du collaborateur mentionné"
          >
            @{mention.name}
          </button>
        );
      })}
    </>
  );
}

function copyText(value: string) {
  const clipboard = typeof globalThis.navigator !== "undefined" ? globalThis.navigator.clipboard : null;
  void clipboard?.writeText(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (id === "requests" || id === "reports" || id === "collab-requests") {
    return <Users className="h-5 w-5" />;
  }
  if (id === "payrolls") {
    return <CalendarDays className="h-5 w-5" />;
  }
  if (id === "ceo-follow-up") {
    return <ClipboardList className="h-5 w-5" />;
  }
  if (id === "sco") {
    return <Users className="h-5 w-5" />;
  }
  if (id === "mpo-projects" || id === "cto-tech") {
    return <GitBranch className="h-5 w-5" />;
  }
  if (id === "la-legal") {
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
