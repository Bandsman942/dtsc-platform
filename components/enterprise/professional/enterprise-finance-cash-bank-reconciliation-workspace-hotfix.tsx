"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { EnterpriseFinanceCashBankReconciliationWorkspaceHotfix as LegacyWorkspace } from "@/components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace-hotfix-legacy";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Props = {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
  locale?: string | null;
  canCreate: boolean;
  canSubmit: boolean;
  canWrite: boolean;
  canApprove: boolean;
  canManage: boolean;
};

type ImportJob = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD";
  statusUrl: string;
  expectedLineCount?: number;
  importedLineCount?: number;
  progressPercent?: number;
  statement?: { id: string; reference: string; status: string } | null;
  errorCode?: string | null;
};

type DurableJobEvent = CustomEvent<{
  endpoint?: string;
  job?: { id?: string; status?: string; statusUrl?: string };
}>;

const EVENT_NAME = "dtsc:finance-durable-job";
const POLL_MS = 3_000;
const MAX_POLLS = 100;

function tx(locale: string | null | undefined, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

function isPartialImport(job: ImportJob) {
  return job.status === "DEAD"
    && Boolean(job.expectedLineCount)
    && Boolean(job.importedLineCount)
    && Number(job.importedLineCount) < Number(job.expectedLineCount);
}

function statusTone(job: ImportJob) {
  if (job.status === "COMPLETED") return "success" as const;
  if (job.status === "DEAD" && !isPartialImport(job)) return "danger" as const;
  return "warning" as const;
}

function statusLabel(locale: string | null | undefined, job: ImportJob) {
  if (job.status === "QUEUED") return tx(locale, "En attente", "Queued");
  if (job.status === "PROCESSING") return tx(locale, "Import en cours", "Importing");
  if (job.status === "FAILED") return tx(locale, "Nouvelle tentative prévue", "Retry scheduled");
  if (isPartialImport(job)) return tx(locale, "Import partiellement terminé", "Import partially completed");
  if (job.status === "DEAD") return tx(locale, "Import échoué", "Import failed");
  return tx(locale, "Import terminé", "Import completed");
}

export function EnterpriseFinanceCashBankReconciliationWorkspaceHotfix(props: Props) {
  const { organizationId, definition, locale } = props;
  const storageKey = `dtsc:finance-bank-import:${organizationId}`;
  const [job, setJob] = useState<ImportJob | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [workspaceKey, setWorkspaceKey] = useState(0);

  const persist = useCallback((next: ImportJob | null) => {
    try {
      if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // Persistence is only a client convenience; the server-side job stays durable.
    }
  }, [storageKey]);

  useEffect(() => {
    if (definition.code !== "FINANCE_BANK") return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const restored = JSON.parse(raw) as ImportJob;
        if (restored?.id && restored.statusUrl) setJob(restored);
      }
    } catch {
      persist(null);
    }
  }, [definition.code, persist, storageKey]);

  useEffect(() => {
    if (definition.code !== "FINANCE_BANK") return;
    const listener = (event: Event) => {
      const detail = (event as DurableJobEvent).detail;
      if (!detail?.endpoint?.includes(`/api/enterprise/${organizationId}/bank-statements`) || !detail.job?.id || !detail.job.statusUrl) return;
      const next: ImportJob = {
        id: detail.job.id,
        status: detail.job.status === "PROCESSING" ? "PROCESSING" : "QUEUED",
        statusUrl: detail.job.statusUrl,
      };
      setPollCount(0);
      setJob(next);
      persist(next);
    };
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, [definition.code, organizationId, persist]);

  const refreshJob = useCallback(async (current: ImportJob) => {
    const response = await fetch(current.statusUrl, { cache: "no-store" });
    const body = await response.json().catch(() => null) as {
      job?: {
        id: string;
        status: ImportJob["status"];
        expectedLineCount?: number;
        importedLineCount?: number;
        progressPercent?: number;
        statement?: ImportJob["statement"];
        errorCode?: string | null;
      };
    } | null;
    if (!response.ok || !body?.job) throw new Error("BANK_STATEMENT_IMPORT_STATUS_UNAVAILABLE");
    const next: ImportJob = { ...current, ...body.job };
    setJob(next);
    persist(next);
    if (next.status === "COMPLETED") setWorkspaceKey((value) => value + 1);
    return next;
  }, [persist]);

  useEffect(() => {
    if (!job || !["QUEUED", "PROCESSING", "FAILED"].includes(job.status) || pollCount >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      void refreshJob(job)
        .catch(() => undefined)
        .finally(() => setPollCount((value) => value + 1));
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [job, pollCount, refreshJob]);

  const showJob = definition.code === "FINANCE_BANK" && job;
  const pollStopped = Boolean(showJob && !["COMPLETED", "DEAD"].includes(showJob.status) && pollCount >= MAX_POLLS);

  return (
    <div className="space-y-4">
      {showJob ? <section className="mx-auto w-full max-w-[1600px] rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-black text-dtsc-ink">{tx(locale, "Import de relevé bancaire", "Bank statement import")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone(showJob)}>{statusLabel(locale, showJob)}</StatusBadge>
              {showJob.expectedLineCount ? <span className="text-xs font-bold text-dtsc-muted">{showJob.importedLineCount || 0}/{showJob.expectedLineCount} {tx(locale, "lignes", "lines")}</span> : null}
              {showJob.progressPercent !== undefined ? <span className="text-xs font-bold text-dtsc-muted">{showJob.progressPercent}%</span> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-dtsc-muted">
              {showJob.status === "COMPLETED"
                ? tx(locale, "Le relevé est complètement importé et peut maintenant être utilisé pour le rapprochement.", "The statement is fully imported and can now be used for reconciliation.")
                : showJob.status === "DEAD"
                  ? tx(locale, "L’import n’a pas pu être finalisé. Le relevé partiel reste bloqué pour le rapprochement et peut être relancé sans dupliquer les lignes.", "The import could not be finalized. The partial statement remains blocked from reconciliation and can be retried without duplicating lines.")
                  : tx(locale, "Le traitement est durable : vous pouvez quitter ce module puis revenir sans perdre l’import.", "The processing is durable: you can leave this module and return without losing the import.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pollStopped || showJob.status === "DEAD" ? <Button type="button" variant="outline" onClick={() => void refreshJob(showJob).then(() => setPollCount(0)).catch(() => undefined)}><RefreshCw className="h-4 w-4" />{tx(locale, "Actualiser", "Refresh")}</Button> : null}
            {["COMPLETED", "DEAD"].includes(showJob.status) ? <Button type="button" variant="outline" onClick={() => { setJob(null); persist(null); }}>{tx(locale, "Masquer", "Dismiss")}</Button> : null}
          </div>
        </div>
        {showJob.expectedLineCount ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-dtsc-page" aria-label={`${showJob.progressPercent || 0}%`}><div className="h-full rounded-full bg-[var(--dtsc-product-accent)] transition-[width]" style={{ width: `${showJob.progressPercent || 0}%` }} /></div> : null}
      </section> : null}
      <LegacyWorkspace key={workspaceKey} {...props} />
    </div>
  );
}
