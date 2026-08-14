"use client";

import { formatEnterpriseDate as coreFormatEnterpriseDate, priorityChoices as corePriorityChoices, statusLabel as coreStatusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";

import { enterpriseCoreT } from "@/lib/enterprise-core-i18n";

import { CheckCircle2, MessageSquareMore, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/workspace/status-badge";

type RequestCoordinationResponse = {
  request: { id: string; status: string; revision: number };
  coordination: {
    events: Array<{ id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null; actorUserId: string; createdAt: string }>;
    comments: Array<{ id: string; content: string; authorUserId: string; createdAt: string }>;
  };
  capabilities: { canRequestInformation: boolean; canRespond: boolean; canResolve: boolean; canClose: boolean; canReopen: boolean };
};

export function RequestCoordinationPanel({ organizationId, requestId, locale, onChanged }: { organizationId: string; requestId: string; locale?: string | null; onChanged?: () => void }) {
  const en = locale === "en";
  const [data, setData] = useState<RequestCoordinationResponse | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/enterprise/${organizationId}/requests/${requestId}/coordination`;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as RequestCoordinationResponse & { message?: string } | null;
    if (!response.ok || !body?.coordination) setMessage(body?.message || (enterpriseCoreT(locale, "requests.coordination.unable.to.load.request.history")));
    else setData(body);
    setLoading(false);
  }, [endpoint, en]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "REQUEST_INFORMATION" | "RESPOND" | "RESOLVE" | "CLOSE" | "REOPEN") {
    if (!data) return;
    if (action !== "CLOSE" && !comment.trim()) {
      setMessage(enterpriseCoreT(locale, "requests.coordination.a.comment.is.required"));
      return;
    }
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment: comment.trim() || undefined }) });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setMessage(body?.message || (enterpriseCoreT(locale, "requests.coordination.request.action.failed")));
      return;
    }
    setComment("");
    setMessage(enterpriseCoreT(locale, "requests.request.updated"));
    await load();
    onChanged?.();
  }

  if (loading) return <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "requests.coordination.loading.request.lifecycle")}</p>;
  if (!data) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>;

  const needsComment = data.capabilities.canRequestInformation || data.capabilities.canRespond || data.capabilities.canResolve || data.capabilities.canReopen;
  return <div className="grid min-w-0 gap-5 border-t border-dtsc-border pt-4">
    {message ? <p className="rounded-xl border border-dtsc-border bg-dtsc-page p-3 text-sm text-dtsc-muted" role="status">{message}</p> : null}
    <div className="flex flex-wrap gap-2"><StatusBadge>{coreStatusLabel(locale, data.request.status)}</StatusBadge><StatusBadge>{data.coordination.comments.length} {enterpriseCoreT(locale, "requests.coordination.message.s")}</StatusBadge></div>
    {needsComment ? <Input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={3000} placeholder={enterpriseCoreT(locale, "requests.coordination.professional.response.or.reason")} /> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      {data.capabilities.canRequestInformation ? <Button type="button" variant="outline" onClick={() => void act("REQUEST_INFORMATION")}><MessageSquareMore className="h-4 w-4" />{enterpriseCoreT(locale, "requests.coordination.request.information")}</Button> : null}
      {data.capabilities.canRespond ? <Button type="button" onClick={() => void act("RESPOND")} className="bg-dtsc-blue text-white"><MessageSquareMore className="h-4 w-4" />{enterpriseCoreT(locale, "requests.coordination.send.response")}</Button> : null}
      {data.capabilities.canResolve ? <Button type="button" onClick={() => void act("RESOLVE")} className="bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.RESOLVE")}</Button> : null}
      {data.capabilities.canClose ? <Button type="button" variant="outline" onClick={() => void act("CLOSE")}><XCircle className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.CLOSE")}</Button> : null}
      {data.capabilities.canReopen ? <Button type="button" variant="outline" onClick={() => void act("REOPEN")}><RotateCcw className="h-4 w-4" />{enterpriseCoreT(locale, "request.action.REOPEN")}</Button> : null}
    </div>
    <section className="grid gap-2"><h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "requests.coordination.conversation")}</h4>{data.coordination.comments.length ? data.coordination.comments.map((item) => <article key={item.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><p className="whitespace-pre-wrap text-dtsc-ink">{item.content}</p><p className="mt-2 text-xs text-dtsc-muted">{new Date(item.createdAt).toLocaleString(enterpriseCoreT(locale, "meetings.coordination.en.gb"))}</p></article>) : <p className="text-sm text-dtsc-muted">{enterpriseCoreT(locale, "requests.coordination.no.exchange.yet")}</p>}</section>
    <section className="grid gap-2"><h4 className="font-black text-dtsc-ink">{enterpriseCoreT(locale, "requests.coordination.lifecycle.history")}</h4>{data.coordination.events.map((event) => <article key={event.id} className="rounded-xl border border-dtsc-border p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><StatusBadge>{event.eventType}</StatusBadge>{event.fromStatus || event.toStatus ? <span className="text-xs text-dtsc-muted">{event.fromStatus || "—"} → {event.toStatus || "—"}</span> : null}</div><p className="mt-2 text-dtsc-muted">{event.summary}</p></article>)}</section>
  </div>;
}
