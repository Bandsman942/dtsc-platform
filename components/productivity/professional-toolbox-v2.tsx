"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, Calculator, Check, Columns3, Lightbulb, List, Pencil, Pin, Plus, Save, Search, StickyNote, Trash2, Wrench } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { ProfessionalCalculatorV2 } from "@/components/productivity/professional-calculator-v2";
import { ProfessionalNoteRichEditor, type ProfessionalNoteEditorHandle } from "@/components/productivity/professional-note-rich-editor";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ToolboxTab = "notes" | "calculator";
type NoteView = "list" | "kanban";
type Grouping = "status" | "priority" | "noteType" | "moduleKey";

type ToolNote = {
  id: string;
  moduleKey: string;
  title: string;
  contentHtml: string;
  contentText: string;
  noteType: "NOTE" | "REMINDER";
  status: "DRAFT" | "ACTIVE" | "DONE" | "ARCHIVED";
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  labels: string | null;
  color: string | null;
  sortOrder: number;
  pinned: boolean;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoteMetadata = {
  title: string;
  noteType: ToolNote["noteType"];
  status: ToolNote["status"];
  priority: ToolNote["priority"];
  labels: string;
  pinned: boolean;
  dueAt: string;
};

type NoteSession = {
  note: ToolNote | null;
  metadata: NoteMetadata;
  contentHtml: string;
  contentText: string;
};

const EMPTY_METADATA: NoteMetadata = {
  title: "",
  noteType: "NOTE",
  status: "DRAFT",
  priority: "NORMAL",
  labels: "",
  pinned: false,
  dueAt: "",
};

export function ProfessionalToolboxV2() {
  const locale = useAppLocale() || "fr";
  const english = locale === "en";
  const pathname = usePathname();
  const moduleKey = useMemo(() => normalizeModuleKey(pathname), [pathname]);
  const editorRef = useRef<ProfessionalNoteEditorHandle | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ToolboxTab>("notes");
  const [notes, setNotes] = useState<ToolNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteView>("list");
  const [grouping, setGrouping] = useState<Grouping>("status");
  const [selected, setSelected] = useState<ToolNote | null>(null);
  const [metadataSession, setMetadataSession] = useState<NoteSession | null>(null);
  const [editorSession, setEditorSession] = useState<NoteSession | null>(null);
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/toolbox/notes?includeArchived=false", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { notes?: ToolNote[]; message?: string } | null;
    if (response.ok) setNotes(body?.notes || []);
    else setFeedback(body?.message || (english ? "Unable to load notes." : "Chargement des notes impossible."));
    setLoading(false);
  }, [english]);

  const visibleNotes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return notes.filter((note) => !normalized || [note.title, note.contentText, note.moduleKey, note.labels, note.status, note.priority, note.noteType].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized));
  }, [notes, query]);

  const columns = useMemo(() => {
    const map = new Map<string, ToolNote[]>();
    for (const note of visibleNotes) {
      const key = String(note[grouping] || (english ? "Undefined" : "Non défini"));
      map.set(key, [...(map.get(key) || []), note]);
    }
    return [...map.entries()].map(([id, items]) => ({ id, label: noteGroupLabel(grouping, id, english), items }));
  }, [english, grouping, visibleNotes]);

  useFloatingAction({
    id: "professional-toolbox",
    label: english ? "Professional toolbox" : "Boîte à outils professionnelle",
    icon: Wrench,
    order: 10,
    onSelect: () => {
      setOpen(true);
      void loadNotes();
    },
  });

  function beginCreate(type: ToolNote["noteType"]) {
    setSelected(null);
    setMetadataSession({
      note: null,
      metadata: { ...EMPTY_METADATA, noteType: type, status: type === "REMINDER" ? "ACTIVE" : "DRAFT" },
      contentHtml: "",
      contentText: "",
    });
  }

  function beginEdit(note: ToolNote) {
    setSelected(null);
    setMetadataSession({
      note,
      metadata: {
        title: note.title,
        noteType: note.noteType,
        status: note.status,
        priority: note.priority,
        labels: note.labels || "",
        pinned: note.pinned,
        dueAt: note.dueAt ? note.dueAt.slice(0, 16) : "",
      },
      contentHtml: note.contentHtml,
      contentText: note.contentText,
    });
  }

  function validateMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!metadataSession?.metadata.title.trim()) return;
    setEditorSession(metadataSession);
    setMetadataSession(null);
  }

  function returnToMetadata() {
    if (!editorSession) return;
    const content = editorRef.current?.getContent() || { html: editorSession.contentHtml, text: editorSession.contentText };
    setMetadataSession({ ...editorSession, contentHtml: content.html, contentText: content.text });
    setEditorSession(null);
  }

  async function saveEditorSession() {
    if (!editorSession || !editorSession.metadata.title.trim()) return;
    const content = editorRef.current?.getContent() || { html: editorSession.contentHtml, text: editorSession.contentText };
    const metadata = editorSession.metadata;
    const payload = {
      ...(editorSession.note ? {} : { moduleKey }),
      title: metadata.title.trim(),
      contentHtml: content.html,
      contentText: content.text,
      noteType: metadata.noteType,
      status: metadata.status,
      priority: metadata.priority,
      labels: metadata.labels.split(",").map((label) => label.trim()).filter(Boolean),
      pinned: metadata.pinned,
      dueAt: metadata.dueAt ? new Date(metadata.dueAt).toISOString() : "",
    };
    setSaving(true);
    const response = await fetch(editorSession.note ? `/api/toolbox/notes/${editorSession.note.id}` : "/api/toolbox/notes", {
      method: editorSession.note ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { note?: ToolNote; message?: string } | null;
    if (response.ok) {
      setEditorSession(null);
      setFeedback(english ? "Note saved." : "Note enregistrée.");
      await loadNotes();
      if (body?.note) setSelected(body.note);
    } else {
      setFeedback(body?.message || (english ? "Unable to save the note." : "Enregistrement de la note impossible."));
    }
    setSaving(false);
  }

  async function mutateNote(note: ToolNote, patch: Partial<NoteMetadata>) {
    const response = await fetch(`/api/toolbox/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await response.json().catch(() => null)) as { note?: ToolNote; message?: string } | null;
    if (response.ok) {
      setFeedback(english ? "Note updated." : "Note actualisée.");
      if (body?.note && selected?.id === body.note.id) setSelected(body.note);
      await loadNotes();
    } else {
      setFeedback(body?.message || (english ? "Unable to update the note." : "Mise à jour impossible."));
    }
  }

  async function archiveNote(note: ToolNote) {
    const response = await fetch(`/api/toolbox/notes/${note.id}`, { method: "DELETE" });
    if (response.ok) {
      setFeedback(english ? "Note archived." : "Note archivée.");
      setSelected(null);
      await loadNotes();
    } else {
      setFeedback(english ? "Unable to archive the note." : "Archivage impossible.");
    }
  }

  return (
    <>
      <Dialog
        open={open}
        title={english ? "Professional toolbox" : "Boîte à outils professionnelle"}
        description={english ? `Persistent tools for ${moduleLabel(moduleKey)}.` : `Outils persistants liés au module ${moduleLabel(moduleKey)}.`}
        onClose={() => setOpen(false)}
        className="h-[94dvh] max-w-6xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
            <ToolTab active={tab === "notes"} label={english ? "Notes & reminders" : "Notes & pense-bêtes"} icon={StickyNote} onClick={() => setTab("notes")} />
            <ToolTab active={tab === "calculator"} label={english ? "Professional calculator" : "Calculatrice professionnelle"} icon={Calculator} onClick={() => setTab("calculator")} />
          </div>

          {feedback ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm font-semibold text-dtsc-ink" role="status">{feedback}</p> : null}

          {tab === "notes" ? (
            <section className="min-w-0 space-y-4" aria-label={english ? "Professional notes" : "Notes professionnelles"}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                <div className="min-w-0">
                  <h3 className="font-black text-dtsc-ink">{english ? "Persistent notes by module" : "Notes persistantes par module"}</h3>
                  <p className="mt-1 text-sm leading-6 text-dtsc-muted">{english ? "Create metadata first, then write in a distraction-free fullscreen editor." : "Renseignez d’abord les informations, puis rédigez dans un éditeur plein écran sans distraction."}</p>
                </div>
                <div data-responsive-actions className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => beginCreate("REMINDER")} className="rounded-xl"><Lightbulb className="h-4 w-4" /> {english ? "Reminder" : "Pense-bête"}</Button>
                  <Button type="button" onClick={() => beginCreate("NOTE")} className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> {english ? "New note" : "Nouvelle note"}</Button>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-dtsc-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={english ? "Search notes…" : "Rechercher dans les notes…"} className="h-11 rounded-xl bg-dtsc-page pl-10" /></label>
                <select value={grouping} onChange={(event) => setGrouping(event.target.value as Grouping)} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink" aria-label={english ? "Kanban grouping" : "Organisation du Kanban"}>
                  <option value="status">{english ? "Group by status" : "Organiser par statut"}</option>
                  <option value="priority">{english ? "Group by priority" : "Organiser par priorité"}</option>
                  <option value="noteType">{english ? "Group by type" : "Organiser par type"}</option>
                  <option value="moduleKey">{english ? "Group by module" : "Organiser par module"}</option>
                </select>
                <div className="inline-flex rounded-xl border border-dtsc-border bg-dtsc-page p-1">
                  <ViewButton active={view === "list"} label={english ? "List" : "Liste"} icon={List} onClick={() => setView("list")} />
                  <ViewButton active={view === "kanban"} label="Kanban" icon={Columns3} onClick={() => setView("kanban")} />
                </div>
              </div>

              {loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{english ? "Loading…" : "Chargement…"}</p> : view === "list" ? (
                visibleNotes.length ? (
                  <BusinessList ariaLabel={english ? "Professional notes" : "Notes professionnelles"}>
                    {visibleNotes.map((note) => <NoteListItem key={note.id} note={note} english={english} onOpen={() => setSelected(note)} onEdit={() => beginEdit(note)} onArchive={() => void archiveNote(note)} onPin={() => void mutateNote(note, { pinned: !note.pinned })} />)}
                  </BusinessList>
                ) : <EmptyState compact title={english ? "No note" : "Aucune note"} description={english ? "Create your first note." : "Créez votre première note."} icon={StickyNote} />
              ) : columns.length ? (
                <div className="flex min-w-0 gap-3 overflow-x-auto pb-2" aria-label="Kanban notes">
                  {columns.map((column) => (
                    <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3">
                      <div className="mb-3 flex items-center justify-between gap-2"><h4 className="break-words font-black text-dtsc-ink">{column.label}</h4><StatusBadge>{column.items.length}</StatusBadge></div>
                      <div className="grid gap-2">
                        {column.items.map((note) => <button key={note.id} type="button" onClick={() => setSelected(note)} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-400"><div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-black text-dtsc-ink">{note.title}</p>{note.pinned ? <Pin className="h-4 w-4 shrink-0 text-cyan-600" /> : null}</div><p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-dtsc-muted">{note.contentText || (english ? "Empty note" : "Note vide")}</p><div className="mt-3 flex flex-wrap gap-1"><StatusBadge tone={priorityTone(note.priority)}>{enumLabel(note.priority, english)}</StatusBadge><StatusBadge>{noteGroupLabel("noteType", note.noteType, english)}</StatusBadge></div></button>)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : <EmptyState compact title={english ? "No note" : "Aucune note"} description={english ? "No note matches the filters." : "Aucune note ne correspond aux filtres."} icon={StickyNote} />}
            </section>
          ) : <ProfessionalCalculatorV2 english={english} />}
        </div>
      </Dialog>

      <Dialog
        open={selected !== null}
        title={selected?.title || ""}
        description={selected ? `${noteGroupLabel("noteType", selected.noteType, english)} · ${moduleLabel(selected.moduleKey)}` : ""}
        onClose={() => setSelected(null)}
        className="h-[96dvh] max-w-5xl"
      >
        {selected ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(selected.status)}>{enumLabel(selected.status, english)}</StatusBadge><StatusBadge tone={priorityTone(selected.priority)}>{enumLabel(selected.priority, english)}</StatusBadge>{selected.pinned ? <StatusBadge tone="info">{english ? "Pinned" : "Épinglée"}</StatusBadge> : null}</div>
            <RichNotePreview note={selected} english={english} />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2"><Detail label={english ? "Module" : "Module"} value={moduleLabel(selected.moduleKey)} /><Detail label={english ? "Last update" : "Dernière modification"} value={new Date(selected.updatedAt).toLocaleString(english ? "en-GB" : "fr-FR")} />{selected.dueAt ? <Detail label={english ? "Due date" : "Échéance"} value={new Date(selected.dueAt).toLocaleString(english ? "en-GB" : "fr-FR")} /> : null}<Detail label={english ? "Labels" : "Étiquettes"} value={selected.labels || "—"} /></div>
            <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => void mutateNote(selected, { status: selected.status === "DONE" ? "ACTIVE" : "DONE" })} className="rounded-xl"><Check className="h-4 w-4" /> {selected.status === "DONE" ? (english ? "Reopen" : "Rouvrir") : (english ? "Complete" : "Terminer")}</Button><Button type="button" variant="outline" onClick={() => beginEdit(selected)} className="rounded-xl"><Pencil className="h-4 w-4" /> {english ? "Edit" : "Modifier"}</Button><Button type="button" variant="outline" onClick={() => void archiveNote(selected)} className="rounded-xl text-red-700"><Archive className="h-4 w-4" /> {english ? "Archive" : "Archiver"}</Button></div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={metadataSession !== null}
        title={metadataSession?.note ? (english ? "Note information" : "Informations de la note") : metadataSession?.metadata.noteType === "REMINDER" ? (english ? "New reminder" : "Nouveau pense-bête") : (english ? "New note" : "Nouvelle note")}
        description={english ? "First define the note. The rich editor opens after validation." : "Définissez d’abord la note. L’éditeur riche s’ouvre après validation."}
        onClose={() => setMetadataSession(null)}
        className="h-[92dvh] max-w-3xl"
      >
        {metadataSession ? <MetadataForm english={english} session={metadataSession} setSession={setMetadataSession} onSubmit={validateMetadata} /> : null}
      </Dialog>

      <Dialog
        open={editorSession !== null}
        title={editorSession?.metadata.title || (english ? "Note editor" : "Éditeur de note")}
        description={english ? "Fullscreen editor. The formatting rail stays fixed and scrolls horizontally; select text first, then apply formatting." : "Éditeur plein écran. Le rail de mise en forme reste fixe et défile horizontalement ; sélectionnez un texte puis appliquez directement le format."}
        onClose={returnToMetadata}
        className="max-w-none"
        presentation="editor"
        footer={editorSession ? <><Button type="button" variant="outline" onClick={returnToMetadata} className="w-full rounded-xl sm:w-auto"><ArrowLeft className="h-4 w-4" /><span className="sm:hidden">{english ? "Info" : "Infos"}</span><span className="hidden sm:inline">{english ? "Back to information" : "Retour aux informations"}</span></Button><Button type="button" disabled={saving} onClick={() => void saveEditorSession()} className="w-full rounded-xl bg-dtsc-blue text-white sm:w-auto"><Save className="h-4 w-4" /><span className="sm:hidden">{saving ? (english ? "Saving…" : "Enregistrement…") : (english ? "Save" : "Enregistrer")}</span><span className="hidden sm:inline">{saving ? (english ? "Saving…" : "Enregistrement…") : (english ? "Save note" : "Enregistrer la note")}</span></Button></> : null}
      >
        {editorSession ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ProfessionalNoteRichEditor
              key={`${editorSession.note?.id || "new"}-${editorSession.contentHtml.length}`}
              ref={editorRef}
              initialHtml={editorSession.contentHtml}
              placeholder={english ? "Write your note…" : "Rédigez votre note…"}
              english={english}
              className="rounded-none border-0"
            />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function MetadataForm({ english, session, setSession, onSubmit }: { english: boolean; session: NoteSession; setSession: (session: NoteSession | null) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const metadata = session.metadata;
  const update = (patch: Partial<NoteMetadata>) => setSession({ ...session, metadata: { ...metadata, ...patch } });
  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-4">
      <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{english ? "Title" : "Titre"}<Input value={metadata.title} onChange={(event) => update({ title: event.target.value })} required maxLength={160} className="h-12 rounded-xl bg-dtsc-page" autoFocus /></label>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <SelectField label={english ? "Type" : "Type"} value={metadata.noteType} onChange={(value) => update({ noteType: value as ToolNote["noteType"] })} options={["NOTE", "REMINDER"]} english={english} />
        <SelectField label={english ? "Priority" : "Priorité"} value={metadata.priority} onChange={(value) => update({ priority: value as ToolNote["priority"] })} options={["LOW", "NORMAL", "HIGH", "CRITICAL"]} english={english} />
        <SelectField label={english ? "Status" : "Statut"} value={metadata.status} onChange={(value) => update({ status: value as ToolNote["status"] })} options={["DRAFT", "ACTIVE", "DONE"]} english={english} />
        <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{english ? "Due date" : "Échéance"}<Input type="datetime-local" value={metadata.dueAt} onChange={(event) => update({ dueAt: event.target.value })} className="h-12 rounded-xl bg-dtsc-page" /></label>
      </div>
      <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{english ? "Labels, separated by commas" : "Étiquettes séparées par des virgules"}<Input value={metadata.labels} onChange={(event) => update({ labels: event.target.value })} className="h-12 rounded-xl bg-dtsc-page" /></label>
      <label className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={metadata.pinned} onChange={(event) => update({ pinned: event.target.checked })} className="h-4 w-4" />{english ? "Pin this note" : "Épingler cette note"}</label>
      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm leading-6 text-dtsc-muted">{english ? "Validation does not save yet. It opens the fullscreen rich editor; the note is persisted only when you choose Save note." : "Valider n’enregistre pas encore la note. Cette action ouvre l’éditeur riche plein écran ; la persistance intervient uniquement avec Enregistrer la note."}</div>
      <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSession(null)} className="rounded-xl">{english ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={!metadata.title.trim()} className="rounded-xl bg-dtsc-blue text-white">{english ? "Validate and edit" : "Valider et éditer"}</Button></div>
    </form>
  );
}

function RichNotePreview({ note, english }: { note: ToolNote; english: boolean }) {
  const html = note.contentHtml || `<p>${escapeHtml(note.contentText || (english ? "Empty note" : "Note vide"))}</p>`;
  return <article className="min-w-0 overflow-x-auto rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-sm leading-7 text-dtsc-ink sm:p-5 [&_a]:font-bold [&_a]:text-dtsc-blue [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-cyan-400 [&_blockquote]:bg-dtsc-surface [&_blockquote]:px-4 [&_blockquote]:py-2 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:text-2xl [&_h2]:font-black [&_h3]:text-xl [&_h3]:font-black [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:text-slate-100 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-dtsc-border [&_td]:p-2 [&_th]:border [&_th]:border-dtsc-border [&_th]:bg-dtsc-soft [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: html }} />;
}

function ToolTab({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof StickyNote; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black", active ? "border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}><Icon className="h-4 w-4" />{label}</button>;
}

function ViewButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof List; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-black", active ? "bg-dtsc-blue text-white" : "text-dtsc-muted")}><Icon className="h-4 w-4" />{label}</button>;
}

function NoteListItem({ note, english, onOpen, onEdit, onArchive, onPin }: { note: ToolNote; english: boolean; onOpen: () => void; onEdit: () => void; onArchive: () => void; onPin: () => void }) {
  return <BusinessListItem title={note.title} meta={`${moduleLabel(note.moduleKey)} · ${new Date(note.updatedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}`} description={note.contentText || (english ? "Empty note" : "Note vide")} onOpen={onOpen} status={<div className="flex flex-wrap gap-1"><StatusBadge tone={statusTone(note.status)}>{enumLabel(note.status, english)}</StatusBadge><StatusBadge tone={priorityTone(note.priority)}>{enumLabel(note.priority, english)}</StatusBadge></div>} actions={<ContextActions label={english ? "Note actions" : "Actions de la note"} actions={[{ id: "open", label: english ? "Open" : "Ouvrir", onSelect: onOpen }, { id: "pin", label: note.pinned ? (english ? "Unpin" : "Désépingler") : (english ? "Pin" : "Épingler"), icon: Pin, onSelect: onPin }, { id: "edit", label: english ? "Edit" : "Modifier", icon: Pencil, onSelect: onEdit }, { id: "archive", label: english ? "Archive" : "Archiver", icon: Trash2, destructive: true, separatorBefore: true, onSelect: onArchive }]} />} />;
}

function SelectField({ label, value, onChange, options, english }: { label: string; value: string; onChange: (value: string) => void; options: string[]; english: boolean }) {
  return <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{options.map((option) => <option key={option} value={option}>{enumLabel(option, english)}</option>)}</select></label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>;
}

function normalizeModuleKey(pathname: string | null) {
  return (pathname?.split("/").filter(Boolean)[0] || "dashboard").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function moduleLabel(key: string) {
  return key.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enumLabel(value: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    NOTE: ["Note", "Note"], REMINDER: ["Pense-bête", "Reminder"], DRAFT: ["Brouillon", "Draft"], ACTIVE: ["Active", "Active"], DONE: ["Terminée", "Done"], ARCHIVED: ["Archivée", "Archived"], LOW: ["Faible", "Low"], NORMAL: ["Normale", "Normal"], HIGH: ["Élevée", "High"], CRITICAL: ["Critique", "Critical"],
  };
  return labels[value]?.[english ? 1 : 0] || value.replaceAll("_", " ");
}

function noteGroupLabel(grouping: Grouping, value: string, english: boolean) {
  return grouping === "moduleKey" ? moduleLabel(value) : enumLabel(value, english);
}

function statusTone(status: string): StatusBadgeTone {
  return status === "DONE" ? "success" : status === "ACTIVE" ? "info" : status === "ARCHIVED" ? "neutral" : "warning";
}

function priorityTone(priority: string): StatusBadgeTone {
  return priority === "CRITICAL" ? "danger" : priority === "HIGH" ? "warning" : priority === "LOW" ? "info" : "neutral";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
