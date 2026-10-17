"use client";

import { BriefcaseBusiness, Plus, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { currencyChoices, Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { commercialHotfixCopy } from "@/components/enterprise/professional/commercial-hotfix-copy";
import { BusinessPartyOpportunityManager } from "@/components/enterprise/professional/business-party-opportunity-manager";
import { publishEnterpriseCrmUpdate, subscribeEnterpriseCrmUpdates } from "@/lib/enterprise/crm-sales/client-sync";
import { ProfessionalError, ProfessionalFormSection, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpMoney, professionalErpT, type ProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";

type LeadSummary = {
  id: string;
  reference: string;
  status: string;
  expectedValue: string | number | null;
  currency: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
};

type OpportunitySummary = {
  id: string;
  reference: string;
  name: string;
  status: string;
  estimatedValue: string | number | null;
  currency: string | null;
  probabilityPercent: number;
  nextAction: string | null;
  nextActionAt: string | null;
  expectedCloseDate: string | null;
};

type CommercialSummary = {
  available: boolean;
  canWrite: boolean;
  partyActive?: boolean;
  commercialEligible?: boolean;
  lead: LeadSummary | null;
  opportunities: OpportunitySummary[];
};

const SOURCES = ["REFERRAL", "WEBSITE", "SOCIAL", "EVENT", "OUTBOUND", "OTHER"] as const;

function statusTone(value: string) {
  if (["WON", "CONVERTED", "QUALIFIED"].includes(value)) return "success" as const;
  if (["LOST", "ARCHIVED"].includes(value)) return "danger" as const;
  if (["PROPOSAL", "NEGOTIATION", "CONTACTED"].includes(value)) return "warning" as const;
  return "neutral" as const;
}

export function BusinessPartyCommercialPanel({
  organizationId,
  businessPartyId,
  locale,
}: {
  organizationId: string;
  businessPartyId: string;
  locale: ProfessionalErpLocale;
}) {
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const hotfix = commercialHotfixCopy(locale);
  const [summary, setSummary] = useState<CommercialSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [opportunityHubOpen, setOpportunityHubOpen] = useState(false);
  const [opportunityCreateOpen, setOpportunityCreateOpen] = useState(false);
  const [managedOpportunityId, setManagedOpportunityId] = useState<string | null>(null);
  const [hubItems, setHubItems] = useState<OpportunitySummary[]>([]);
  const [hubPage, setHubPage] = useState(1);
  const [hubHasMore, setHubHasMore] = useState(false);
  const [hubLoading, setHubLoading] = useState(false);


  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useToastMessage(error, "error");
  useToastMessage(success, "success");

  useEffect(() => {
    let active = true;
    setError("");
    void fetch(`/api/enterprise/${organizationId}/business-parties/${businessPartyId}/commercial-summary`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as (CommercialSummary & { message?: string }) | null;
        if (!response.ok || !body) throw new Error(body?.message || t("common.loadFailed"));
        if (active) setSummary(body);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t("common.loadFailed"));
      });
    return () => { active = false; };
  }, [organizationId, businessPartyId, refreshKey, locale]);

  useEffect(() => subscribeEnterpriseCrmUpdates(organizationId, (partyId) => {
    if (!partyId || partyId === businessPartyId) setRefreshKey((value) => value + 1);
  }), [organizationId, businessPartyId]);

  useEffect(() => {
    if (!opportunityHubOpen) return;
    let active = true;
    setHubLoading(true);
    void fetch(`/api/enterprise/${organizationId}/opportunities?businessPartyId=${encodeURIComponent(businessPartyId)}&page=1&pageSize=50`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { items?: OpportunitySummary[]; pagination?: { pageCount: number }; message?: string } | null;
        if (!response.ok || !body?.items) throw new Error(body?.message || t("common.loadFailed"));
        if (active) {
          setHubItems(body.items);
          setHubPage(1);
          setHubHasMore((body.pagination?.pageCount || 1) > 1);
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t("common.loadFailed")); })
      .finally(() => { if (active) setHubLoading(false); });
    return () => { active = false; };
  }, [opportunityHubOpen, organizationId, businessPartyId, refreshKey, locale]);

  async function loadMoreOpportunities() {
    if (hubLoading || !hubHasMore) return;
    setHubLoading(true);
    try {
      const nextPage = hubPage + 1;
      const response = await fetch(`/api/enterprise/${organizationId}/opportunities?businessPartyId=${encodeURIComponent(businessPartyId)}&page=${nextPage}&pageSize=50`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { items?: OpportunitySummary[]; pagination?: { pageCount: number }; message?: string } | null;
      if (!response.ok || !body?.items) throw new Error(body?.message || t("common.loadFailed"));
      setHubItems((items) => [...items, ...body.items!.filter((item) => !items.some((prior) => prior.id === item.id))]);
      setHubPage(nextPage);
      setHubHasMore(nextPage < (body.pagination?.pageCount || 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.loadFailed"));
    } finally { setHubLoading(false); }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/opportunities`, {
        businessPartyId,
        name: String(form.get("name") || "").trim(),
        description: String(form.get("description") || "") || null,
        estimatedValue: String(form.get("estimatedValue") || "") || null,
        currency: String(form.get("currency") || "") || null,
        probabilityPercent: Number(form.get("probabilityPercent") || 0),
        source: String(form.get("source") || "") || null,
        expectedCloseDate: String(form.get("expectedCloseDate") || "") || null,
        nextAction: String(form.get("nextAction") || "") || null,
        nextActionAt: String(form.get("nextActionAt") || "") || null,
        notes: String(form.get("notes") || "") || null,
      });
      setOpportunityCreateOpen(false);
      setOpportunityHubOpen(false);
      publishEnterpriseCrmUpdate(organizationId, businessPartyId);
      const created = result.opportunity as { id?: string } | undefined;
      if (created?.id) setManagedOpportunityId(created.id);
      setSuccess(t("crm.opportunityCreated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("common.createFailed"));
    } finally { setBusy(false); }
  }

  async function startProspecting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/leads/onboarding`, {
        mode: "EXISTING",
        businessPartyId,
        lead: {
          companyName: null,
          source: String(form.get("source") || "") || null,
          ownerUserId: null,
          departmentId: null,
          expectedValue: String(form.get("expectedValue") || "") || null,
          currency: String(form.get("currency") || "") || null,
          notes: String(form.get("notes") || "") || null,
          nextAction: String(form.get("nextAction") || "") || null,
          nextActionAt: String(form.get("nextActionAt") || "") || null,
        },
      });
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setSuccess(hotfix.savedLead);
      publishEnterpriseCrmUpdate(organizationId, businessPartyId);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : t("common.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!summary?.available) return null;

  const currencies = currencyChoices(locale);
  const sourceItems = SOURCES.map((code) => ({ id: code, label: professionalErpEnumLabel(locale, "source", code) }));
  const canStart = Boolean(summary.canWrite && summary.partyActive && summary.commercialEligible && !summary.lead);
  const canManageOpportunities = Boolean(summary.canWrite && summary.partyActive && summary.commercialEligible);

  return <>
    <ModuleSection
      title={t("crm.title")}
      description={t("crm.pipelineDescription")}
      count={summary.opportunities.length + (summary.lead ? 1 : 0)}
      action={<Button type="button" variant="outline" onClick={() => setOpportunityHubOpen(true)}><BriefcaseBusiness className="h-4 w-4" />{t("crm.opportunityManageAll")}</Button>}
    >
      {error && !createOpen ? <ProfessionalError message={error} /> : null}
      {summary.lead ? <div className="mb-4 rounded-xl border border-dtsc-border bg-dtsc-soft p-4">
        <div className="flex flex-wrap items-center gap-2">
          <UserRound className="h-4 w-4 text-dtsc-blue" />
          <span className="font-black text-dtsc-ink">{t("crm.viewLeads")}</span>
          <StatusBadge tone={statusTone(summary.lead.status)}>{professionalErpEnumLabel(locale, "leadStatus", summary.lead.status)}</StatusBadge>
          <StatusBadge>{summary.lead.reference}</StatusBadge>
        </div>
        <p className="mt-2 text-sm text-dtsc-muted">
          {professionalErpMoney(summary.lead.expectedValue, summary.lead.currency, locale)} · {summary.lead.nextAction || t("common.none")} · {professionalErpDate(summary.lead.nextActionAt, locale)}
        </p>
      </div> : canStart ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dtsc-border bg-dtsc-soft p-4">
        <p className="text-sm text-dtsc-muted">{t("crm.noLeadDescription")}</p>
        <Button onClick={() => { setError(""); setSuccess(""); setCreateOpen(true); }}><Plus className="h-4 w-4" />{t("crm.newLead")}</Button>
      </div> : null}

      {summary.opportunities.length ? <BusinessList ariaLabel={t("crm.opportunitiesAria")}>
        {summary.opportunities.map((item) => <BusinessListItem
          key={item.id}
          title={item.name}
          onOpen={() => { setOpportunityHubOpen(false); setManagedOpportunityId(item.id); }}
          openLabel={t("crm.opportunityOpenNamed", { name: item.name })}
          leading={<BriefcaseBusiness className="h-5 w-5 text-dtsc-blue" />}
          status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "opportunityStage", item.status)}</StatusBadge>}
          meta={`${item.reference} · ${professionalErpMoney(item.estimatedValue, item.currency, locale)} · ${item.probabilityPercent}%`}
          description={`${item.nextAction || t("common.none")} · ${professionalErpDate(item.nextActionAt || item.expectedCloseDate, locale)}`}
        />)}
      </BusinessList> : <EmptyState compact title={t("crm.noOpportunityTitle")} description={t("crm.noOpportunityDescription")} />}
    </ModuleSection>


    <Dialog
      open={opportunityHubOpen}
      onClose={() => setOpportunityHubOpen(false)}
      title={t("crm.opportunityManageAll")}
      description={t("crm.opportunityHubDescription")}
      className="h-[96dvh] w-[calc(100vw-1rem)] sm:w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)]"
      presentation="editor"
      footer={<>
        <Button variant="outline" onClick={() => setOpportunityHubOpen(false)}>{t("common.cancel")}</Button>
        {canManageOpportunities ? <Button onClick={() => { setOpportunityHubOpen(false); setOpportunityCreateOpen(true); }}><Plus className="h-4 w-4" />{t("crm.opportunityNew")}</Button> : null}
      </>}
    >
      <div className="grid gap-4 p-3 sm:p-6">
        {error ? <ProfessionalError message={error} /> : null}
        {summary.lead ? <p className="rounded-xl border border-dtsc-border p-3 text-sm">{t("crm.viewLeads")} · {summary.lead.reference} · {professionalErpEnumLabel(locale, "leadStatus", summary.lead.status)}</p> : null}
        {hubItems.length ? <BusinessList ariaLabel={t("crm.opportunitiesAria")}>
          {hubItems.map((item) => <BusinessListItem key={item.id} title={item.name} status={<StatusBadge tone={statusTone(item.status)}>{professionalErpEnumLabel(locale, "opportunityStage", item.status)}</StatusBadge>}
            meta={`${item.reference} · ${professionalErpMoney(item.estimatedValue, item.currency, locale)}`}
            description={item.nextAction || t("common.none")}
            onOpen={() => { setOpportunityHubOpen(false); setManagedOpportunityId(item.id); }}
            openLabel={t("crm.opportunityOpenNamed", { name: item.name })} />)}
        </BusinessList> : hubLoading ? <p className="py-6 text-sm text-dtsc-muted">{t("common.loading")}</p> : <EmptyState compact title={t("crm.noOpportunityTitle")} description={t("crm.noOpportunityDescription")} />}
        {hubHasMore ? <Button variant="outline" disabled={hubLoading} onClick={() => void loadMoreOpportunities()}>{hubLoading ? t("common.loading") : t("crm.opportunityLoadMore")}</Button> : null}
      </div>
    </Dialog>
    <Dialog
      open={opportunityCreateOpen}
      onClose={() => { if (!busy) setOpportunityCreateOpen(false); }}
      title={t("crm.opportunityNew")}
      className="h-[94dvh] max-w-4xl"
      presentation="editor"
      footer={<><Button variant="outline" disabled={busy} onClick={() => setOpportunityCreateOpen(false)}>{t("common.cancel")}</Button>
        <Button type="submit" form="party-create-opportunity-form" disabled={busy}>{busy ? t("common.saving") : t("crm.opportunityCreate")}</Button></>}
    >
      <form id="party-create-opportunity-form" onSubmit={createOpportunity} className="grid gap-4 p-3 sm:p-6">
        {error ? <ProfessionalError message={error} /> : null}
        <ProfessionalFormSection title={t("crm.opportunityNew")}>
          <Field label={t("crm.opportunityName")} required><Input name="name" required minLength={2} /></Field>
          <Field label={t("crm.opportunityDescription")}><textarea name="description" className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" rows={3} /></Field>
          <Field label={t("crm.estimatedValue")}><Input type="number" name="estimatedValue" min="0" step="0.01" /></Field>
          <Field label={t("crm.currency")}><NativeSelect name="currency" items={currencies} /></Field>
          <Field label={t("crm.opportunityProbability")}><Input type="number" name="probabilityPercent" min="0" max="100" defaultValue="0" /></Field>
          <Field label={t("crm.source")}><NativeSelect name="source" items={sourceItems} /></Field>
          <Field label={t("crm.opportunityExpectedClose")}><Input type="date" name="expectedCloseDate" /></Field>
          <Field label={t("crm.nextActionField")}><Input name="nextAction" /></Field>
          <Field label={t("crm.due")}><Input type="datetime-local" name="nextActionAt" /></Field>
          <Field label={t("crm.notes")}><textarea name="notes" className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" rows={3} /></Field>
        </ProfessionalFormSection>
      </form>
    </Dialog>
    <BusinessPartyOpportunityManager
      organizationId={organizationId}
      businessPartyId={businessPartyId}
      opportunityId={managedOpportunityId}
      locale={locale}
      onClose={() => setManagedOpportunityId(null)}
      onChanged={() => setRefreshKey((value) => value + 1)}
    />

    <Dialog
      open={createOpen}
      onClose={() => { if (!busy) setCreateOpen(false); }}
      title={t("crm.newLeadDialog")}
      className="h-[90dvh] max-w-3xl"
      presentation="editor"
      footer={<>
        <Button variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
        <Button type="submit" form="party-start-prospecting-form" disabled={busy}>{busy ? t("common.saving") : t("crm.createLead")}</Button>
      </>}
    >
      <form id="party-start-prospecting-form" onSubmit={startProspecting} className="grid gap-6 p-4 sm:p-5">
        {error ? <ProfessionalError message={error} /> : null}
        <ProfessionalFormSection title={t("crm.contactOrigin")}>
          <Field label={t("crm.source")}><NativeSelect name="source" items={sourceItems} /></Field>
        </ProfessionalFormSection>
        <ProfessionalFormSection title={t("crm.potentialNextAction")}>
          <Field label={t("crm.estimatedValue")}><Input name="expectedValue" type="number" min="0" step="0.01" /></Field>
          <Field label={t("crm.currency")} help={hotfix.currencyConfigurationHelp}><NativeSelect name="currency" items={currencies} /></Field>
          <Field label={t("crm.nextActionField")}><Input name="nextAction" /></Field>
          <Field label={t("crm.due")}><Input name="nextActionAt" type="datetime-local" /></Field>
          <Field label={t("crm.notes")}><textarea name="notes" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field>
        </ProfessionalFormSection>
      </form>
    </Dialog>
  </>;
}
