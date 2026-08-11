"use client";

import { Bot, Check, ChevronDown, FileSearch, Loader2, PlugZap, Send, Settings2, Sparkles } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AssistantPreferenceState = {
  modelOverride: string | null;
  responseStyle: string | null;
  responseLength: string | null;
  useCompanyContext?: boolean;
  useKnowledge: boolean;
  useTools?: boolean;
  customInstructions: string | null;
};

export function AssistantMessage({
  role,
  author,
  meta,
  children,
  actions,
  below,
}: {
  role: "user" | "assistant" | "system";
  author?: string;
  meta?: string;
  children: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
}) {
  if (role === "system") {
    return <div className="mx-auto max-w-3xl px-4 py-2 text-center text-xs font-semibold text-dtsc-muted">{children}</div>;
  }
  if (role === "user") {
    return (
      <div className="mx-auto flex w-full max-w-3xl justify-end px-3 sm:px-5">
        <div className="group max-w-[88%] sm:max-w-[78%]">
          <div className="rounded-[1.45rem] rounded-br-md bg-[#002b5b] px-4 py-3 text-sm leading-7 text-white shadow-sm">{children}</div>
          <div className="mt-1 flex items-center justify-end gap-2 px-1 text-[0.68rem] font-semibold text-dtsc-muted">
            {meta ? <span>{meta}</span> : null}
            {actions}
          </div>
        </div>
      </div>
    );
  }
  return (
    <article className="group mx-auto w-full max-w-3xl px-3 py-2 sm:px-5 sm:py-3">
      <div className="flex items-center gap-2 text-xs font-black text-dtsc-ink">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/12 text-cyan-600"><Bot className="h-4 w-4" /></span>
        <span>{author || "Assistant"}</span>
        {meta ? <span className="font-semibold text-dtsc-muted">· {meta}</span> : null}
      </div>
      <div className="dtsc-assistant-markdown mt-2 min-w-0 text-[0.96rem] leading-7 text-dtsc-ink">{children}</div>
      {below ? <div className="mt-3">{below}</div> : null}
      {actions ? <div className="mt-2 flex min-h-8 flex-wrap items-center gap-1 opacity-80 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">{actions}</div> : null}
    </article>
  );
}

export function AssistantEmptyState({
  title,
  description,
  suggestions,
  onSuggestion,
}: {
  title: string;
  description: string;
  suggestions: string[];
  onSuggestion: (value: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-10 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600"><Sparkles className="h-7 w-7" /></span>
      <h2 className="mt-5 text-2xl font-black tracking-tight text-dtsc-ink">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-dtsc-muted">{description}</p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => onSuggestion(suggestion)} className="rounded-2xl border border-dtsc-border bg-dtsc-surface px-4 py-3 text-left text-sm font-semibold leading-5 text-dtsc-ink transition hover:border-cyan-400 hover:bg-cyan-500/5 focus:outline-none focus:ring-2 focus:ring-cyan-400/40">
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  sending,
  contextChips,
  modelLabel,
  onSettings,
  helper,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  contextChips?: Array<{ key: string; label: string; active: boolean; disabled?: boolean; onClick: () => void }>;
  modelLabel?: string;
  onSettings?: () => void;
  helper?: string;
}) {
  return (
    <div className="shrink-0 bg-gradient-to-t from-dtsc-surface via-dtsc-surface to-transparent px-2 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4">
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl rounded-[1.65rem] border border-dtsc-border bg-dtsc-surface p-2 shadow-[0_12px_42px_rgba(0,23,54,0.12)]">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-2 text-[0.96rem] leading-6 text-dtsc-ink outline-none placeholder:text-dtsc-muted/75"
        />
        <div className="flex min-w-0 items-center gap-1.5 px-1 pb-1">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {contextChips?.map((chip) => (
              <button key={chip.key} type="button" disabled={chip.disabled} onClick={chip.onClick} className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.7rem] font-black transition", chip.active ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200" : "border-dtsc-border bg-dtsc-page text-dtsc-muted", chip.disabled && "cursor-not-allowed opacity-45")}>
                {chip.active ? <Check className="h-3 w-3" /> : <FileSearch className="h-3 w-3" />}{chip.label}
              </button>
            ))}
            {modelLabel ? <button type="button" onClick={onSettings} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dtsc-border bg-dtsc-page px-2.5 text-[0.7rem] font-black text-dtsc-muted"><span className="max-w-28 truncate">{modelLabel}</span><ChevronDown className="h-3 w-3" /></button> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => window.location.assign("/ai/apps")} className="h-9 w-9 shrink-0 rounded-full" aria-label="Applications connectées" title="Applications connectées"><PlugZap className="h-4 w-4" /></Button>
          {onSettings ? <Button type="button" variant="ghost" size="icon" onClick={onSettings} className="h-9 w-9 shrink-0 rounded-full" aria-label="Assistant settings"><Settings2 className="h-4 w-4" /></Button> : null}
          <Button type="submit" size="icon" disabled={disabled || sending || !value.trim()} className="h-10 w-10 shrink-0 rounded-full bg-[#002b5b] text-white hover:bg-[#001736]" aria-label="Send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
      {helper ? <p className="mx-auto mt-1.5 max-w-3xl px-3 text-center text-[0.65rem] font-semibold text-dtsc-muted">{helper}</p> : null}
    </div>
  );
}

export function AssistantConversationSettingsDialog({
  open,
  onClose,
  title,
  preference,
  onChange,
  onSave,
  models,
  sourceOptions,
  locale = "fr",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  preference: AssistantPreferenceState;
  onChange: (next: AssistantPreferenceState) => void;
  onSave: () => void;
  models: Array<{ id: string; label: string }>;
  sourceOptions: Array<{ key: "useCompanyContext" | "useKnowledge" | "useTools"; label: string; description: string; disabled?: boolean }>;
  locale?: string | null;
}) {
  const en = locale === "en";
  return (
    <Dialog open={open} title={title} description={en ? "These settings apply only to this conversation." : "Ces réglages s’appliquent uniquement à cette conversation."} onClose={onClose} className="max-h-[92dvh] max-w-2xl overflow-y-auto">
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{en ? "Model" : "Modèle"}
            <select value={preference.modelOverride || ""} onChange={(event) => onChange({ ...preference, modelOverride: event.target.value || null })} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">
              <option value="">{en ? "Automatic / account default" : "Automatique / défaut du compte"}</option>
              {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{en ? "Response style" : "Style de réponse"}
            <select value={preference.responseStyle || "PROFESSIONAL"} onChange={(event) => onChange({ ...preference, responseStyle: event.target.value })} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">
              <option value="PROFESSIONAL">{en ? "Professional" : "Professionnel"}</option><option value="DIRECT">{en ? "Direct" : "Direct"}</option><option value="DETAILED">{en ? "Pedagogical" : "Pédagogique"}</option><option value="EXECUTIVE">Executive</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{en ? "Response length" : "Longueur"}
            <select value={preference.responseLength || "BALANCED"} onChange={(event) => onChange({ ...preference, responseLength: event.target.value })} className="h-11 rounded-xl border border-dtsc-border bg-dtsc-page px-3 text-sm font-semibold">
              <option value="SHORT">{en ? "Short" : "Courte"}</option><option value="BALANCED">{en ? "Balanced" : "Équilibrée"}</option><option value="DETAILED">{en ? "Detailed" : "Détaillée"}</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{en ? "Context and sources" : "Contexte et sources"}</p>
          {sourceOptions.map((option) => {
            const active = Boolean(preference[option.key]);
            return <button key={option.key} type="button" disabled={option.disabled} onClick={() => onChange({ ...preference, [option.key]: !active })} className={cn("flex items-start gap-3 rounded-2xl border p-3 text-left transition", active ? "border-cyan-400/60 bg-cyan-500/8" : "border-dtsc-border bg-dtsc-page", option.disabled && "cursor-not-allowed opacity-50")}><span className={cn("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", active ? "border-cyan-500 bg-cyan-500 text-white" : "border-dtsc-border")}>{active ? <Check className="h-3 w-3" /> : null}</span><span><strong className="block text-sm text-dtsc-ink">{option.label}</strong><span className="mt-0.5 block text-xs leading-5 text-dtsc-muted">{option.description}</span></span></button>;
          })}
        </div>
        <button type="button" onClick={() => window.location.assign("/ai/apps")} className="flex items-start gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-left transition hover:border-cyan-400/60 hover:bg-cyan-500/5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><PlugZap className="h-4 w-4" /></span>
          <span><strong className="block text-sm text-dtsc-ink">{en ? "Connected applications" : "Applications connectées"}</strong><span className="mt-0.5 block text-xs leading-5 text-dtsc-muted">{en ? "See which MCP applications are certified and available for DTSC AI." : "Voir quelles applications MCP sont certifiées et disponibles pour l’IA DTSC."}</span></span>
        </button>
        <label className="grid gap-1.5 text-sm font-black text-dtsc-ink">{en ? "Conversation instructions" : "Instructions de conversation"}
          <textarea value={preference.customInstructions || ""} onChange={(event) => onChange({ ...preference, customInstructions: event.target.value })} maxLength={4000} rows={5} placeholder={en ? "Example: Always start with an executive summary…" : "Ex. : commence toujours par une synthèse exécutive…"} className="resize-y rounded-2xl border border-dtsc-border bg-dtsc-page p-3 text-sm font-medium leading-6 outline-none focus:border-cyan-400" />
          <span className="text-xs font-semibold text-dtsc-muted">{en ? "These instructions never bypass DTSC permissions or safety rules." : "Ces instructions ne contournent jamais les permissions ni les règles de sécurité DTSC."}</span>
        </label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{en ? "Cancel" : "Annuler"}</Button><Button type="button" onClick={onSave}>{en ? "Save" : "Enregistrer"}</Button></div>
      </div>
    </Dialog>
  );
}
