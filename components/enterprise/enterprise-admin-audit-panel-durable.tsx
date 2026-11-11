"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { EnterpriseAdministrationAuditPanel as BaseEnterpriseAdministrationAuditPanel } from "@/components/enterprise/enterprise-administration-panels-base";
import { EnterpriseAdminAuditHistory } from "@/components/enterprise/enterprise-admin-audit-history";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseAuditItem, EnterpriseMemberItem, EnterpriseModuleConfigurationIssue } from "@/lib/enterprise/enterprise-admin-types";

type Props = {
  items: EnterpriseAuditItem[];
  organizationId: string;
  organizationName: string;
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

type AuditExportApprovalInfo = {
  required: boolean;
  candidates: Array<{ userId: string; name: string; positionTitle: string | null }>;
  approvals: Array<{ id: string; status: string; requestedAt: string }>;
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
  const { locale, organizationId } = props;
  const [job, setJob] = useState<AuditExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const [approvalInfo, setApprovalInfo] = useState<AuditExportApprovalInfo | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approverUserId, setApproverUserId] = useState("");
  useToastMessage(message);

  const refreshApproval = useCallback(async () => {
    setApprovalLoading(true);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/administration/audit/export-approval`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as AuditExportApprovalInfo | null;
      if (!response.ok || !body || !Array.isArray(body.candidates)) throw new Error("AUDIT_APPROVAL_UNAVAILABLE");
      setApprovalInfo(body);
    } catch {
      setMessage(tx(locale, "Impossible de vérifier la politique d’approbation de l’export. Réessayez.", "Unable to check export approval policy. Please retry."));
    } finally {
      setApprovalLoading(false);
    }
  }, [organizationId, locale]);

  useEffect(() => { void refreshApproval(); }, [refreshApproval]);

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
      downloadUrl: body.job.downloadUrl || null,
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
    if (!approvalInfo) {
      setMessage(tx(locale, "La politique d’export doit d’abord être vérifiée.", "Export policy must be checked first."));
      return;
    }
    const approvalId = approvalInfo.required ? approvalInfo.approvals.find((item) => item.status === "APPROVED")?.id : null;
    if (approvalInfo.required && !approvalId) {
      setMessage(tx(locale, "Demandez une validation puis actualisez son état après la décision du validateur.", "Request approval, then refresh its status after the reviewer decides."));
      return;
    }
    setBusy(true);
    setMessage("");
    setPollCount(0);
    try {
      const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const params = new URLSearchParams({ requestId });
      if (approvalId) params.set("approvalId", approvalId);
      const response = await fetch(`/api/enterprise/${organizationId}/administration/audit/export?${params}`, { cache: "no-store" });
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

  async function requestApproval() {
    if (!approverUserId || approvalBusy) return;
    setApprovalBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/administration/audit/export-approval`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approverUserId }),
      });
      const body = await response.json().catch(() => null) as { message?: string; validationUrl?: string } | null;
      if (!response.ok) throw new Error(body?.message || "AUDIT_APPROVAL_REQUEST_FAILED");
      setMessage(tx(locale, "Demande de validation créée dans le module Validations.", "Approval request created in the Approvals module."));
      await refreshApproval();
    } catch (error) {
      setMessage(error instanceof Error && !error.message.includes("AUDIT_") ? error.message : tx(locale, "La validation n’a pas pu être demandée. Vérifiez les droits du validateur.", "Unable to request approval. Check the approver's permissions."));
    } finally {
      setApprovalBusy(false);
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
          <button type="button" onClick={() => void requestExport()} disabled={busy || approvalLoading || !approvalInfo || Boolean(job && ["QUEUED", "PROCESSING"].includes(job.status))} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--dtsc-product-accent)] px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {tx(locale, "Préparer l’export", "Prepare export")}
          </button>
        </div>
        {approvalInfo?.required && <div className="mt-3 space-y-2 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-black text-dtsc-ink"><ShieldCheck className="h-4 w-4 text-amber-600" />{tx(locale, "Validation préalable obligatoire", "Prior approval required")}</p><button type="button" onClick={() => void refreshApproval()} disabled={approvalLoading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink"><RefreshCw className="h-4 w-4" />{tx(locale, "Actualiser", "Refresh")}</button></div>
          <p className="text-xs text-dtsc-muted">{tx(locale, "Un validateur habilité doit approuver la demande. L’autorisation reste liée au demandeur pendant 48 h et se vérifie aussi lors de la génération et du téléchargement.", "An eligible reviewer must approve the request. Authorization is requester-bound for 48 hours and is verified during generation and download.")}</p>
          {approvalInfo.approvals.length ? <div className="flex flex-wrap gap-2">{approvalInfo.approvals.slice(0, 3).map((approval) => <StatusBadge key={approval.id} tone={approval.status === "APPROVED" ? "success" : approval.status === "REJECTED" ? "danger" : "warning"}>{approval.status}</StatusBadge>)}</div> : null}
          {!approvalInfo.approvals.some((approval) => approval.status === "APPROVED") && <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 text-xs font-bold text-dtsc-muted">{tx(locale, "Validateur désigné", "Designated approver")}
              <select value={approverUserId} onChange={(event) => setApproverUserId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink"><option value="">{tx(locale, "Choisir un validateur", "Select approver")}</option>{approvalInfo.candidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.name}{candidate.positionTitle ? ` · ${candidate.positionTitle}` : ""}</option>)}</select>
            </label>
            <button type="button" disabled={!approverUserId || approvalBusy} onClick={() => void requestApproval()} className="min-h-11 rounded-xl border border-amber-500/40 px-3 text-xs font-black text-dtsc-ink disabled:opacity-40">{tx(locale, "Demander validation", "Request approval")}</button>
          </div>}
          {!approvalInfo.candidates.length && !approvalInfo.approvals.some((approval) => approval.status === "APPROVED") && <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{tx(locale, "Aucun validateur n’est habilité sur les demandes internes. Configurez ses droits dans Rôles & permissions.", "No approver is eligible for internal requests. Configure permissions under Roles & permissions.")}</p>}
          <Link href="/enterprise-modules/VALIDATIONS" className="inline-flex min-h-10 items-center rounded-xl border border-dtsc-border px-3 text-xs font-bold text-dtsc-ink">{tx(locale, "Ouvrir les validations", "Open approvals")}</Link>
        </div>}
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
      <EnterpriseAdminAuditHistory {...props} />
      <details className="rounded-xl border border-dtsc-border bg-dtsc-page p-3">
        <summary className="min-h-9 cursor-pointer text-xs font-bold text-dtsc-muted">{tx(locale, "Synthèse administrative récente (vue classique)", "Recent administration summary (classic view)")}</summary>
        <div className="mt-3"><BaseEnterpriseAdministrationAuditPanel items={props.items} members={props.members} issues={props.issues} locale={locale} /></div>
      </details>
    </div>
  );
}
