"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, FileText, MessageSquareText, RefreshCcw, Save, TrendingUp } from "lucide-react";
import { currencyChoices, Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalFormSection, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
import { publishEnterpriseCrmUpdate, subscribeEnterpriseCrmUpdates } from "@/lib/enterprise/crm-sales/client-sync";
import { professionalErpDate, professionalErpDateTime, professionalErpEnumLabel, professionalErpMoney, professionalErpT, type ProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";

type OpportunityDetail = {
  id: string; businessPartyId: string; reference: string; name: string; description: string | null;
  status: string; estimatedValue: string | number | null; currency: string | null;
  probabilityPercent: number; expectedCloseDate: string | null; source: string | null;
  notes: string | null; nextAction: string | null; nextActionAt: string | null;
  revision: number; createdAt: string; updatedAt: string;
  quotes: Array<{ id: string; reference: string; status: string; totalAmount: string | number; currency: string }>;
};
type OpportunityActivity = {
  id: string; eventType: string; summary: string; fromStatus: string | null; toStatus: string | null;
  actorUserId: string; actorLabel?: string | null; createdAt: string; note: string | null;
  metadataJson: { changedFields?: string[]; changes?: Record<string, { before: string | null; after: string | null }>; lostReason?: string | null } | null;
};
type DetailPayload = {
  opportunity: OpportunityDetail;
  timeline: OpportunityActivity[];
  lead: { id: string; reference: string; status: string } | null;
  page: number; hasMore: boolean; canWrite: boolean;
};

const NEXT_STAGE: Record<string, string[]> = {
  OPEN: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: ["CLOSED"],
  LOST: ["CLOSED"],
};
const SOURCES = ["REFERRAL", "WEBSITE", "SOCIAL", "EVENT", "OUTBOUND", "OTHER"] as const;
function localDateTimeInput(utc: string | null | undefined) {
  if (!utc) return "";
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function optionalDateTimeInput(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  return raw ? new Date(raw).toISOString() : null;
}


export function BusinessPartyOpportunityManager({
  organizationId, businessPartyId, opportunityId, locale, onClose, onChanged,
}: {
  organizationId: string; businessPartyId: string; opportunityId: string | null;
  locale: ProfessionalErpLocale; onClose: () => void; onChanged: () => void;
}) {
  const t = (key: Parameters<typeof professionalErpT>[1], vars?: Record<string, string | number>) => professionalErpT(locale, key, vars);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [events, setEvents] = useState<OpportunityActivity[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stage, setStage] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [note, setNote] = useState("");

  useToastMessage(error, "error");
  useToastMessage(success, "success");

  const reload = useCallback(async (targetId: string, nextPage = 1) => {
    const response = await fetch(`/api/enterprise/${organizationId}/opportunities/${targetId}?page=${nextPage}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as (DetailPayload & { message?: string }) | null;
    if (!response.ok || !body) throw new Error(body?.message || (locale === "en" ? "Could not load this opportunity." : "Impossible de charger cette opportunité."));
    if (body.opportunity.businessPartyId !== businessPartyId) throw new Error(locale === "en" ? "This opportunity is not linked to this record." : "Cette opportunité n’appartient pas à cette fiche.");
    setDetail(body);
    setEvents((previous) => nextPage === 1 ? body.timeline : [...previous, ...body.timeline]);
    setPage(nextPage);
    setHasMore(body.hasMore);
    return body;
  }, [organizationId, businessPartyId, locale]);

  useEffect(() => {
    if (!opportunityId) { setDetail(null); setEvents([]); setEditOpen(false); return; }
    let active = true;
    setLoading(true); setError(""); setEvents([]); setStage(""); setLostReason(""); setNote("");
    void reload(opportunityId).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t("common.loadFailed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [opportunityId, reload]);

  useEffect(() => subscribeEnterpriseCrmUpdates(organizationId, (partyId) => {
    if (opportunityId && (!partyId || partyId === businessPartyId)) {
      void reload(opportunityId).catch((cause) => setError(cause instanceof Error ? cause.message : t("common.loadFailed")));
    }
  }), [organizationId, businessPartyId, opportunityId, reload]);

  async function mutate(action: () => Promise<unknown>, message: string): Promise<boolean> {
    if (!opportunityId || busy) return false;
    setBusy(true); setError(""); setSuccess("");
    try {
      await action();
      // The server commit is authoritative. Invalidate other screens even if
      // re-reading the detail subsequently encounters a transient error.
      publishEnterpriseCrmUpdate(organizationId, businessPartyId);
      onChanged();
      setSuccess(message);
      try {
        await reload(opportunityId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("common.loadFailed"));
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.updateFailed"));
      return false;
    } finally { setBusy(false); }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const saved = await mutate(() => professionalMutation(`/api/enterprise/${organizationId}/opportunities/${detail.opportunity.id}`, {
      revision: detail.opportunity.revision,
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "") || null,
      estimatedValue: String(data.get("estimatedValue") || "") || null,
      currency: String(data.get("currency") || "") || null,
      probabilityPercent: Number(data.get("probabilityPercent") || 0),
      expectedCloseDate: String(data.get("expectedCloseDate") || "") || null,
      source: String(data.get("source") || "") || null,
      nextAction: String(data.get("nextAction") || "") || null,
      nextActionAt: optionalDateTimeInput(data.get("nextActionAt")),
    }, "PATCH"), t("crm.opportunityManaged"));
    if (saved) setEditOpen(false);
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !note.trim()) return;
    const saved = await mutate(() => professionalMutation(`/api/enterprise/${organizationId}/opportunities/${detail.opportunity.id}/notes`, {
      content: note.trim(), revision: detail.opportunity.revision,
    }), t("crm.opportunityNoteSaved"));
    if (saved) setNote("");
  }

  async function applyStage() {
    if (!detail || !stage) return;
    if (stage === "LOST" && lostReason.trim().length < 2) {
      setError(t("crm.opportunityLostReasonRequired")); return;
    }
    const saved = await mutate(() => professionalMutation(`/api/enterprise/${organizationId}/opportunities/${detail.opportunity.id}/transition`, {
      targetStatus: stage, lostReason: stage === "LOST" ? lostReason.trim() : null, revision: detail.opportunity.revision,
    }), t("crm.opportunityStageSaved"));
    if (saved) { setStage(""); setLostReason(""); }
  }

  const changedFieldLabels: Record<string, string> = {
    name: t("crm.opportunityName"), description: t("crm.opportunityDescription"),
    estimatedValue: t("crm.estimatedValue"), currency: t("crm.currency"),
    probabilityPercent: t("crm.opportunityProbability"), expectedCloseDate: t("crm.opportunityExpectedClose"),
    source: t("crm.source"), nextAction: t("crm.nextActionField"),
    nextActionAt: t("crm.due"), notes: t("crm.notes"),
  };
  const eventLabel = (event: OpportunityActivity) => {
    if (event.eventType === "OPPORTUNITY_CREATED") return t("crm.opportunityHistoryCreated");
    if (event.eventType === "OPPORTUNITY_UPDATED") return t("crm.opportunityHistoryUpdated");
    if (event.eventType === "OPPORTUNITY_NOTE_ADDED") return t("crm.opportunityHistoryNote");
    if (event.toStatus && event.fromStatus !== event.toStatus) return t("crm.opportunityHistoryStage");
    return event.summary;
  };
  const opportunity = detail?.opportunity;
  const nextStages = opportunity ? NEXT_STAGE[opportunity.status] || [] : [];
  return <Dialog
    open={Boolean(opportunityId)}
    onClose={() => { if (!busy) onClose(); }}
    title={opportunity?.name || t("crm.opportunityDetailTitle")}
    description={opportunity ? `${opportunity.reference} · ${professionalErpEnumLabel(locale, "opportunityStage", opportunity.status)}` : undefined}
    className="h-[96dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)]"
    presentation="editor"
    footer={<>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button>
      {detail?.canWrite && opportunity?.status !== "CLOSED" ? <Button disabled={busy || loading} onClick={() => setEditOpen((value) => !value)}><Save className="h-4 w-4" />{t("crm.opportunityEdit")}</Button> : null}
    </>}
  >
    <div className="grid gap-5 p-3 sm:p-6">
      {error ? <ProfessionalError message={error} /> : null}
      {success ? <p role="status" className="text-sm font-semibold text-dtsc-blue">{success}</p> : null}
      {loading || !opportunity ? <p className="py-6 text-sm text-dtsc-muted">{t("common.loading")}</p> : <>
        <div className="flex flex-wrap gap-2"><StatusBadge>{professionalErpEnumLabel(locale, "opportunityStage", opportunity.status)}</StatusBadge><StatusBadge>{opportunity.probabilityPercent}%</StatusBadge><StatusBadge>{opportunity.reference}</StatusBadge></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label={t("crm.estimatedValue")} value={professionalErpMoney(opportunity.estimatedValue, opportunity.currency, locale)} />
          <Info label={t("crm.opportunityProbability")} value={`${opportunity.probabilityPercent}%`} />
          <Info label={t("crm.opportunityExpectedClose")} value={professionalErpDate(opportunity.expectedCloseDate, locale)} />
          <Info label={t("crm.opportunityDescription")} value={opportunity.description || t("common.none")} />
          <Info label={t("crm.nextActionField")} value={opportunity.nextAction || t("common.none")} />
          <Info label={t("crm.due")} value={professionalErpDate(opportunity.nextActionAt, locale)} />
          <Info label={t("crm.source")} value={opportunity.source ? professionalErpEnumLabel(locale, "source", opportunity.source) : t("common.none")} />
          <Info label={t("crm.opportunityCreatedAt")} value={professionalErpDateTime(opportunity.createdAt, locale)} />
          <Info label={t("crm.opportunityUpdatedAt")} value={professionalErpDateTime(opportunity.updatedAt, locale)} />
        </div>
        {opportunity.notes ? <section className="rounded-xl border border-dtsc-border p-3"><h3 className="font-bold">{t("crm.notes")}</h3><p className="whitespace-pre-wrap break-words text-sm">{opportunity.notes}</p></section> : null}
        {detail?.lead ? <p className="text-sm text-dtsc-muted">{t("crm.opportunityOriginLead")}: {detail.lead.reference}</p> : null}

        {editOpen && detail?.canWrite ? <form onSubmit={saveDetails} className="grid gap-4 rounded-xl border border-dtsc-border p-3">
          <ProfessionalFormSection title={t("crm.opportunityEdit")}>
            <Field label={t("crm.opportunityName")} required><Input name="name" defaultValue={opportunity.name} minLength={2} required /></Field>
            <Field label={t("crm.opportunityDescription")}><textarea name="description" defaultValue={opportunity.description || ""} rows={3} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field>
            <Field label={t("crm.estimatedValue")}><Input type="number" name="estimatedValue" min="0" step="0.01" defaultValue={opportunity.estimatedValue == null ? "" : String(opportunity.estimatedValue)} /></Field>
            <Field label={t("crm.currency")}><NativeSelect name="currency" defaultValue={opportunity.currency || ""} items={[{ id: "", label: t("common.none") }, ...currencyChoices(locale)]} /></Field>
            <Field label={t("crm.opportunityProbability")}><Input type="number" name="probabilityPercent" min="0" max="100" step="1" defaultValue={opportunity.probabilityPercent} /></Field>
            <Field label={t("crm.opportunityExpectedClose")}><Input type="date" name="expectedCloseDate" defaultValue={opportunity.expectedCloseDate?.slice(0, 10) || ""} /></Field>
            <Field label={t("crm.source")}><NativeSelect name="source" defaultValue={opportunity.source || ""} items={[{ id: "", label: t("common.none") }, ...SOURCES.map((value) => ({ id: value, label: professionalErpEnumLabel(locale, "source", value) }))]} /></Field>
            <Field label={t("crm.nextActionField")}><Input name="nextAction" defaultValue={opportunity.nextAction || ""} /></Field>
            <Field label={t("crm.due")}><Input type="datetime-local" name="nextActionAt" defaultValue={localDateTimeInput(opportunity.nextActionAt)} /></Field>
          </ProfessionalFormSection>
          <Button type="submit" disabled={busy}><Save className="h-4 w-4" />{t("common.save")}</Button>
        </form> : null}

        {detail?.canWrite && nextStages.length ? <section className="grid gap-3 rounded-xl border border-dtsc-border p-3">
          <h3 className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5" />{t("crm.opportunityProgress")}</h3>
          <Field label={t("crm.opportunityNextStage")}><NativeSelect value={stage} onChange={setStage} items={[{ id: "", label: t("crm.opportunitySelectStage") }, ...nextStages.map((value) => ({ id: value, label: professionalErpEnumLabel(locale, "opportunityStage", value) }))]} /></Field>
          {stage === "LOST" ? <Field label={t("crm.opportunityLostReasonRequired")}><Input value={lostReason} onChange={(event) => setLostReason(event.target.value)} minLength={2} required /></Field> : null}
          <Button disabled={!stage || busy} onClick={() => void applyStage()}>{t("crm.opportunityConfirmStage")}</Button>
        </section> : null}

        {detail?.canWrite ? <form onSubmit={addNote} className="grid gap-3 rounded-xl border border-dtsc-border p-3">
          <h3 className="flex items-center gap-2 font-bold"><MessageSquareText className="h-5 w-5" />{t("crm.opportunityAddNote")}</h3>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} minLength={2} maxLength={4000} required placeholder={t("crm.opportunityNotePlaceholder")} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-dtsc-ink" />
          <Button type="submit" disabled={busy || note.trim().length < 2}>{t("crm.opportunityPublishNote")}</Button>
        </form> : null}

        <ModuleSection title={t("crm.opportunityQuotes")} count={opportunity.quotes.length}>
          {opportunity.quotes.length ? <div className="grid gap-2">{opportunity.quotes.map((quote) => <div key={quote.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-dtsc-border p-3 text-sm"><span className="flex gap-2"><FileText className="h-4 w-4" />{quote.reference} · {quote.status}</span><span>{professionalErpMoney(quote.totalAmount, quote.currency, locale)}</span></div>)}</div> : <p className="text-sm text-dtsc-muted">{t("common.none")}</p>}
        </ModuleSection>

        <ModuleSection title={t("crm.opportunityTimeline")} count={events.length}>
          <div className="grid gap-3">
            {events.map((event) => <article key={event.id} className="rounded-xl border border-dtsc-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-dtsc-muted"><Clock3 className="h-4 w-4" /><time dateTime={event.createdAt}>{professionalErpDateTime(event.createdAt, locale)}</time>{event.actorLabel ? <span> · {event.actorLabel}</span> : null}</div>
              <p className="mt-2 font-semibold text-dtsc-ink">{eventLabel(event)}</p>
              {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? <p className="text-sm">{professionalErpEnumLabel(locale, "opportunityStage", event.fromStatus)} → {professionalErpEnumLabel(locale, "opportunityStage", event.toStatus)}</p> : null}
              {event.metadataJson?.changedFields?.length ? <div className="mt-2 grid gap-1 text-sm text-dtsc-muted">
                <p className="font-semibold">{t("crm.opportunityChangedFields")}</p>
                {event.metadataJson.changedFields.map((field) => {
                  const change = event.metadataJson?.changes?.[field];
                  return <p key={field} className="whitespace-pre-wrap break-words">{changedFieldLabels[field] || field}{change ? `: ${change.before || "—"} → ${change.after || "—"}` : ""}</p>;
                })}
              </div> : null}
              {event.metadataJson?.lostReason ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{t("crm.opportunityLostReasonRequired")}: {event.metadataJson.lostReason}</p> : null}
              {event.note ? <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-dtsc-soft p-3 text-sm">{event.note}</p> : null}
            </article>)}
            {!events.length ? <p className="text-sm text-dtsc-muted">{t("crm.opportunityNoHistory")}</p> : null}
            {hasMore ? <Button variant="outline" disabled={busy || loading} onClick={() => { if (!opportunityId) return; setLoading(true); void reload(opportunityId, page + 1).catch((cause) => setError(cause instanceof Error ? cause.message : t("common.loadFailed"))).finally(() => setLoading(false)); }}><RefreshCcw className="h-4 w-4" />{t("crm.opportunityLoadMore")}</Button> : null}
          </div>
        </ModuleSection>
      </>}
    </div>
  </Dialog>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-dtsc-border p-3"><p className="text-xs font-bold uppercase tracking-wider text-dtsc-muted">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-dtsc-ink">{value}</p></div>;
}
