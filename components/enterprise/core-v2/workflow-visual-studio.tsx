"use client";

import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { projectWorkflowVersion, type WorkflowVisualNode } from "@/lib/enterprise/workflows/visual-projection";

type VisualStep = { code: string; name: string; description?: string | null; stepType: string; position: number };
type VisualTransition = { fromStepCode?: string; toStepCode?: string; outcome?: string | null; priority: number };
type Configuration = Record<string, string | number | boolean | null>;
type Props = {
  locale?: string | null;
  steps: VisualStep[];
  transitions: VisualTransition[];
  configuration: Configuration;
  editable: boolean;
  onMove: (code: string, x: number, y: number) => void;
  onRename: (code: string, name: string, description: string) => void;
  onConnect: (from: string, to: string, outcome: string) => void;
  onAddStep: () => void;
  onDeleteStep: (code: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  undoAvailable: boolean;
  redoAvailable: boolean;
};

const OUTCOMES = ["DEFAULT", "TRUE", "FALSE", "APPROVED", "REJECTED", "CANCELLED"];
const WIDTH = 188;
const HEIGHT = 78;
const LEFT = 24;
const TOP = 24;

export function WorkflowVisualStudio({
  locale, steps, transitions, configuration, editable, onMove, onRename, onConnect,
  onAddStep, onDeleteStep, onUndo, onRedo, undoAvailable, redoAvailable,
}: Props) {
  const en = locale === "en";
  const markerId = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outcome, setOutcome] = useState("DEFAULT");
  const drag = useRef<{ id: string; x: number; y: number; px: number; py: number } | null>(null);

  const { nodes, edges } = useMemo(
    () => projectWorkflowVersion({
      steps: steps.map((step) => ({ ...step, configuration: {} })),
      transitions: transitions
        .filter((edge): edge is VisualTransition & { fromStepCode: string; toStepCode: string } => Boolean(edge.fromStepCode && edge.toStepCode))
        .map((edge) => ({ ...edge, outcome: edge.outcome || "DEFAULT" })),
      configuration,
    } as Parameters<typeof projectWorkflowVersion>[0]),
    [steps, transitions, configuration],
  );
  const positions = useMemo(() => nodes.map((n) => preview?.id === n.id ? { ...n, x: preview.x, y: preview.y } : n), [nodes, preview]);
  const byId = useMemo(() => new Map(positions.map((node) => [node.id, node])), [positions]);
  const active = steps.find((step) => step.code === selected);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const maxX = Math.max(980, ...positions.map((node) => node.x + WIDTH + 80));
  const maxY = Math.max(460, ...positions.map((node) => node.y + HEIGHT + 80));

  function selectNode(step: VisualStep) {
    setSelected(step.code);
    setLabel(step.name);
    setDescription(step.description || "");
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, node: WorkflowVisualNode) {
    if (!editable || event.button !== 0) return;
    drag.current = { id: node.id, x: node.x, y: node.y, px: event.clientX, py: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    const x = Math.max(0, Math.min(20_000, Math.round(state.x + (event.clientX - state.px) / zoom)));
    const y = Math.max(0, Math.min(20_000, Math.round(state.y + (event.clientY - state.py) / zoom)));
    setPreview({ id: state.id, x, y });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    const x = Math.max(0, Math.min(20_000, Math.round(state.x + (event.clientX - state.px) / zoom)));
    const y = Math.max(0, Math.min(20_000, Math.round(state.y + (event.clientY - state.py) / zoom)));
    setPreview(null);
    if (x !== state.x || y !== state.y) onMove(state.id, x, y);
  }
  function connect() {
    if (!editable || !from || !to || from === to) return;
    if (transitions.some((edge) => edge.fromStepCode === from && edge.toStepCode === to && (edge.outcome || "DEFAULT") === outcome)) return;
    onConnect(from, to, outcome);
  }

  return <section className="grid min-w-0 gap-3" aria-label={en ? "Visual workflow editor" : "Éditeur visuel de workflow"}>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-2">
      <strong className="mr-auto text-sm text-dtsc-ink">{en ? "Visual graph" : "Graphe visuel"}</strong>
      {editable ? <button type="button" className="rounded-lg bg-dtsc-blue px-3 py-2 text-xs font-bold text-white" onClick={onAddStep}>{en ? "Add node" : "Ajouter un nœud"}</button> : null}
      <button type="button" onClick={onUndo} disabled={!editable || !undoAvailable} className="rounded-lg border border-dtsc-border px-3 py-2 text-xs disabled:opacity-40">{en ? "Undo" : "Annuler"}</button>
      <button type="button" onClick={onRedo} disabled={!editable || !redoAvailable} className="rounded-lg border border-dtsc-border px-3 py-2 text-xs disabled:opacity-40">{en ? "Redo" : "Rétablir"}</button>
      <label className="text-xs text-dtsc-muted">{en ? "Zoom" : "Zoom"} <select aria-label={en ? "Zoom level" : "Niveau de zoom"} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="rounded-lg border border-dtsc-border bg-dtsc-page p-2">
        <option value={0.5}>50 %</option><option value={0.75}>75 %</option><option value={1}>100 %</option><option value={1.25}>125 %</option><option value={1.5}>150 %</option>
      </select></label>
    </div>
    <p className="text-xs text-dtsc-muted">{en ? "Desktop: drag nodes to position, or use arrow keys. Mobile: use the structured list and branch form below. Changes require Save, then publication review." : "Ordinateur : déplacez les nœuds ou utilisez les flèches du clavier. Mobile : utilisez la liste et le formulaire de branches. Enregistrez, puis lancez la revue avant publication."}</p>
    <div className="hidden min-w-0 overflow-auto rounded-xl border border-dtsc-border bg-dtsc-page lg:block" tabIndex={0} role="region" aria-label={en ? "Scrollable workflow canvas" : "Canevas de workflow défilant"}>
      <div className="relative" style={{ width: maxX * zoom + LEFT * 2, height: maxY * zoom + TOP * 2 }}>
        <div className="absolute left-6 top-6 origin-top-left" style={{ width: maxX, height: maxY, transform: `scale(${zoom})` }}>
          <svg className="pointer-events-none absolute inset-0" width={maxX} height={maxY} aria-hidden="true">
            <defs><marker id={markerId} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="currentColor" /></marker></defs>
            {edges.map((edge) => {
              const a = byId.get(edge.from), b = byId.get(edge.to);
              if (!a || !b) return null;
              const x1 = a.x + WIDTH, y1 = a.y + HEIGHT / 2, x2 = b.x, y2 = b.y + HEIGHT / 2;
              const middle = x1 + (x2 - x1) / 2;
              return <g key={edge.id}>
                <path d={`M${x1} ${y1} C${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`} fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="2" markerEnd={`url(#${markerId})`} />
                <text x={middle} y={(y1 + y2) / 2 - 8} textAnchor="middle" fontSize="11" fill="currentColor">{edge.outcome === "DEFAULT" ? "" : edge.outcome}</text>
              </g>;
            })}
          </svg>
          {positions.map((node) => <button type="button" key={node.id}
            onClick={() => { const step = steps.find((item) => item.code === node.id); if (step) selectNode(step); }}
            onPointerDown={(event) => pointerDown(event, node)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => { drag.current = null; setPreview(null); }}
            onKeyDown={(event) => { if (!editable || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return; event.preventDefault(); const dx = event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0; const dy = event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0; onMove(node.id, Math.max(0, node.x + dx), Math.max(0, node.y + dy)); }}
            aria-label={`${node.name}, ${node.stepType}, ${en ? "position" : "position"} ${node.x}, ${node.y}`}
            aria-pressed={selected === node.id}
            className={`absolute flex flex-col items-start justify-center overflow-hidden rounded-xl border-2 bg-dtsc-surface px-3 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dtsc-blue ${selected === node.id ? "border-dtsc-blue" : "border-dtsc-border"}`}
            style={{ left: node.x, top: node.y, width: WIDTH, height: HEIGHT, touchAction: "none" }}>
            <span className="block w-full truncate text-xs font-bold text-dtsc-ink">{node.name}</span>
            <span className="block truncate text-[11px] text-dtsc-muted">{node.stepType} · {node.id}</span>
          </button>)}
        </div>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.5fr)]">
      <div className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
        <h3 className="text-sm font-bold text-dtsc-ink">{en ? "Accessible step list" : "Liste accessible des étapes"}</h3>
        <div className="mt-2 grid gap-1">{steps.map((step) => <button key={step.code} type="button" onClick={() => selectNode(step)} aria-pressed={selected === step.code} className="min-w-0 rounded-lg border border-dtsc-border p-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-dtsc-blue"><span className="block truncate font-bold text-dtsc-ink">{step.name}</span><span className="text-dtsc-muted">{step.stepType} · {step.code}</span></button>)}</div>
        {editable ? <fieldset className="mt-3 grid gap-2 border-t border-dtsc-border pt-3"><legend className="text-xs font-bold text-dtsc-muted">{en ? "Connect steps" : "Relier des étapes"}</legend>
          <label className="text-xs">{en ? "From" : "Depuis"}<select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2"><option value="">—</option>{steps.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
          <label className="text-xs">{en ? "To" : "Vers"}<select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2"><option value="">—</option>{steps.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
          <label className="text-xs">{en ? "Branch" : "Branche"}<select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-dtsc-border bg-dtsc-page px-2">{OUTCOMES.map(o => <option value={o} key={o}>{o}</option>)}</select></label>
          <button type="button" disabled={!from || !to || from === to || transitions.some((e) => e.fromStepCode === from && e.toStepCode === to && (e.outcome || "DEFAULT") === outcome)} onClick={connect} className="rounded-lg bg-dtsc-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{en ? "Connect" : "Relier"}</button>
        </fieldset> : null}
      </div>
      <aside className="min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface p-3">
        <h3 className="text-sm font-bold text-dtsc-ink">{en ? "Node properties" : "Propriétés de l’étape"}</h3>
        {active ? <div className="mt-2 grid gap-2" key={active.code}>
          <p className="text-xs text-dtsc-muted">{active.stepType} · {active.code}</p>
          <label className="text-xs text-dtsc-muted">{en ? "Name" : "Nom"}<input disabled={!editable} value={label} onChange={e => setLabel(e.target.value)} maxLength={140} className="mt-1 w-full rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm" /></label>
          <label className="text-xs text-dtsc-muted">{en ? "Description" : "Description"}<textarea disabled={!editable} value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-dtsc-border bg-dtsc-page p-2 text-sm" /></label>
          {editable ? <div className="flex flex-wrap gap-2"><button type="button" disabled={!label.trim()} onClick={() => onRename(active.code, label.trim(), description.trim())} className="rounded-lg bg-dtsc-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{en ? "Apply" : "Appliquer"}</button><button type="button" onClick={() => { onDeleteStep(active.code); setSelected(null); }} className="rounded-lg border border-rose-300 px-3 py-2 text-xs text-rose-700">{en ? "Delete step" : "Supprimer l’étape"}</button></div> : null}
          <p className="text-xs text-dtsc-muted">{en ? "Advanced configurations are preserved exactly in the existing structured editor." : "Les configurations avancées sont conservées dans l’éditeur structuré existant."}</p>
        </div> : <p className="mt-2 text-xs text-dtsc-muted">{en ? "Select a node or an item from the list." : "Sélectionnez un nœud ou un élément de la liste."}</p>}
      </aside>
    </div>
  </section>;
}
