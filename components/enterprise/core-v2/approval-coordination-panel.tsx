"use client";

import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import Link from "next/link";
import { CheckCircle2, ExternalLink, RefreshCcw, Send, UserRoundCog, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";

type ApprovalSnapshot = Record<string, unknown>;
type ApprovalCoordination = {
  approval: { id: string; status: string; revision: number; requestedByUserId: string; approverUserId: string; decisionComment: string | null };
  versions: Array<{ id: string; versionNumber: number; submittedAt: string; submissionComment: string | null; submittedByUserId: string; snapshotJson: ApprovalSnapshot }>;
  decisions: Array<{ id: string; decision: string; reason: string | null; actorUserId: string; createdAt: string }>;
  delegates: Array<{ id: string; label: string; email: string }>;
  sourceDeepLink: string;
  capabilities: { canApprove: boolean; canReject: boolean; canRequestCorrection: boolean; canDelegate: boolean; canResubmit: boolean };
};

export function ApprovalCoordinationPanel({ organizationId, approvalId, locale, onChanged }: { organizationId: string; approvalId: string; locale?: string | null; onChanged?: () => void }) {
  const [data, setData] = useState<ApprovalCoordination | null>(null);
  const [reason, setReason] = useState("");
  const [delegateUserId, setDelegateUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const endpoint = `/api/enterprise/${organizationId}/approvals/${approvalId}`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`${endpoint}/coordination`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as ApprovalCoordination & { message?: string } | null;
    if (!response.ok || !body?.approval) setMessage(body?.message || enterpriseCoreT(locale, "approvals.coordination.unable.to.load.approval.history"));
    else setData(body);
    setLoading(false);
  }, [endpoint, locale]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "APPROVE" | "REJECT" | "REQUEST_CORRECTION" | "RESUBMIT" | "DELEGATE") {
    if (!data || submitting) return;
    if (["REJECT", "REQUEST_CORRECTION"].includes(action) && !reason.trim()) {
      setMessage(enterpriseCoreT(locale, "approvals.coordination.a.reason.is.required"));
      return;
    }
    if (action === "DELEGATE" && !delegateUserId) {
      setMessage(enterpriseCoreT(locale, "approvals.coordination.select.a.delegate"));
      return;
    }
    setSubmitting(true);
    const response = await fetch(`${endpoint}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, revision: data.approval.revision, decisionComment: reason.trim() || undefined, delegateUserId: delegateUserId || undefined, idempotencyKey: `ui:${approvalId}:${data.approval.revision}:${action}` }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || enterpriseCoreT(locale, "approvals.coordination.approval.action.failed"));
      setSubmitting(false);
      return;
    }
    setReason("");
    setDelegateUserId("");
    setMessage(enterpriseCoreT(locale, "approvals.coordination.approval.updated"));
    await load();
    onChanged?.();
    setSubmitting(false);
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "approvals.coordination.loading.approval.workflow")}</p>;
  if (!data) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
  const latestVersion = data.versions[0];

  return <div className="grid min-w-0 gap-5 border-t border-dtsc-border pt-4">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role="status">{message}</p> : null}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <StatusBadge>{coreStatusLabel(locale, data.approval.status)}</StatusBadge>
      <StatusBadge>{data.versions.length} {enterpriseCoreT(locale, "approvals.coordination.version.s")}</StatusBadge>
      <StatusBadge>{data.decisions.length} {enterpriseCoreT(locale, "approvals.coordination.decision.s")}</StatusBadge>
      <Link href={data.sourceDeepLink} className="inline-flex h-10 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-black text-dtsc-blue hover:bg-cyan-400/10">{enterpriseCoreT(locale, "approvals.coordination.open.source")}<ExternalLink className="h-4 w-4" /></Link>
    </div>

    {latestVersion ? <section className="grid gap-3 rounded-xl border border-dtsc-border bg-dtsc-page p-4" aria-label={locale === "en" ? "Submitted snapshot" : "Snapshot soumis"}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black text-dtsc-ink">{locale === "en" ? "Submitted content to review" : "Contenu soumis à examiner"}</h4><StatusBadge>v{latestVersion.versionNumber}</StatusBadge></div>
      <ApprovalSnapshotSummary snapshot={latestVersion.snapshotJson} locale={locale} />
      <p className="text-xs text-dtsc-muted">{locale === "en" ? "This immutable snapshot is the version associated with the decision history." : "Ce snapshot immuable est la version associée à l’historique de décision."}</p>
    </section> : <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">{locale === "en" ? "The immutable snapshot will be created before the first final decision." : "Le snapshot immuable sera créé avant la première décision finale."}</section>}

    {(data.capabilities.canReject || data.capabilities.canRequestCorrection) ? <div className="grid gap-1"><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={3000} aria-invalid={(data.capabilities.canReject || data.capabilities.canRequestCorrection) && reason.length > 0 && !reason.trim()} placeholder={enterpriseCoreT(locale, "approvals.coordination.decision.or.correction.reason")} /><p className="text-xs text-dtsc-muted">{locale === "en" ? "Required for rejection and correction requests. Kept if an action fails." : "Obligatoire pour un rejet ou une demande de correction. Conservé si l’action échoue."}</p></div> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      {data.capabilities.canApprove ? <Button type="button" disabled={submitting} onClick={() => void act("APPROVE")} className="bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" />{enterpriseCoreT(locale, "approval.decision.APPROVE")}</Button> : null}
      {data.capabilities.canRequestCorrection ? <Button type="button" disabled={submitting} variant="outline" onClick={() => void act("REQUEST_CORRECTION")}><RefreshCcw className="h-4 w-4" />{enterpriseCoreT(locale, "approval.action.REQUEST_CORRECTION")}</Button> : null}
      {data.capabilities.canReject ? <Button type="button" disabled={submitting} variant="outline" onClick={() => void act("REJECT")} className="text-red-700"><XCircle className="h-4 w-4" />{enterpriseCoreT(locale, "approvals.coordination.reject")}</Button> : null}
      {data.capabilities.canResubmit ? <Button type="button" disabled={submitting} onClick={() => void act("RESUBMIT")} className="bg-dtsc-blue text-white"><Send className="h-4 w-4" />{enterpriseCoreT(locale, "approvals.coordination.resubmit.correction")}</Button> : null}
    </div>

    {data.capabilities.canDelegate ? <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><select value={delegateUserId} onChange={(event) => setDelegateUserId(event.target.value)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{enterpriseCoreT(locale, "approvals.coordination.select.delegate")}</option>{data.delegates.map((delegate) => <option key={delegate.id} value={delegate.id}>{delegate.label}</option>)}</select><Button type="button" disabled={submitting} variant="outline" onClick={() => void act("DELEGATE")}><UserRoundCog className="h-4 w-4" />{enterpriseCoreT(locale, "approval.action.DELEGATE")}</Button></div> : null}

    <section className="grid gap-2">
      <h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "approvals.coordination.submitted.versions")}</h4>
      {data.versions.length ? data.versions.map((version) => <div key={version.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>v{version.versionNumber}</StatusBadge><span className="font-bold text-dtsc-ink">{coreFormatEnterpriseDate(version.submittedAt, locale)}</span></div>{version.submissionComment ? <p className="mt-2 text-dtsc-muted">{version.submissionComment}</p> : null}</div>) : <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "approvals.coordination.the.first.immutable.snapshot.will.be.created.at")}</p>}
    </section>

    <section className="grid gap-2">
      <h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "approvals.coordination.decision.history")}</h4>
      {data.decisions.length ? data.decisions.map((decision) => <div key={decision.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>{approvalDecisionLabel(locale, decision.decision)}</StatusBadge><span className="text-dtsc-muted">{coreFormatEnterpriseDate(decision.createdAt, locale)}</span></div>{decision.reason ? <p className="mt-2 text-dtsc-muted">{decision.reason}</p> : null}</div>) : <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "approvals.coordination.no.final.decision.yet")}</p>}
    </section>
  </div>;
}

function ApprovalSnapshotSummary({ snapshot, locale }: { snapshot: ApprovalSnapshot; locale?: string | null }) {
  const fields: Array<[string, string]> = [];
  const labels: Record<string, [string, string]> = {
    title: ["Titre", "Title"],
    reference: ["Référence", "Reference"],
    requestType: ["Type de demande", "Request type"],
    description: ["Description", "Description"],
    status: ["Statut", "Status"],
    priority: ["Priorité", "Priority"],
    currency: ["Devise", "Currency"],
    amount: ["Montant", "Amount"],
    totalAmount: ["Montant total", "Total amount"],
    startAt: ["Début", "Start"],
    dueAt: ["Échéance", "Due"],
    endAt: ["Fin", "End"],
    updatedAt: ["Dernière modification", "Last updated"],
  };
  for (const key of Object.keys(labels)) {
    const value = snapshot?.[key];
    if (value === null || value === undefined || typeof value === "object") continue;
    const label = labels[key][locale === "en" ? 1 : 0];
    fields.push([label, String(value)]);
  }
  if (!fields.length) return <p className="text-sm text-dtsc-muted">{locale === "en" ? "The source content is available from the link above." : "Le contenu source reste accessible via le lien ci-dessus."}</p>;
  return <dl className="grid gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-dtsc-border bg-dtsc-surface p-3"><dt className="text-xs font-black text-dtsc-muted">{label}</dt><dd className="mt-1 break-words text-sm text-dtsc-ink">{value}</dd></div>)}</dl>;
}

function approvalDecisionLabel(locale: string | null | undefined, decision: string) {
  if (decision === "APPROVE") return enterpriseCoreT(locale, "approval.decision.APPROVE");
  if (decision === "REJECT") return enterpriseCoreT(locale, "approval.decision.REJECT");
  return decision;
}
