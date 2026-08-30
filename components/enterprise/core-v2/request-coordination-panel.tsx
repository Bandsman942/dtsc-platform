"use client";

import { formatEnterpriseDate as coreFormatEnterpriseDate, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";
import { CheckCircle2, MessageSquareMore, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workspace/status-badge";

type RequestCoordinationResponse = {
  request: { id: string; status: string; revision: number };
  coordination: {
    events: Array<{ id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; actorUserId: string; createdAt: string }>;
    comments: Array<{ id: string; content: string; authorUserId: string; createdAt: string }>;
  };
  capabilities: { canRequestInformation: boolean; canRespond: boolean; canResolve: boolean; canClose: boolean; canReopen: boolean };
};

type RequestCoordinationAction = "REQUEST_INFORMATION" | "RESPOND" | "RESOLVE" | "CLOSE" | "REOPEN";

export function RequestCoordinationPanel({ organizationId, requestId, locale, onChanged }: { organizationId: string; requestId: string; locale?: string | null; onChanged?: () => void }) {
  const [data, setData] = useState<RequestCoordinationResponse | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [commentError, setCommentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const endpoint = `/api/enterprise/${organizationId}/requests/${requestId}/coordination`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as RequestCoordinationResponse & { message?: string } | null;
    if (!response.ok || !body?.coordination) setMessage(body?.message || enterpriseCoreT(locale, "requests.coordination.unable.to.load.request.history"));
    else {
      setData(body);
      setMessage("");
    }
    setLoading(false);
  }, [endpoint, locale]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: RequestCoordinationAction) {
    if (!data || submitting) return;
    const normalizedComment = comment.trim();
    const minimum = action === "RESPOND" ? 1 : 3;
    if (normalizedComment.length < minimum) {
      const error = enterpriseCoreT(locale, "requests.coordination.a.comment.is.required");
      setCommentError(error);
      setMessage(error);
      return;
    }
    setCommentError("");
    setSubmitting(true);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, revision: data.request.revision, comment: normalizedComment }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || enterpriseCoreT(locale, "requests.coordination.request.action.failed"));
      setSubmitting(false);
      return;
    }
    setComment("");
    setMessage(enterpriseCoreT(locale, "requests.request.updated"));
    await load();
    onChanged?.();
    setSubmitting(false);
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "requests.coordination.loading.request.lifecycle")}</p>;
  if (!data) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{message}</p>;

  const canAct = data.capabilities.canRequestInformation || data.capabilities.canRespond || data.capabilities.canResolve || data.capabilities.canClose || data.capabilities.canReopen;
  return <div className="grid min-w-0 gap-5 border-t border-dtsc-border pt-4">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role={commentError ? "alert" : "status"}>{message}</p> : null}
    <div className="flex flex-wrap gap-2"><StatusBadge>{coreStatusLabel(locale, data.request.status)}</StatusBadge><StatusBadge>{data.coordination.comments.length} {enterpriseCoreT(locale, "requests.coordination.message.s")}</StatusBadge></div>
    {canAct ? <label className="grid gap-1 text-sm font-semibold text-dtsc-ink">
      <span>{enterpriseCoreT(locale, "requests.coordination.professional.response.or.reason")}</span>
      <textarea
        value={comment}
        onChange={(event) => { setComment(event.target.value); if (commentError) setCommentError(""); }}
        maxLength={3000}
        required
        aria-invalid={Boolean(commentError)}
        aria-describedby={commentError ? "request-coordination-comment-error" : undefined}
        className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm text-dtsc-ink outline-none focus:border-dtsc-blue"
      />
      {commentError ? <span id="request-coordination-comment-error" className="text-xs text-red-700" role="alert">{commentError}</span> : null}
    </label> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      {data.capabilities.canRequestInformation ? <Button type="button" variant="outline" disabled={submitting} onClick={() => void act("REQUEST_INFORMATION")}><MessageSquareMore className="h-4 w-4" />{enterpriseCoreT(locale, "requests.coordination.request.information")}</Button> : null}
      {data.capabilities.canRespond ? <Button type="button" disabled={submitting} onClick={() => void act("RESPOND")} className="bg-dtsc-blue text-white"><MessageSquareMore className="h-4 w-4" />{enterpriseCoreT(locale, "requests.coordination.send.response")}</Button> : null}
      {data.capabilities.canResolve ? <Button type="button" disabled={submitting} onClick={() => void act("RESOLVE")} className="bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.RESOLVE")}</Button> : null}
      {data.capabilities.canClose ? <Button type="button" variant="outline" disabled={submitting} onClick={() => void act("CLOSE")}><XCircle className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.CLOSE")}</Button> : null}
      {data.capabilities.canReopen ? <Button type="button" variant="outline" disabled={submitting} onClick={() => void act("REOPEN")}><RotateCcw className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.REOPEN")}</Button> : null}
    </div>
    <section className="grid gap-2"><h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "requests.coordination.conversation")}</h4>{data.coordination.comments.length ? data.coordination.comments.map((item) => <article key={item.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><p className="whitespace-pre-wrap text-dtsc-ink">{item.content}</p><p className="mt-2 text-xs text-dtsc-muted">{coreFormatEnterpriseDate(item.createdAt, locale)}</p></article>) : <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "requests.coordination.no.exchange.yet")}</p>}</section>
    <section className="grid gap-2"><h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "requests.coordination.lifecycle.history")}</h4>{data.coordination.events.map((event) => <article key={event.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>{requestCoordinationEventLabel(locale, event.eventType)}</StatusBadge>{event.fromStatus || event.toStatus ? <span className="text-xs text-dtsc-muted">{event.fromStatus ? coreStatusLabel(locale, event.fromStatus) : "—"} → {event.toStatus ? coreStatusLabel(locale, event.toStatus) : "—"}</span> : null}</div><p className="mt-2 text-dtsc-muted">{event.summary}</p></article>)}</section>
  </div>;
}

function requestCoordinationEventLabel(locale: string | null | undefined, eventType: string) {
  if (eventType === "ENTERPRISE_REQUEST_REQUEST_INFORMATION") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_REQUEST_INFORMATION");
  if (eventType === "ENTERPRISE_REQUEST_RESPOND") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_RESPOND");
  if (eventType === "ENTERPRISE_REQUEST_RESOLVE") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_RESOLVE");
  if (eventType === "ENTERPRISE_REQUEST_CLOSE") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_CLOSE");
  if (eventType === "ENTERPRISE_REQUEST_REOPEN") return enterpriseCoreT(locale, "requests.coordination.event.ENTERPRISE_REQUEST_REOPEN");
  return eventType;
}
