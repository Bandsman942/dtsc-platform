"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, RefreshCcw, Send, UserRoundCog, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";

type ApprovalCoordination = {
  approval: { id: string; status: string; revision: number; requestedByUserId: string; approverUserId: string; decisionComment: string | null };
  versions: Array<{ id: string; versionNumber: number; submittedAt: string; submissionComment: string | null; submittedByUserId: string }>;
  decisions: Array<{ id: string; decision: string; reason: string | null; actorUserId: string; createdAt: string }>;
  delegates: Array<{ id: string; label: string; email: string }>;
  sourceDeepLink: string;
  capabilities: { canApprove: boolean; canReject: boolean; canRequestCorrection: boolean; canDelegate: boolean; canResubmit: boolean };
};

export function ApprovalCoordinationPanel({ organizationId, approvalId, locale, onChanged }: { organizationId: string; approvalId: string; locale?: string | null; onChanged?: () => void }) {
  const en = locale === "en";
  const [data, setData] = useState<ApprovalCoordination | null>(null);
  const [reason, setReason] = useState("");
  const [delegateUserId, setDelegateUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/enterprise/${organizationId}/approvals/${approvalId}`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`${endpoint}/coordination`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as ApprovalCoordination & { message?: string } | null;
    if (!response.ok || !body?.approval) setMessage(body?.message || (en ? "Unable to load approval history." : "Impossible de charger l’historique de validation."));
    else setData(body);
    setLoading(false);
  }, [endpoint, en]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "APPROVE" | "REJECT" | "REQUEST_CORRECTION" | "RESUBMIT" | "DELEGATE") {
    if (!data) return;
    if (["REJECT", "REQUEST_CORRECTION"].includes(action) && !reason.trim()) {
      setMessage(en ? "A reason is required." : "Un motif est obligatoire.");
      return;
    }
    if (action === "DELEGATE" && !delegateUserId) {
      setMessage(en ? "Select a delegate." : "Sélectionnez un validateur délégué.");
      return;
    }
    const response = await fetch(`${endpoint}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, revision: data.approval.revision, decisionComment: reason.trim() || undefined, delegateUserId: delegateUserId || undefined, idempotencyKey: `ui:${approvalId}:${data.approval.revision}:${action}` }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || (en ? "Approval action failed." : "L’action de validation a échoué."));
      return;
    }
    setReason("");
    setDelegateUserId("");
    setMessage(en ? "Approval updated." : "Validation mise à jour.");
    await load();
    onChanged?.();
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{en ? "Loading approval workflow…" : "Chargement du workflow de validation…"}</p>;
  if (!data) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;

  return <div className="grid min-w-0 gap-5 border-t border-dtsc-border pt-4">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role="status">{message}</p> : null}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <StatusBadge>{data.approval.status}</StatusBadge>
      <StatusBadge>{data.versions.length} {en ? "version(s)" : "version(s)"}</StatusBadge>
      <StatusBadge>{data.decisions.length} {en ? "decision(s)" : "décision(s)"}</StatusBadge>
      <Link href={data.sourceDeepLink} className="inline-flex h-10 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-black text-dtsc-blue hover:bg-cyan-400/10">{en ? "Open source" : "Ouvrir la source"}<ExternalLink className="h-4 w-4" /></Link>
    </div>

    {(data.capabilities.canReject || data.capabilities.canRequestCorrection) ? <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={3000} placeholder={en ? "Decision or correction reason" : "Motif de décision ou de correction"} /> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      {data.capabilities.canApprove ? <Button type="button" onClick={() => void act("APPROVE")} className="bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" />{en ? "Approve" : "Approuver"}</Button> : null}
      {data.capabilities.canRequestCorrection ? <Button type="button" variant="outline" onClick={() => void act("REQUEST_CORRECTION")}><RefreshCcw className="h-4 w-4" />{en ? "Request correction" : "Demander une correction"}</Button> : null}
      {data.capabilities.canReject ? <Button type="button" variant="outline" onClick={() => void act("REJECT")} className="text-red-700"><XCircle className="h-4 w-4" />{en ? "Reject" : "Refuser"}</Button> : null}
      {data.capabilities.canResubmit ? <Button type="button" onClick={() => void act("RESUBMIT")} className="bg-dtsc-blue text-white"><Send className="h-4 w-4" />{en ? "Resubmit correction" : "Soumettre la correction"}</Button> : null}
    </div>

    {data.capabilities.canDelegate ? <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><select value={delegateUserId} onChange={(event) => setDelegateUserId(event.target.value)} className="h-11 min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm"><option value="">{en ? "Select delegate" : "Sélectionner le délégué"}</option>{data.delegates.map((delegate) => <option key={delegate.id} value={delegate.id}>{delegate.label}</option>)}</select><Button type="button" variant="outline" onClick={() => void act("DELEGATE")}><UserRoundCog className="h-4 w-4" />{en ? "Delegate" : "Déléguer"}</Button></div> : null}

    <section className="grid gap-2">
      <h4 className="font-black text-dtsc-ink">{en ? "Submitted versions" : "Versions soumises"}</h4>
      {data.versions.length ? data.versions.map((version) => <div key={version.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>v{version.versionNumber}</StatusBadge><span className="font-bold text-dtsc-ink">{new Date(version.submittedAt).toLocaleString(en ? "en-GB" : "fr-FR")}</span></div>{version.submissionComment ? <p className="mt-2 text-dtsc-muted">{version.submissionComment}</p> : null}</div>) : <p className="text-sm text-dtsc-muted">{en ? "The first immutable snapshot will be created at the first decision or correction request." : "Le premier instantané immuable sera créé lors de la première décision ou demande de correction."}</p>}
    </section>

    <section className="grid gap-2">
      <h4 className="font-black text-dtsc-ink">{en ? "Decision history" : "Historique des décisions"}</h4>
      {data.decisions.length ? data.decisions.map((decision) => <div key={decision.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>{decision.decision}</StatusBadge><span className="text-dtsc-muted">{new Date(decision.createdAt).toLocaleString(en ? "en-GB" : "fr-FR")}</span></div>{decision.reason ? <p className="mt-2 text-dtsc-muted">{decision.reason}</p> : null}</div>) : <p className="text-sm text-dtsc-muted">{en ? "No final decision yet." : "Aucune décision finale pour le moment."}</p>}
    </section>
  </div>;
}
