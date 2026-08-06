"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Check, ClipboardPenLine, Lightbulb, Plus, RotateCcw, Save, StickyNote, Trash2, Wrench, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ToolboxTab = "notes" | "calculator" | "reminders";
type Reminder = { id: string; text: string; dueAt: string; done: boolean; createdAt: string };

const STORAGE_PREFIX = "dtsc:professional-toolbox:v1";

export function ProfessionalToolbox() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ToolboxTab>("notes");
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [expression, setExpression] = useState("");
  const [calculatorResult, setCalculatorResult] = useState<string>("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderText, setReminderText] = useState("");
  const [reminderDueAt, setReminderDueAt] = useState("");
  const moduleKey = useMemo(() => normalizeModuleKey(pathname), [pathname]);

  useEffect(() => {
    try {
      const storedNotes = window.localStorage.getItem(`${STORAGE_PREFIX}:notes:${moduleKey}`) || "";
      const storedReminders = window.localStorage.getItem(`${STORAGE_PREFIX}:reminders`);
      setNotes(storedNotes);
      setSavedNotes(storedNotes);
      setReminders(storedReminders ? safeReminderList(JSON.parse(storedReminders)) : []);
    } catch {
      setNotes("");
      setSavedNotes("");
      setReminders([]);
    }
  }, [moduleKey]);

  function saveNotes() {
    window.localStorage.setItem(`${STORAGE_PREFIX}:notes:${moduleKey}`, notes);
    setSavedNotes(notes);
  }

  function clearNotes() {
    setNotes("");
    window.localStorage.removeItem(`${STORAGE_PREFIX}:notes:${moduleKey}`);
    setSavedNotes("");
  }

  function calculate() {
    try {
      const result = evaluateArithmetic(expression);
      setCalculatorResult(Number.isFinite(result) ? formatCalculatorNumber(result) : "Résultat non valide");
    } catch (error) {
      setCalculatorResult(error instanceof Error ? error.message : "Expression non valide");
    }
  }

  function addReminder() {
    const text = reminderText.trim();
    if (!text) return;
    const next = [
      ...reminders,
      { id: crypto.randomUUID(), text, dueAt: reminderDueAt, done: false, createdAt: new Date().toISOString() },
    ];
    setReminders(next);
    persistReminders(next);
    setReminderText("");
    setReminderDueAt("");
  }

  function updateReminder(id: string, patch: Partial<Reminder>) {
    const next = reminders.map((reminder) => reminder.id === id ? { ...reminder, ...patch } : reminder);
    setReminders(next);
    persistReminders(next);
  }

  function removeReminder(id: string) {
    const next = reminders.filter((reminder) => reminder.id !== id);
    setReminders(next);
    persistReminders(next);
  }

  function persistReminders(next: Reminder[]) {
    window.localStorage.setItem(`${STORAGE_PREFIX}:reminders`, JSON.stringify(next));
  }

  const tabs: Array<{ id: ToolboxTab; label: string; icon: typeof StickyNote }> = [
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "calculator", label: "Calculatrice", icon: Calculator },
    { id: "reminders", label: "Pense-bête", icon: Lightbulb },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 z-[940] inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/60 bg-[#002b5b] text-white shadow-[0_18px_50px_rgba(0,43,91,.35)] transition hover:-translate-y-0.5 hover:bg-[#001736] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 sm:bottom-6 sm:right-6"
        aria-label="Ouvrir la boîte à outils professionnelle"
        title="Boîte à outils professionnelle"
      >
        <Wrench className="h-6 w-6" />
      </button>

      <Dialog
        open={open}
        title="Boîte à outils professionnelle"
        description={`Outils rapides liés au module ${moduleLabel(moduleKey)}. Les notes et pense-bêtes restent privés dans ce navigateur.`}
        onClose={() => setOpen(false)}
        className="h-[min(92dvh,48rem)] max-w-3xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Outils disponibles">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black",
                    tab === item.id
                      ? "border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200"
                      : "border-dtsc-border bg-dtsc-page text-dtsc-muted hover:bg-dtsc-soft",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "notes" ? (
              <section className="grid gap-4" aria-label="Notes rapides">
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <div className="flex items-start gap-3">
                    <ClipboardPenLine className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
                    <div>
                      <h3 className="font-black text-dtsc-ink">Bloc-notes du module</h3>
                      <p className="mt-1 text-sm leading-6 text-dtsc-muted">Préparez une décision, un calcul, un argument ou une liste de contrôles sans quitter l’écran métier.</p>
                    </div>
                  </div>
                </div>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Écrivez vos notes de travail…"
                  className="min-h-64 w-full resize-y rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 text-sm leading-6 text-dtsc-ink outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/20"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-dtsc-muted">{notes === savedNotes ? "Notes enregistrées" : "Modifications non enregistrées"}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={clearNotes} className="rounded-xl"><Trash2 className="h-4 w-4" /> Effacer</Button>
                    <Button type="button" onClick={saveNotes} disabled={notes === savedNotes} className="rounded-xl bg-dtsc-blue text-white"><Save className="h-4 w-4" /> Enregistrer</Button>
                  </div>
                </div>
              </section>
            ) : null}

            {tab === "calculator" ? (
              <section className="grid gap-4" aria-label="Calculatrice professionnelle">
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <h3 className="font-black text-dtsc-ink">Calculatrice rapide</h3>
                  <p className="mt-1 text-sm leading-6 text-dtsc-muted">Opérations supportées : +, −, ×, ÷, %, parenthèses et nombres décimaux.</p>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); calculate(); }} className="grid gap-3">
                  <Input
                    value={expression}
                    onChange={(event) => setExpression(event.target.value)}
                    inputMode="decimal"
                    placeholder="Ex. (1250 * 1.18) - 200"
                    className="h-14 rounded-2xl bg-dtsc-surface text-lg font-black"
                    aria-label="Expression à calculer"
                  />
                  <div className="flex flex-wrap gap-2">
                    {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "%", "+", "(", ")"].map((key) => (
                      <button key={key} type="button" onClick={() => setExpression((current) => `${current}${key}`)} className="h-11 min-w-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-ink hover:bg-dtsc-soft">{key}</button>
                    ))}
                    <button type="button" onClick={() => setExpression((current) => current.slice(0, -1))} className="h-11 min-w-12 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-black text-dtsc-ink hover:bg-dtsc-soft"><X className="mx-auto h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => { setExpression(""); setCalculatorResult(""); }} className="rounded-xl"><RotateCcw className="h-4 w-4" /> Réinitialiser</Button>
                    <Button type="submit" className="rounded-xl bg-dtsc-blue text-white"><Calculator className="h-4 w-4" /> Calculer</Button>
                  </div>
                </form>
                <div className="rounded-2xl border border-cyan-400/35 bg-cyan-400/10 p-5" aria-live="polite">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-200">Résultat</p>
                  <p className="mt-2 break-words text-3xl font-black text-dtsc-ink">{calculatorResult || "—"}</p>
                </div>
              </section>
            ) : null}

            {tab === "reminders" ? (
              <section className="grid gap-4" aria-label="Pense-bête professionnel">
                <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
                  <h3 className="font-black text-dtsc-ink">Pense-bête</h3>
                  <p className="mt-1 text-sm leading-6 text-dtsc-muted">Conservez une action à vérifier avant de valider, envoyer, payer ou clôturer une opération.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                  <Input value={reminderText} onChange={(event) => setReminderText(event.target.value)} placeholder="Action à ne pas oublier…" className="h-12 rounded-xl bg-dtsc-surface" />
                  <Input type="datetime-local" value={reminderDueAt} onChange={(event) => setReminderDueAt(event.target.value)} className="h-12 rounded-xl bg-dtsc-surface" aria-label="Échéance du pense-bête" />
                  <Button type="button" onClick={addReminder} disabled={!reminderText.trim()} className="h-12 rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" /> Ajouter</Button>
                </div>
                <div className="grid gap-2">
                  {reminders.map((reminder) => (
                    <article key={reminder.id} className={cn("flex min-w-0 items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-3", reminder.done && "opacity-65")}>
                      <button type="button" onClick={() => updateReminder(reminder.id, { done: !reminder.done })} className={cn("mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", reminder.done ? "border-emerald-500 bg-emerald-500/15 text-emerald-700" : "border-dtsc-border bg-dtsc-page text-dtsc-muted")} aria-label={reminder.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>{reminder.done ? <Check className="h-4 w-4" /> : null}</button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("break-words text-sm font-black text-dtsc-ink", reminder.done && "line-through")}>{reminder.text}</p>
                        <p className="mt-1 text-xs text-dtsc-muted">{reminder.dueAt ? `Échéance : ${new Date(reminder.dueAt).toLocaleString("fr-FR")}` : "Sans échéance"}</p>
                      </div>
                      <Button type="button" size="icon" variant="outline" onClick={() => removeReminder(reminder.id)} className="h-9 w-9 shrink-0 rounded-full" aria-label="Supprimer le pense-bête"><Trash2 className="h-4 w-4" /></Button>
                    </article>
                  ))}
                  {!reminders.length ? <p className="rounded-2xl border border-dashed border-dtsc-border p-6 text-center text-sm text-dtsc-muted">Aucun pense-bête enregistré.</p> : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </Dialog>
    </>
  );
}

function normalizeModuleKey(pathname: string | null) {
  const first = pathname?.split("/").filter(Boolean)[0] || "dashboard";
  return first.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function moduleLabel(key: string) {
  return key.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeReminderList(value: unknown): Reminder[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Reminder => Boolean(item && typeof item === "object" && typeof (item as Reminder).id === "string" && typeof (item as Reminder).text === "string"));
}

function formatCalculatorNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value);
}

function evaluateArithmetic(raw: string) {
  const expression = raw.replaceAll("×", "*").replaceAll("÷", "/").replaceAll(",", ".").trim();
  if (!expression) throw new Error("Saisissez une expression.");
  if (!/^[0-9+\-*/%.()\s]+$/.test(expression)) throw new Error("Caractère non autorisé.");
  const tokens = tokenize(expression);
  const output: Array<number | string> = [];
  const operators: string[] = [];
  let previous: string | null = null;
  for (const token of tokens) {
    if (/^\d/.test(token)) {
      output.push(Number(token));
      previous = "number";
      continue;
    }
    if (token === "(") {
      operators.push(token);
      previous = "(";
      continue;
    }
    if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!);
      if (operators.pop() !== "(") throw new Error("Parenthèses non équilibrées.");
      previous = ")";
      continue;
    }
    const normalized = token === "-" && (!previous || previous === "operator" || previous === "(") ? "u-" : token;
    while (operators.length && operators.at(-1) !== "(" && precedence(operators.at(-1)!) >= precedence(normalized)) output.push(operators.pop()!);
    operators.push(normalized);
    previous = "operator";
  }
  while (operators.length) {
    const operator = operators.pop()!;
    if (operator === "(") throw new Error("Parenthèses non équilibrées.");
    output.push(operator);
  }
  const stack: number[] = [];
  for (const token of output) {
    if (typeof token === "number") {
      stack.push(token);
      continue;
    }
    if (token === "u-") {
      const value = stack.pop();
      if (value === undefined) throw new Error("Expression incomplète.");
      stack.push(-value);
      continue;
    }
    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) throw new Error("Expression incomplète.");
    if ((token === "/" || token === "%") && right === 0) throw new Error("Division par zéro impossible.");
    stack.push(token === "+" ? left + right : token === "-" ? left - right : token === "*" ? left * right : token === "/" ? left / right : left % right);
  }
  if (stack.length !== 1) throw new Error("Expression non valide.");
  return stack[0];
}

function tokenize(expression: string) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  if (tokens.join("").length !== expression.replace(/\s/g, "").length) throw new Error("Expression non valide.");
  return tokens;
}

function precedence(operator: string) {
  if (operator === "u-") return 3;
  if (operator === "*" || operator === "/" || operator === "%") return 2;
  return 1;
}
