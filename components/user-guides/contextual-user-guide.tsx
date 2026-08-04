"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, CircleAlert, Clock3, Search } from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ContextualUserGuide } from "@/lib/user-guides/iteration04-guides";

export function ContextualUserGuide({ guide, compact = false }: { guide: ContextualUserGuide; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSteps = useMemo(() => {
    if (!normalizedQuery) return guide.steps;
    return guide.steps.filter((step) =>
      [step.title, step.description, ...(step.actions || []), ...(step.cautions || [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [guide.steps, normalizedQuery]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue"
        aria-label={`Ouvrir ${guide.title}`}
      >
        <BookOpenCheck className="h-4 w-4" />
        {compact ? "Guide" : "Guide utilisateur"}
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        title={guide.title}
        description={guide.summary}
        className="h-[94dvh] max-w-5xl"
      >
        <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto pr-1">
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <GuideMetric label="Public concerné" value={guide.audience} />
            <GuideMetric label="Code du guide" value={guide.code} />
            <GuideMetric label="Dernière actualisation" value={formatGuideDate(guide.updatedAt)} icon={<Clock3 className="h-4 w-4" />} />
          </div>

          <section className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <h3 className="font-black text-dtsc-ink">Ce que permet ce module</h3>
            <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
              {guide.capabilities.map((capability) => (
                <div key={capability} className="flex min-w-0 items-start gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm leading-6 text-dtsc-muted">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 break-words">{capability}</span>
                </div>
              ))}
            </div>
          </section>

          <label className="relative block min-w-0">
            <span className="sr-only">Rechercher dans le guide</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dtsc-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une action, une règle ou une limitation…" className="h-11 rounded-xl bg-dtsc-surface pl-10" />
          </label>

          <Accordion>
            {visibleSteps.map((step, index) => (
              <AccordionItem key={`${guide.code}-${step.title}`} title={`${index + 1}. ${step.title}`} defaultOpen={index === 0 && !normalizedQuery}>
                <div className="space-y-3 text-sm leading-6 text-dtsc-muted">
                  <p>{step.description}</p>
                  {step.actions?.length ? (
                    <ol className="grid gap-2">
                      {step.actions.map((action, actionIndex) => (
                        <li key={action} className="flex min-w-0 items-start gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-black text-cyan-700">{actionIndex + 1}</span>
                          <span className="min-w-0 break-words">{action}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {step.cautions?.length ? (
                    <div className="space-y-2">
                      {step.cautions.map((caution) => (
                        <div key={caution} className="flex min-w-0 items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                          <CircleAlert className="mt-1 h-4 w-4 shrink-0" />
                          <span className="min-w-0 break-words">{caution}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </AccordionItem>
            ))}
          </Accordion>

          {!visibleSteps.length ? (
            <p className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page p-6 text-center text-sm text-dtsc-muted">Aucune section du guide ne correspond à cette recherche.</p>
          ) : null}

          {guide.limitations?.length ? (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <CircleAlert className="h-5 w-5" />
                <h3 className="font-black">Fonctionnalités conditionnelles ou limites connues</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-amber-900 dark:text-amber-100">
                {guide.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
              </div>
            </section>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function GuideMetric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</p>
      <p className="mt-2 flex min-w-0 items-start gap-2 break-words text-sm font-black text-dtsc-ink">{icon}{value}</p>
    </div>
  );
}

function formatGuideDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${value}T00:00:00Z`));
}
