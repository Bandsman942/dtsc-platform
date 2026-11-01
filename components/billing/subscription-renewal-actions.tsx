"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { toastError, toastSuccess, toastInfo } from "@/lib/client-toast";
import { getSupportUrl } from "@/lib/domains";
import { fillExperienceTemplate, getExperienceCopy, getIntlLocale } from "@/lib/experience-i18n";

export type RenewalRequestSummary = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolution: string | null;
  canViewInSupport: boolean;
};

export function SubscriptionRenewalActions({ scope, expiresAt, status, paidPlan, canManage, paymentAvailable, nowMs, openRequest, latestRequest, onlineOffersId }: {
  scope: "PERSONAL" | "ORGANIZATION";
  expiresAt: string | null;
  status: string;
  paidPlan: string | null;
  canManage: boolean;
  paymentAvailable: boolean;
  nowMs: number;
  openRequest?: RenewalRequestSummary | null;
  latestRequest?: RenewalRequestSummary | null;
  onlineOffersId: string;
}) {
  const router = useRouter();
  const locale = useAppLocale();
  const copy = getExperienceCopy(locale).renewal;
  const intlLocale = getIntlLocale(locale);
  const [optimisticRequest, setOptimisticRequest] = useState<{ id: string; canViewInSupport: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const until = expiresAt ? new Date(expiresAt).getTime() - nowMs : null;
  const expired = (until !== null && until <= 0) || ["EXPIRED", "PAST_DUE", "SUSPENDED", "CANCELED"].includes(status);
  const days = until === null ? null : Math.max(0, Math.ceil(until / 86_400_000));
  const expiring = days !== null && days <= 30 && days > 0;
  const defaultOpenDate = new Date(nowMs).toISOString();
  const optimisticPending = optimisticRequest && latestRequest?.id !== optimisticRequest.id && openRequest?.id !== optimisticRequest.id;
  const activeRequest = openRequest || (optimisticPending ? { id: optimisticRequest.id, status: "OPEN", createdAt: defaultOpenDate, updatedAt: defaultOpenDate, resolution: null, canViewInSupport: optimisticRequest.canViewInSupport } : null);
  const shownRequest = activeRequest || latestRequest;
  const openStatus = Boolean(activeRequest);
  const statusLabel = shownRequest?.status === "IN_PROGRESS" ? copy.statusInProgress : shownRequest?.status === "RESOLVED" ? copy.statusResolved : shownRequest?.status === "CLOSED" ? copy.statusClosed : copy.statusOpen;

  async function requestManualRenewal() {
    setPending(true);
    try {
      const response = await fetch("/api/billing/renewal-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      const body = await response.json().catch(() => null) as { ticketId?: string; existing?: boolean; notificationPending?: boolean; canViewInSupport?: boolean; message?: string } | null;
      if (!response.ok || !body?.ticketId) { toastError(body?.message || copy.requestFailure); return; }
      setOptimisticRequest({ id: body.ticketId, canViewInSupport: body.canViewInSupport === true });
      if (body.notificationPending) toastInfo(copy.requestNotificationPending);
      else toastSuccess(body.existing ? copy.requestDuplicate : copy.requestSuccess);
      router.refresh();
    } catch { toastError(copy.serviceUnavailable); }
    finally { setPending(false); }
  }

  return (
    <div className={`min-w-0 max-w-full rounded-xl border px-3 py-3 sm:px-4 ${expired ? "border-red-400/60 bg-red-400/10" : expiring ? "border-amber-400/60 bg-amber-400/10" : "border-dtsc-border bg-dtsc-page"}`}>
      <div className="flex min-w-0 items-start gap-3">
        {expired ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" /> : <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />}
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="break-words text-sm font-black text-dtsc-ink sm:text-base">{expired ? copy.expiresTitle : expiring ? fillExperienceTemplate(copy.expiresIn, { days }) : copy.followupTitle}</h3>
          <p className="break-words text-sm leading-5 text-dtsc-muted">
            {paidPlan ? <>{fillExperienceTemplate(copy.paidPlan, { plan: paidPlan })}{" "}{expiresAt ? fillExperienceTemplate(copy.dateEnd, { date: new Date(expiresAt).toLocaleDateString(intlLocale) }) : copy.dateMissing}{" "}{expired ? copy.expiredHelp : copy.activeHelp}</> : copy.paidRequired}
          </p>
          <p className="text-xs leading-5 text-dtsc-muted">{paidPlan ? copy.oneTimeNotice : copy.newSubscriptionHelp}</p>
          {shownRequest ? (
            <div role="status" className="min-w-0 space-y-1 border-l-2 border-emerald-500 pl-3 text-sm text-dtsc-ink">
              <p className="flex flex-wrap items-center gap-2 font-bold"><MailCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />{copy.historyTitle} · {statusLabel}</p>
              <p className="text-xs text-dtsc-muted">{fillExperienceTemplate(copy.requestDate, { date: new Date(shownRequest.createdAt).toLocaleDateString(intlLocale) })} · {fillExperienceTemplate(copy.requestUpdated, { date: new Date(shownRequest.updatedAt).toLocaleDateString(intlLocale) })}</p>
              {shownRequest.resolution ? <p className="break-words text-xs text-dtsc-muted">{fillExperienceTemplate(copy.resolution, { resolution: shownRequest.resolution })}</p> : null}
              {shownRequest.canViewInSupport ? <Link href={getSupportUrl(`/support?ticketId=${encodeURIComponent(shownRequest.id)}#tickets`)} className="inline-flex min-h-11 items-center text-sm font-bold text-dtsc-blue underline underline-offset-2 hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">{copy.viewRequest}</Link> : <p className="text-xs text-dtsc-muted">{copy.otherRequester}</p>}
            </div>
          ) : null}
          {!canManage && scope === "ORGANIZATION" ? <p className="text-sm font-semibold text-dtsc-muted">{copy.noManage}</p> : null}
          {!paymentAvailable && paidPlan ? <p className="text-xs font-semibold text-dtsc-muted">{copy.onlineUnavailable}</p> : null}
          <div data-responsive-actions className="flex min-w-0 flex-wrap gap-2 pt-1">
            {canManage && paidPlan && !openStatus ? <Button type="button" size="sm" disabled={pending} onClick={() => void requestManualRenewal()} className="h-auto min-h-11 whitespace-normal text-left">{pending ? copy.sending : copy.manualAction}</Button> : null}
            {paymentAvailable && canManage ? <a href={`#${onlineOffersId}`} className="inline-flex min-h-11 max-w-full items-center rounded-xl border border-dtsc-border px-3 text-sm font-bold text-dtsc-ink transition hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">{copy.onlineAction}</a> : null}
            <Button asChild type="button" variant="outline" size="sm" className="min-h-11"><Link href={getSupportUrl("/support")}>{copy.contact}</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
