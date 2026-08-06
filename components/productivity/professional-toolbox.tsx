"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, Calculator, Check, ClipboardCopy, ClipboardPaste, Scissors, Columns3, HelpCircle, Lightbulb, List, Pencil, Pin, Plus, RotateCcw, Save, Search, Sigma, StickyNote, Trash2, WalletCards, Wrench, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import { cn } from "@/lib/utils";

type ToolboxTab = "notes" | "calculator";
type NoteView = "list" | "kanban";
type Grouping = "status" | "priority" | "noteType" | "moduleKey";
type CalculatorMode = "basic" | "scientific" | "financial";

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

type NoteForm = {
  title: string;
  contentHtml: string;
  contentText: string;
  noteType: ToolNote["noteType"];
  status: ToolNote["status"];
  priority: ToolNote["priority"];
  labels: string;
  pinned: boolean;
  dueAt: string;
};

const EMPTY_NOTE: NoteForm = { title: "", contentHtml: "", contentText: "", noteType: "NOTE", status: "DRAFT", priority: "NORMAL", labels: "", pinned: false, dueAt: "" };

export function ProfessionalToolbox() {
  const pathname = usePathname();
  const moduleKey = useMemo(() => normalizeModuleKey(pathname), [pathname]);
  const english = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ToolboxTab>("notes");
  const [notes, setNotes] = useState<ToolNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<NoteView>("list");
  const [grouping, setGrouping] = useState<Grouping>("status");
  const [selected, setSelected] = useState<ToolNote | null>(null);
  const [editing, setEditing] = useState<ToolNote | null | undefined>(undefined);
  const [form, setForm] = useState<NoteForm>(EMPTY_NOTE);
  const [saving, setSaving] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("basic");
  const [expression, setExpression] = useState("");
  const [calculatorResult, setCalculatorResult] = useState("");
  const [finance, setFinance] = useState({ principal: "10000", annualRate: "12", periods: "12", payment: "" });

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/toolbox/notes?includeArchived=false", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { notes?: ToolNote[]; message?: string } | null;
    if (response.ok) setNotes(body?.notes || []);
    else setFeedback(body?.message || (english ? "Unable to load notes." : "Chargement des notes impossible."));
    setLoading(false);
  }, [english]);

  useEffect(() => {
    if (open) void loadNotes();
  }, [loadNotes, open]);

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

  function beginCreate(type: ToolNote["noteType"] = "NOTE") {
    setSelected(null);
    setEditing(null);
    setForm({ ...EMPTY_NOTE, noteType: type, status: type === "REMINDER" ? "ACTIVE" : "DRAFT" });
  }

  function beginEdit(note: ToolNote) {
    setSelected(null);
    setEditing(note);
    setForm({
      title: note.title,
      contentHtml: note.contentHtml,
      contentText: note.contentText,
      noteType: note.noteType,
      status: note.status,
      priority: note.priority,
      labels: note.labels || "",
      pinned: note.pinned,
      dueAt: note.dueAt ? note.dueAt.slice(0, 16) : "",
    });
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const endpoint = editing ? `/api/toolbox/notes/${editing.id}` : "/api/toolbox/notes";
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        moduleKey,
        labels: form.labels.split(",").map((label) => label.trim()).filter(Boolean),
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
      }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.ok) {
      setEditing(undefined);
      setFeedback(english ? "Note saved." : "Note enregistrée.");
      await loadNotes();
    } else setFeedback(body?.message || (english ? "Unable to save." : "Enregistrement impossible."));
    setSaving(false);
  }

  async function mutateNote(note: ToolNote, patch: Partial<NoteForm>) {
    const response = await fetch(`/api/toolbox/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setFeedback(response.ok ? (english ? "Note updated." : "Note actualisée.") : body?.message || (english ? "Unable to update." : "Mise à jour impossible."));
    if (response.ok) await loadNotes();
  }

  async function archiveNote(note: ToolNote) {
    const response = await fetch(`/api/toolbox/notes/${note.id}`, { method: "DELETE" });
    setFeedback(response.ok ? (english ? "Note archived." : "Note archivée.") : (english ? "Unable to archive." : "Archivage impossible."));
    if (response.ok) {
      setSelected(null);
      await loadNotes();
    }
  }

  async function clipboardAction(action: "copy" | "cut" | "paste") {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      if (action === "paste") {
        const text = await navigator.clipboard.readText();
        document.execCommand("insertText", false, text);
      } else {
        document.execCommand(action);
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      setFeedback(english ? `Clipboard action completed: ${action}.` : `Action presse-papiers effectuée : ${action}.`);
    } catch {
      setFeedback(english ? "The browser denied clipboard access. Use the keyboard shortcut." : "Le navigateur a refusé l’accès au presse-papiers. Utilisez le raccourci clavier.");
    }
  }

  function calculate() {
    try {
      const result = evaluateProfessionalExpression(expression, calculatorMode === "scientific");
      setCalculatorResult(Number.isFinite(result) ? formatCalculatorNumber(result, english) : (english ? "Invalid result" : "Résultat non valide"));
    } catch (error) {
      setCalculatorResult(error instanceof Error ? error.message : (english ? "Invalid expression" : "Expression non valide"));
    }
  }

  function calculateFinance(kind: "payment" | "future" | "present") {
    const principal = Number(finance.principal.replace(",", "."));
    const annualRate = Number(finance.annualRate.replace(",", ".")) / 100;
    const periods = Math.max(1, Math.round(Number(finance.periods)));
    if (![principal, annualRate, periods].every(Number.isFinite)) return setCalculatorResult(english ? "Check the financial inputs." : "Vérifiez les données financières.");
    const rate = annualRate / 12;
    const value = kind === "payment"
      ? (rate === 0 ? principal / periods : principal * rate / (1 - Math.pow(1 + rate, -periods)))
      : kind === "future"
        ? principal * Math.pow(1 + rate, periods)
        : principal / Math.pow(1 + rate, periods);
    setCalculatorResult(`${formatCalculatorNumber(value, english)} USD`);
  }

  const tabs = [
    { id: "notes" as const, label: english ? "Notes & reminders" : "Notes & pense-bêtes", icon: StickyNote },
    { id: "calculator" as const, label: english ? "Professional calculator" : "Calculatrice professionnelle", icon: Calculator },
  ];

  useFloatingAction({
    id: "professional-toolbox",
    label: english ? "Professional toolbox" : "Boîte à outils professionnelle",
    icon: Wrench,
    order: 10,
    onSelect: () => setOpen(true),
  });

  return (
    <>
      <Dialog
        open={open}
        title={english ? "Professional toolbox" : "Boîte à outils professionnelle"}
        description={english ? `Persistent tools for ${moduleLabel(moduleKey)}.` : `Outils persistants liés au module ${moduleLabel(moduleKey)}.`}
        onClose={() => setOpen(false)}
        className="h-[94dvh] max-w-6xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
            {tabs.map((item) => <ToolTab key={item.id} active={tab === item.id} label={item.label} icon={item.icon} onClick={() => setTab(item.id)} />)}
          </div>
          {feedback ? <p className="shrink-0 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm font-semibold text-dtsc-ink" role="status">{feedback}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "notes" ? (
              <section className="min-w-0 space-y-4" aria-label={english ? "Professional notes" : "Notes professionnelles"}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="min-w-0">
                    <h3 className="font-black text-dtsc-ink">{english ? "Persistent notes by module" : "Notes persistantes par module"}</h3>
                    <p className="mt-1 text-sm leading-6 text-dtsc-muted">{english ? "Create several notes, organize them and reopen their dedicated details." : "Créez plusieurs notes, organisez-les et rouvrez leurs détails dans une vue dédiée."}</p>
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
                  visibleNotes.length ? <BusinessList ariaLabel={english ? "Professional notes" : "Notes professionnelles"}>{visibleNotes.map((note) => <NoteListItem key={note.id} note={note} english={english} onOpen={() => setSelected(note)} onEdit={() => beginEdit(note)} onArchive={() => void archiveNote(note)} onPin={() => void mutateNote(note, { pinned: !note.pinned })} />)}</BusinessList> : <EmptyState compact title={english ? "No note" : "Aucune note"} description={english ? "Create the first note for this module." : "Créez la première note de ce module."} icon={StickyNote} />
                ) : columns.length ? (
                  <div className="flex min-w-0 gap-3 overflow-x-auto pb-2" aria-label="Kanban notes">
                    {columns.map((column) => <section key={column.id} className="w-[min(86vw,22rem)] shrink-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-3"><div className="mb-3 flex items-center justify-between gap-2"><h4 className="break-words font-black text-dtsc-ink">{column.label}</h4><StatusBadge>{column.items.length}</StatusBadge></div><div className="grid gap-2">{column.items.map((note) => <button key={note.id} type="button" onClick={() => setSelected(note)} className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-left transition hover:border-cyan-400"><div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-black text-dtsc-ink">{note.title}</p>{note.pinned ? <Pin className="h-4 w-4 shrink-0 text-cyan-600" /> : null}</div><p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-dtsc-muted">{note.contentText || (english ? "Empty note" : "Note vide")}</p><div className="mt-3 flex flex-wrap gap-1"><StatusBadge tone={priorityTone(note.priority)}>{enumLabel(note.priority, english)}</StatusBadge><StatusBadge>{noteGroupLabel("noteType", note.noteType, english)}</StatusBadge></div></button>)}</div></section>)}
                  </div>
                ) : <EmptyState compact title={english ? "No note" : "Aucune note"} description={english ? "No note matches the filters." : "Aucune note ne correspond aux filtres."} icon={StickyNote} />}
              </section>
            ) : (
              <CalculatorWorkspace english={english} mode={calculatorMode} setMode={setCalculatorMode} expression={expression} setExpression={setExpression} result={calculatorResult} calculate={calculate} finance={finance} setFinance={setFinance} calculateFinance={calculateFinance} />
            )}
          </div>
        </div>
      </Dialog>

      <Dialog open={selected !== null} title={selected?.title || ""} description={selected ? `${noteGroupLabel("noteType", selected.noteType, english)} · ${moduleLabel(selected.moduleKey)}` : ""} onClose={() => setSelected(null)} className="h-[96dvh] max-w-5xl">
        {selected ? <div className="min-w-0 space-y-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(selected.status)}>{enumLabel(selected.status, english)}</StatusBadge><StatusBadge tone={priorityTone(selected.priority)}>{enumLabel(selected.priority, english)}</StatusBadge>{selected.pinned ? <StatusBadge tone="info">{english ? "Pinned" : "Épinglée"}</StatusBadge> : null}</div><article className="prose prose-sm max-w-none break-words rounded-2xl border border-dtsc-border bg-dtsc-page p-4 text-dtsc-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: selected.contentHtml || `<p>${escapeHtml(selected.contentText || (english ? "Empty note" : "Note vide"))}</p>` }} /><div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2"><Detail label={english ? "Module" : "Module"} value={moduleLabel(selected.moduleKey)} /><Detail label={english ? "Last update" : "Dernière modification"} value={new Date(selected.updatedAt).toLocaleString(english ? "en-GB" : "fr-FR")} />{selected.dueAt ? <Detail label={english ? "Due date" : "Échéance"} value={new Date(selected.dueAt).toLocaleString(english ? "en-GB" : "fr-FR")} /> : null}<Detail label={english ? "Labels" : "Étiquettes"} value={selected.labels || "—"} /></div><div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => void mutateNote(selected, { status: selected.status === "DONE" ? "ACTIVE" : "DONE" })} className="rounded-xl"><Check className="h-4 w-4" /> {selected.status === "DONE" ? (english ? "Reopen" : "Rouvrir") : (english ? "Complete" : "Terminer")}</Button><Button type="button" variant="outline" onClick={() => beginEdit(selected)} className="rounded-xl"><Pencil className="h-4 w-4" /> {english ? "Edit" : "Modifier"}</Button><Button type="button" variant="outline" onClick={() => void archiveNote(selected)} className="rounded-xl text-red-700"><Archive className="h-4 w-4" /> {english ? "Archive" : "Archiver"}</Button></div></div> : null}
      </Dialog>

      <Dialog open={editing !== undefined} title={editing ? (english ? "Edit note" : "Modifier la note") : (english ? "New note" : "Nouvelle note")} description={english ? "Rich, stable and persistent editor." : "Éditeur riche, stable et persistant."} onClose={() => setEditing(undefined)} className="h-[96dvh] max-w-5xl">
        <form onSubmit={saveNote} className="grid min-w-0 gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-black text-dtsc-ink sm:col-span-2">{english ? "Title" : "Titre"}<Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required maxLength={160} className="h-12 rounded-xl bg-dtsc-page" /></label><SelectField label={english ? "Type" : "Type"} value={form.noteType} onChange={(value) => setForm((current) => ({ ...current, noteType: value as ToolNote["noteType"] }))} options={["NOTE", "REMINDER"]} english={english} /><SelectField label={english ? "Priority" : "Priorité"} value={form.priority} onChange={(value) => setForm((current) => ({ ...current, priority: value as ToolNote["priority"] }))} options={["LOW", "NORMAL", "HIGH", "CRITICAL"]} english={english} /><SelectField label={english ? "Status" : "Statut"} value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value as ToolNote["status"] }))} options={["DRAFT", "ACTIVE", "DONE"]} english={english} /><label className="grid gap-1 text-sm font-black text-dtsc-ink">{english ? "Due date" : "Échéance"}<Input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} className="h-12 rounded-xl bg-dtsc-page" /></label></div>
          <label className="grid gap-1 text-sm font-black text-dtsc-ink">{english ? "Labels, separated by commas" : "Étiquettes séparées par des virgules"}<Input value={form.labels} onChange={(event) => setForm((current) => ({ ...current, labels: event.target.value }))} className="h-12 rounded-xl bg-dtsc-page" /></label>
          <div className="flex flex-wrap gap-2 rounded-xl border border-dtsc-border bg-dtsc-page p-2" aria-label={english ? "Quick editing actions" : "Actions rapides d’édition"}><Button type="button" variant="outline" size="sm" onClick={() => void clipboardAction("copy")}><ClipboardCopy className="h-4 w-4" /> {english ? "Copy" : "Copier"}</Button><Button type="button" variant="outline" size="sm" onClick={() => void clipboardAction("cut")}><Scissors className="h-4 w-4" /> {english ? "Cut" : "Couper"}</Button><Button type="button" variant="outline" size="sm" onClick={() => void clipboardAction("paste")}><ClipboardPaste className="h-4 w-4" /> {english ? "Paste" : "Coller"}</Button></div>
          <div className="min-w-0"><RichTextEditor ref={editorRef} textName="contentText" htmlName="contentHtml" defaultValue={form.contentHtml} placeholder={english ? "Write a professional note…" : "Rédigez une note professionnelle…"} minHeightClassName="min-h-[20rem]" onContentChange={(content) => setForm((current) => ({ ...current, contentText: content.text, contentHtml: content.html }))} /></div>
          <label className="inline-flex items-center gap-2 text-sm font-bold text-dtsc-ink"><input type="checkbox" checked={form.pinned} onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))} />{english ? "Pin this note" : "Épingler cette note"}</label>
          <div data-responsive-actions className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(undefined)} className="rounded-xl">{english ? "Cancel" : "Annuler"}</Button><Button type="submit" disabled={saving || !form.title.trim()} className="rounded-xl bg-dtsc-blue text-white"><Save className="h-4 w-4" /> {english ? "Save" : "Enregistrer"}</Button></div>
        </form>
      </Dialog>
    </>
  );
}

function ToolTab({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof StickyNote; onClick: () => void }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black", active ? "border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft")}><Icon className="h-4 w-4" />{label}</button>; }
function ViewButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof List; onClick: () => void }) { return <button type="button" onClick={onClick} aria-pressed={active} className={cn("inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-black", active ? "bg-dtsc-blue text-white" : "text-dtsc-muted")}><Icon className="h-4 w-4" />{label}</button>; }

function NoteListItem({ note, english, onOpen, onEdit, onArchive, onPin }: { note: ToolNote; english: boolean; onOpen: () => void; onEdit: () => void; onArchive: () => void; onPin: () => void }) {
  return <BusinessListItem title={note.title} meta={`${moduleLabel(note.moduleKey)} · ${new Date(note.updatedAt).toLocaleDateString(english ? "en-GB" : "fr-FR")}`} description={note.contentText || (english ? "Empty note" : "Note vide")} onOpen={onOpen} status={<div className="flex flex-wrap gap-1"><StatusBadge tone={statusTone(note.status)}>{enumLabel(note.status, english)}</StatusBadge><StatusBadge tone={priorityTone(note.priority)}>{enumLabel(note.priority, english)}</StatusBadge></div>} actions={<ContextActions label={english ? "Note actions" : "Actions de la note"} actions={[{ id: "open", label: english ? "Open" : "Ouvrir", onSelect: onOpen }, { id: "pin", label: note.pinned ? (english ? "Unpin" : "Désépingler") : (english ? "Pin" : "Épingler"), icon: Pin, onSelect: onPin }, { id: "edit", label: english ? "Edit" : "Modifier", icon: Pencil, onSelect: onEdit }, { id: "archive", label: english ? "Archive" : "Archiver", icon: Trash2, destructive: true, separatorBefore: true, onSelect: onArchive }]} />}/>;
}

function CalculatorWorkspace({ english, mode, setMode, expression, setExpression, result, calculate, finance, setFinance, calculateFinance }: { english: boolean; mode: CalculatorMode; setMode: (mode: CalculatorMode) => void; expression: string; setExpression: (value: string | ((current: string) => string)) => void; result: string; calculate: () => void; finance: { principal: string; annualRate: string; periods: string; payment: string }; setFinance: (value: { principal: string; annualRate: string; periods: string; payment: string }) => void; calculateFinance: (kind: "payment" | "future" | "present") => void }) {
  const modes = [{ id: "basic" as const, label: english ? "Basic" : "Standard", icon: Calculator }, { id: "scientific" as const, label: english ? "Scientific" : "Scientifique", icon: Sigma }, { id: "financial" as const, label: english ? "Financial" : "Financière", icon: WalletCards }];
  return <section className="grid min-w-0 gap-4" aria-label={english ? "Professional calculator" : "Calculatrice professionnelle"}><div className="flex gap-2 overflow-x-auto pb-1">{modes.map((item) => <ToolTab key={item.id} active={mode === item.id} label={item.label} icon={item.icon} onClick={() => setMode(item.id)} />)}</div>{mode !== "financial" ? <><div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex items-start gap-3"><HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" /><p className="text-sm leading-6 text-dtsc-muted">{mode === "scientific" ? (english ? "Functions: sqrt, sin, cos, tan, log, ln, abs, pow; constants pi and e. Trigonometry uses radians." : "Fonctions : sqrt, sin, cos, tan, log, ln, abs, pow ; constantes pi et e. La trigonométrie utilise les radians.") : (english ? "Operators: +, −, ×, ÷, %, powers and parentheses." : "Opérateurs : +, −, ×, ÷, %, puissances et parenthèses.")}</p></div></div><form onSubmit={(event) => { event.preventDefault(); calculate(); }} className="grid gap-3"><Input value={expression} onChange={(event) => setExpression(event.target.value)} inputMode="decimal" placeholder={mode === "scientific" ? "sqrt(144) + sin(pi/2)" : "(1250 * 1.18) - 200"} className="h-14 rounded-2xl bg-dtsc-surface text-lg font-black" /><div className="flex flex-wrap gap-2">{(mode === "scientific" ? ["sin(", "cos(", "tan(", "sqrt(", "log(", "ln(", "abs(", "pow(", "pi", "e", "^", ","] : []).concat(["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "%", "+", "(", ")"]).map((key) => <button key={key} type="button" onClick={() => setExpression((current) => `${current}${key}`)} className="h-11 min-w-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-ink hover:bg-dtsc-soft">{key}</button>)}<button type="button" onClick={() => setExpression((current) => current.slice(0, -1))} className="h-11 min-w-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3"><X className="mx-auto h-4 w-4" /></button></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setExpression("")}><RotateCcw className="h-4 w-4" />{english ? "Reset" : "Réinitialiser"}</Button><Button type="submit" className="bg-dtsc-blue text-white"><Calculator className="h-4 w-4" />{english ? "Calculate" : "Calculer"}</Button></div></form></> : <><div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4"><div className="flex items-start gap-3"><HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" /><p className="text-sm leading-6 text-dtsc-muted">{english ? "Estimate a constant-payment loan, future value or present value. The monthly rate is derived from the annual nominal rate." : "Estimez une mensualité constante, une valeur future ou une valeur actuelle. Le taux mensuel est dérivé du taux annuel nominal."}</p></div></div><div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3"><FinanceInput label={english ? "Principal" : "Capital"} value={finance.principal} onChange={(value) => setFinance({ ...finance, principal: value })} /><FinanceInput label={english ? "Annual rate (%)" : "Taux annuel (%)"} value={finance.annualRate} onChange={(value) => setFinance({ ...finance, annualRate: value })} /><FinanceInput label={english ? "Months" : "Nombre de mois"} value={finance.periods} onChange={(value) => setFinance({ ...finance, periods: value })} /></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => calculateFinance("payment")} className="bg-dtsc-blue text-white">{english ? "Monthly payment" : "Mensualité"}</Button><Button type="button" variant="outline" onClick={() => calculateFinance("future")}>{english ? "Future value" : "Valeur future"}</Button><Button type="button" variant="outline" onClick={() => calculateFinance("present")}>{english ? "Present value" : "Valeur actuelle"}</Button></div></>}<div className="rounded-2xl border border-cyan-400/35 bg-cyan-400/10 p-5" aria-live="polite"><p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-200">{english ? "Result" : "Résultat"}</p><p className="mt-2 break-words text-3xl font-black text-dtsc-ink">{result || "—"}</p></div></section>;
}

function FinanceInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink">{label}<Input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="h-12 rounded-xl bg-dtsc-page" /></label>; }
function SelectField({ label, value, onChange, options, english }: { label: string; value: string; onChange: (value: string) => void; options: string[]; english: boolean }) { return <label className="grid gap-1 text-sm font-black text-dtsc-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm text-dtsc-ink">{options.map((option) => <option key={option} value={option}>{enumLabel(option, english)}</option>)}</select></label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-dtsc-border bg-dtsc-page p-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">{label}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }

function normalizeModuleKey(pathname: string | null) { return (pathname?.split("/").filter(Boolean)[0] || "dashboard").replace(/[^a-z0-9-]/gi, "-").toLowerCase(); }
function moduleLabel(key: string) { return key.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function enumLabel(value: string, english: boolean) { const labels: Record<string, [string, string]> = { NOTE: ["Note", "Note"], REMINDER: ["Pense-bête", "Reminder"], DRAFT: ["Brouillon", "Draft"], ACTIVE: ["Active", "Active"], DONE: ["Terminée", "Done"], ARCHIVED: ["Archivée", "Archived"], LOW: ["Faible", "Low"], NORMAL: ["Normale", "Normal"], HIGH: ["Élevée", "High"], CRITICAL: ["Critique", "Critical"] }; return labels[value]?.[english ? 1 : 0] || value.replaceAll("_", " "); }
function noteGroupLabel(grouping: Grouping, value: string, english: boolean) { return grouping === "moduleKey" ? moduleLabel(value) : enumLabel(value, english); }
function statusTone(status: string): StatusBadgeTone { return status === "DONE" ? "success" : status === "ACTIVE" ? "info" : status === "ARCHIVED" ? "neutral" : "warning"; }
function priorityTone(priority: string): StatusBadgeTone { return priority === "CRITICAL" ? "danger" : priority === "HIGH" ? "warning" : priority === "LOW" ? "info" : "neutral"; }
function formatCalculatorNumber(value: number, english: boolean) { return new Intl.NumberFormat(english ? "en-GB" : "fr-FR", { maximumFractionDigits: 10 }).format(value); }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function evaluateProfessionalExpression(raw: string, scientific: boolean) {
  const normalized = raw.replaceAll("×", "*").replaceAll("÷", "/").trim();
  if (!normalized) throw new Error("Saisissez une expression.");
  return scientific ? new ScientificExpressionParser(normalized).parse() : evaluateArithmetic(normalized.replaceAll(",", "."));
}

class ScientificExpressionParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse() {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.position !== this.source.length) throw new Error("Expression non valide.");
    if (!Number.isFinite(value)) throw new Error("Résultat non valide.");
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      if (this.consume("+")) value += this.parseTerm();
      else if (this.consume("-")) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parsePower();
    while (true) {
      if (this.consume("*")) value *= this.parsePower();
      else if (this.consume("/")) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error("Division par zéro impossible.");
        value /= divisor;
      } else if (this.consume("%")) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error("Division par zéro impossible.");
        value %= divisor;
      } else return value;
    }
  }

  private parsePower(): number {
    let value = this.parseUnary();
    if (this.consume("^")) value = Math.pow(value, this.parsePower());
    return value;
  }

  private parseUnary(): number {
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipSpaces();
    if (this.consume("(")) {
      const value = this.parseExpression();
      if (!this.consume(")")) throw new Error("Parenthèses non équilibrées.");
      return value;
    }

    const number = this.readNumber();
    if (number !== null) return number;

    const identifier = this.readIdentifier();
    if (!identifier) throw new Error("Expression incomplète.");
    const normalized = identifier.toLowerCase();
    if (normalized === "pi") return Math.PI;
    if (normalized === "e") return Math.E;
    if (!this.consume("(")) throw new Error("Fonction non autorisée.");
    const args = [this.parseExpression()];
    while (this.consume(",")) args.push(this.parseExpression());
    if (!this.consume(")")) throw new Error("Parenthèses non équilibrées.");
    return applyScientificFunction(normalized, args);
  }

  private readNumber() {
    this.skipSpaces();
    const match = this.source.slice(this.position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return null;
    this.position += match[0].length;
    return Number(match[0]);
  }

  private readIdentifier() {
    this.skipSpaces();
    const match = this.source.slice(this.position).match(/^[a-z]+/i);
    if (!match) return null;
    this.position += match[0].length;
    return match[0];
  }

  private consume(value: string) {
    this.skipSpaces();
    if (!this.source.startsWith(value, this.position)) return false;
    this.position += value.length;
    return true;
  }

  private skipSpaces() {
    while (/\s/.test(this.source[this.position] || "")) this.position += 1;
  }
}

function applyScientificFunction(name: string, args: number[]) {
  const unaryFunctions: Record<string, (value: number) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    log: Math.log10,
    ln: Math.log,
    abs: Math.abs,
  };
  if (name === "pow") {
    if (args.length !== 2) throw new Error("pow exige deux valeurs.");
    return Math.pow(args[0], args[1]);
  }
  const operation = unaryFunctions[name];
  if (!operation || args.length !== 1) throw new Error("Fonction non autorisée.");
  return operation(args[0]);
}

function evaluateArithmetic(expression: string) {
  if (!/^[0-9+\-*/%.()\s]+$/.test(expression)) throw new Error("Caractère non autorisé.");
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  if (tokens.join("").length !== expression.replace(/\s/g, "").length) throw new Error("Expression non valide.");
  const output: Array<number | string> = []; const operators: string[] = []; let previous: string | null = null;
  for (const token of tokens) { if (/^\d/.test(token)) { output.push(Number(token)); previous = "number"; continue; } if (token === "(") { operators.push(token); previous = "("; continue; } if (token === ")") { while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!); if (operators.pop() !== "(") throw new Error("Parenthèses non équilibrées."); previous = ")"; continue; } const normalized = token === "-" && (!previous || previous === "operator" || previous === "(") ? "u-" : token; while (operators.length && operators.at(-1) !== "(" && precedence(operators.at(-1)!) >= precedence(normalized)) output.push(operators.pop()!); operators.push(normalized); previous = "operator"; }
  while (operators.length) { const operator = operators.pop()!; if (operator === "(") throw new Error("Parenthèses non équilibrées."); output.push(operator); }
  const stack: number[] = []; for (const token of output) { if (typeof token === "number") { stack.push(token); continue; } if (token === "u-") { const value = stack.pop(); if (value === undefined) throw new Error("Expression incomplète."); stack.push(-value); continue; } const right = stack.pop(); const left = stack.pop(); if (left === undefined || right === undefined) throw new Error("Expression incomplète."); if ((token === "/" || token === "%") && right === 0) throw new Error("Division par zéro impossible."); stack.push(token === "+" ? left + right : token === "-" ? left - right : token === "*" ? left * right : token === "/" ? left / right : left % right); }
  if (stack.length !== 1) throw new Error("Expression non valide."); return stack[0];
}
function precedence(operator: string) { return operator === "u-" ? 3 : operator === "*" || operator === "/" || operator === "%" ? 2 : 1; }
