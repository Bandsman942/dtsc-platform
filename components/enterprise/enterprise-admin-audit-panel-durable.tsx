"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { EnterpriseAdministrationAuditPanel as LegacyEnterpriseAdministrationAuditPanel } from "@/components/enterprise/enterprise-admin-hotfix-panels-legacy";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAuditItem, EnterpriseMemberItem, EnterpriseModuleConfigurationIssue } from "@/lib/enterprise/enterprise-admin-types";

type Props = {
  items: EnterpriseAuditItem[];
  members: EnterpriseMemberItem[];
  issues: EnterpriseModuleConfigurationIssue[];
  locale?: string | null;
};

type AuditExportJob = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD";
  statusUrl: string;
  downloadUrl: string | null;
  rowCount?: number;
  truncated?: boolean;
  expiresAt?: string | null;
  errorCode?: string | null;
};

const STORAGE_KEY = "dtsc:enterprise-admin:last-audit-export";
const POLL_MS = 3_000;
const MAX_POLLS = 100;

function tx(locale: string | null | undefined, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

function statusTone(status: AuditExportJob["status"]) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED" || status === "DEAD") return "danger" as const;
  return "warning" as const;
}

function statusLabel(locale: string | null | undefined, status: AuditExportJob["status"]) {
  const labels = {
    QUEUED: tx(locale, "En attente", "Queued"),
    PROCESSING: tx(locale, "Génération en cours", "Generating"),
    COMPLETED: tx(locale, "Prêt", "Ready"),
    FAILED: tx(locale, "Nouvelle tentative prévue", "Retry scheduled"),
    DEAD: tx(locale, "Échec", "Failed"),
  };
  return labels[status];
}

function saveJob(job: AuditExportJob | null) {
  try {
    if (!job) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Session storage is a convenience only; the durable server job remains authoritative.
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function EnterpriseAdministrationAuditPanel(props: Props) {
  const { locale } = props;
  const [job, setJob] = useState<AuditExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pollCount, setPollCount] = useState(0);
  useToastMessage(message);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as AuditExportJob;
      if (parsed?.id && parsed.statusUrl) setJob(parsed);
    } catch {
      saveJob(null);
    }
  }, []);

  const refreshJob = useCallback(async (current: AuditExportJob) => {
    const response = await fetch(current.statusUrl, { cache: "no-store" });
    const body = await response.json().catch(() => null) as {
      job?: {
        id: string;
        status: AuditExportJob["status"];
        rowCount?: number;
        truncated?: boolean;
        expiresAt?: string | null;
        artifactAvailable?: boolean;
        downloadUrl?: string | null;
        errorCode?: string | null;
      };
    } | null;
    if (!response.ok || !body?.job) throw new Error("AUDIT_EXPORT_STATUS_UNAVAILABLE");
    const next: AuditExportJob = {
      ...current,
      status: body.job.status,
      rowCount: body.job.rowCount,
      truncated: body.job.truncated,
      expiresAt: body.job.expiresAt,
      downloadUrl: body.job.downloadUrl || current.downloadUrl,
      errorCode: body.job.errorCode || null,
    };
    setJob(next);
    saveJob(next);
    return next;
  }, []);

  useEffect(() => {
    if (!job || !["QUEUED", "PROCESSING", "FAILED"].includes(job.status) || pollCount >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      void refreshJob(job)
        .then((next) => {
          setPollCount((value) => value + 1);
          if (next.status === "COMPLETED") setMessage(tx(locale, "L’export d’audit est prêt au téléchargement.", "The audit export is ready to download."));
          if (next.status === "DEAD") setMessage(tx(locale, "L’export n’a pas pu être généré. Vous pouvez relancer une nouvelle demande.", "The export could not be generated. You can start a new request."));
        })
        .catch(() => setPollCount((value) => value + 1));
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [job, locale, pollCount, refreshJob]);

  async function requestExport() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setPollCount(0);
    try {
      const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetch(`/api/enterprise/active/administration/audit/export?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("text/csv")) {
        const disposition = response.headers.get("content-disposition") || "";
        const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "enterprise-audit.csv";
        triggerBlobDownload(await response.blob(), filename);
        setMessage(tx(locale, "Export téléchargé.", "Export downloaded."));
        return;
      }
      const body = await response.json().catch(() => null) as {
        error?: string;
        reasonCode?: string;
        job?: { id: string; status: AuditExportJob["status"]; statusUrl: string; downloadUrl: string | null };
      } | null;
      if (response.status === 202 && body?.job) {
        const next: AuditExportJob = { ...body.job };
        setJob(next);
        saveJob(next);
        setMessage(tx(locale, "L’export volumineux est en file. Vous pouvez continuer à utiliser l’application pendant sa génération.", "The large export is queued. You can keep using the application while it is generated."));
        return;
      }
      if (body?.reasonCode === "AUDIT_EXPORT_APPROVAL_REQUIRED") {
        setMessage(tx(locale, "Une validation est requise avant cet export sensible.", "An approval is required before this sensitive export."));
      } else {
        setMessage(tx(locale, "L’export ne peut pas être préparé pour le moment.", "The export cannot be prepared right now."));
      }
    } catch {
      setMessage(tx(locale, "L’export ne peut pas être préparé pour le moment.", "The export cannot be prepared right now."));
    } finally {
      setBusy(false);
    }
  }

  const terminal = job?.status === "COMPLETED" || job?.status === "DEAD";
  const pollStopped = Boolean(job && !terminal && pollCount >= MAX_POLLS);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dtsc-border bg-dtsc-surface p-4" aria-labelledby="enterprise-audit-export-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="enterprise-audit-export-title" className="font-black text-dtsc-ink">{tx(locale, "Exporter l’historique", "Export history")}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-dtsc-muted">{tx(locale, "Les petits exports sont téléchargés immédiatement. Les exports volumineux sont générés de façon sécurisée en arrière-plan et restent privés pendant une durée limitée.", "Small exports download immediately. Large exports are generated securely as a durable job and remain private for a limited time.")}</p>
          </div>
          <button type="button" onClick={() => void requestExport()} disabled={busy || Boolean(job && ["QUEUED", "PROCESSING"].includes(job.status))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--dtsc-product-accent)] px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {tx(locale, "Préparer l’export", "Prepare export")}
          </button>
        </div>
        {job ? <div className="mt-4 rounded-xl bg-dtsc-page p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{tx(locale, "Dernier export", "Latest export")}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge tone={statusTone(job.status)}>{statusLabel(locale, job.status)}</StatusBadge>{job.rowCount !== undefined ? <span className="text-xs font-bold text-dtsc-muted">{job.rowCount} {tx(locale, "ligne(s)", "row(s)")}</span> : null}</div></div>
            <div className="flex flex-wrap gap-2">
              {job.status === "COMPLETED" && job.downloadUrl ? <a href={job.downloadUrl} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-ink"><Download className="h-4 w-4" />{tx(locale, "Télécharger", "Download")}</a> : null}
              {pollStopped || job.status === "DEAD" ? <button type="button" onClick={() => void refreshJob(job).then(() => setPollCount(0)).catch(() => undefined)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm font-black text-dtsc-ink"><RefreshCw className="h-4 w-4" />{tx(locale, "Actualiser", "Refresh")}</button> : null}
            </div>
          </div>
          {job.expiresAt && job.status === "COMPLETED" ? <p className="mt-2 text-xs text-dtsc-muted">{tx(locale, "Disponible jusqu’au", "Available until")} {new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.expiresAt))}.</p> : null}
          {job.truncated ? <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">{tx(locale, "L’export atteint la limite opérationnelle autorisée. Affinez le périmètre avant un export plus ciblé.", "The export reached the allowed operational limit. Narrow the scope before requesting a more targeted export.")}</p> : null}
        </div> : null}
      </section>
      <LegacyEnterpriseAdministrationAuditPanel {...props} />
    </div>
  );
}
