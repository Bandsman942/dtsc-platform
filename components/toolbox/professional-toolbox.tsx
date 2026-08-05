"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Check, ClipboardList, Lightbulb, Plus, Save, StickyNote, Trash2, Wrench, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "dtsc-professional-toolbox-v1";

type MemoItem = { id: string; text: string; done: boolean };
type ToolboxState = { notes: string; memos: MemoItem[] };

const DEFAULT_STATE: ToolboxState = { notes: "", memos: [] };

export function ProfessionalToolbox() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notes" | "calculator" | "memos">("notes");
  const [state, setState] = useState<ToolboxState>(DEFAULT_STATE);
  const [memoText, setMemoText] = useState("");
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setState({ ...DEFAULT_STATE, ...(JSON.parse(stored) as ToolboxState) });
    } catch {
      setState(DEFAULT_STATE);
    }
  }, []);

  const hidden = useMemo(() => {
    if (!pathname) return true;
    return pathname.startsWith("/auth/") || pathname === "/" || pathname.startsWith("/contact") || pathname.startsWith("/services") || pathname.startsWith("/solutions") || pathname.startsWith("/secteurs") || pathname.startsWith("/ressources");
  }, [pathname]);

  if (hidden) return null;

  function persist(next: ToolboxState) {
    setState(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function addMemo() {
    const text = memoText.trim();
    if (!text) return;
    persist({ ...state, memos: [{ id: crypto.randomUUID(), text, done: false }, ...state.memos] });
    setMemoText("");
  }

  function calculate() {
    try {
      const value = evaluateExpression(expression);
      setResult(Number.isFinite(value) ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 10 }).format(value) : "Calcul impossible");
    } catch {
      setResult("Expression invalide");
    }
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-3 z-[80] h-12 w-12 rounded-2xl border border-cyan-300/60 bg-[#002b5b] text-white shadow-[0_16px_48px_rgba(0,23,54,0.3)] hover:bg-[#001736] sm:bottom-6 sm:right-6"
        aria-label="Ouvrir la boîte à outils professionnelle"
        title="Boîte à outils professionnelle"
      >
        <Wrench className="h-5 w-5" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Boîte à outils professionnelle" description="Préparez vos décisions sans quitter le module actif. Les brouillons restent privés sur cet appareil." className="h-[92dvh] max-w-3xl">
        <div className="min-w-0 space-y-4">
          <div data-responsive-actions className="grid grid-cols-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-1">
            <ToolTab active={tab === "notes"} onClick={() => setTab("notes")} icon={StickyNote} label="Notes" />
            <ToolTab active={tab === "calculator"} onClick={() => setTab("calculator")} icon={Calculator} label="Calculatrice" />
            <ToolTab active={tab === "memos"} onClick={() => setTab("memos")} icon={ClipboardList} label="Pense-bête" />
          </div>

          {tab === "notes" ? (
            <section className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <div className="flex items-start gap-3"><Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" /><div><h3 className="font-black text-dtsc-ink">Bloc-notes de réflexion</h3><p className="mt-1 text-xs leading-5 text-dtsc-muted">Hypothèses, chiffres, questions ou points de contrôle avant une action métier.</p></div></div>
              <textarea value={state.notes} onChange={(event) => setState((current) => ({ ...current, notes: event.target.value }))} className="mt-4 min-h-[18rem] w-full resize-y rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm leading-6 text-dtsc-ink outline-none focus:border-cyan-400" placeholder="Écrivez votre réflexion…" />
              <div className="mt-3 flex justify-end"><Button type="button" onClick={() => persist(state)} className="rounded-xl bg-dtsc-blue text-white"><Save className="h-4 w-4" />{saved ? "Enregistré" : "Enregistrer sur cet appareil"}</Button></div>
            </section>
          ) : null}

          {tab === "calculator" ? (
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <h3 className="font-black text-dtsc-ink">Calculatrice rapide</h3>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">Opérations prises en charge : +, −, ×, ÷ et parenthèses.</p>
              <form onSubmit={(event) => { event.preventDefault(); calculate(); }} className="mt-4 space-y-3">
                <Input value={expression} onChange={(event) => setExpression(event.target.value)} inputMode="decimal" placeholder="Ex. (1250 + 350) * 1.16" className="h-14 rounded-xl bg-dtsc-surface text-lg font-black" />
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-5"><p className="text-xs font-black uppercase tracking-[0.1em] text-dtsc-muted">Résultat</p><p className="mt-2 break-words text-3xl font-black text-dtsc-ink">{result || "—"}</p></div>
                <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setExpression(""); setResult(""); }} className="rounded-xl"><X className="h-4 w-4" />Effacer</Button><Button type="submit" className="rounded-xl bg-dtsc-blue text-white"><Calculator className="h-4 w-4" />Calculer</Button></div>
              </form>
            </section>
          ) : null}

          {tab === "memos" ? (
            <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <h3 className="font-black text-dtsc-ink">Pense-bête opérationnel</h3>
              <form onSubmit={(event) => { event.preventDefault(); addMemo(); }} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"><Input value={memoText} onChange={(event) => setMemoText(event.target.value)} placeholder="Ajouter un point à vérifier…" className="h-11 min-w-0 flex-1 rounded-xl bg-dtsc-surface" /><Button type="submit" className="rounded-xl bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Ajouter</Button></form>
              <div className="mt-4 space-y-2">
                {state.memos.map((memo) => <div key={memo.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-surface p-3"><button type="button" onClick={() => persist({ ...state, memos: state.memos.map((item) => item.id === memo.id ? { ...item, done: !item.done } : item) })} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${memo.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-dtsc-border"}`} aria-label={memo.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>{memo.done ? <Check className="h-4 w-4" /> : null}</button><p className={`min-w-0 flex-1 break-words text-sm leading-6 ${memo.done ? "text-dtsc-muted line-through" : "font-bold text-dtsc-ink"}`}>{memo.text}</p><Button type="button" size="icon" variant="ghost" onClick={() => persist({ ...state, memos: state.memos.filter((item) => item.id !== memo.id) })} className="h-8 w-8 shrink-0 rounded-lg text-red-700" aria-label="Supprimer le pense-bête"><Trash2 className="h-4 w-4" /></Button></div>)}
                {!state.memos.length ? <p className="rounded-xl border border-dashed border-dtsc-border p-6 text-center text-sm text-dtsc-muted">Aucun pense-bête.</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function ToolTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof StickyNote; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${active ? "bg-dtsc-surface text-dtsc-blue shadow-sm" : "text-dtsc-muted"}`}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></button>;
}

function evaluateExpression(input: string) {
  const source = input.replaceAll("×", "*").replaceAll("÷", "/").replaceAll(",", ".").replace(/\s+/g, "");
  if (!source || !/^[0-9.+\-*/()]+$/.test(source)) throw new Error("invalid");
  let index = 0;
  function parseExpression(): number { let value = parseTerm(); while (source[index] === "+" || source[index] === "-") { const operator = source[index++]; const right = parseTerm(); value = operator === "+" ? value + right : value - right; } return value; }
  function parseTerm(): number { let value = parseFactor(); while (source[index] === "*" || source[index] === "/") { const operator = source[index++]; const right = parseFactor(); if (operator === "/" && right === 0) throw new Error("zero"); value = operator === "*" ? value * right : value / right; } return value; }
  function parseFactor(): number { if (source[index] === "+") { index++; return parseFactor(); } if (source[index] === "-") { index++; return -parseFactor(); } if (source[index] === "(") { index++; const value = parseExpression(); if (source[index++] !== ")") throw new Error("parenthesis"); return value; } const start = index; while (/[0-9.]/.test(source[index] || "")) index++; const token = source.slice(start, index); if (!token || (token.match(/\./g)?.length || 0) > 1) throw new Error("number"); return Number(token); }
  const value = parseExpression();
  if (index !== source.length) throw new Error("trailing");
  return value;
}
