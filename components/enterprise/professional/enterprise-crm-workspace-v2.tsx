"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BriefcaseBusiness, Eye, Plus, RefreshCcw, UserRound } from "lucide-react";
import { currencyChoices, Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { commercialHotfixCopy } from "@/components/enterprise/professional/commercial-hotfix-copy";
import { professionalMutation, ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpDate, professionalErpEnumLabel, professionalErpMoney, professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Party = { id: string; code: string; partyType: "PERSON" | "ORGANIZATION"; legalName: string; displayName: string | null; primaryEmail: string | null; primaryPhone: string | null };
type Member = { id: string; label: string; role: string; positionTitle: string | null };
type Department = { id: string; labelFr: string; labelEn: string };
type Lookups = { members: Member[]; departments: Department[]; parties: Party[]; currencies: string[] };
type Lead = { id: string; reference: string; partyType: "PERSON" | "ORGANIZATION"; legalName: string; displayName: string | null; email: string | null; phone: string | null; source: string | null; status: string; expectedValue: string | number | null; currency: string | null; nextAction: string | null; nextActionAt: string | null; businessPartyId: string | null; businessParty: { id: string; code: string; legalName: string; displayName: string | null } | null; revision: number };
type Opportunity = { id: string; reference: string; businessPartyId: string; businessParty: { id: string; code: string; legalName: string; displayName: string | null } | null; name: string; status: string; estimatedValue: string | number | null; currency: string | null; probabilityPercent: number; expectedCloseDate: string | null; source: string | null; nextAction: string | null; nextActionAt: string | null; revision: number; quotes: Array<{ id: string; reference: string; status: string; totalAmount: string | number; currency: string }> };
type ConversionPreview = { lead: Lead; candidates: Party[] };

const STAGES = ["OPEN", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "CLOSED"] as const;
const SOURCES = ["REFERRAL", "WEBSITE", "SOCIAL", "EVENT", "OUTBOUND", "OTHER"] as const;
const NEXT_STAGE: Record<string, string[]> = { OPEN: ["QUALIFIED", "LOST"], QUALIFIED: ["PROPOSAL", "LOST"], PROPOSAL: ["NEGOTIATION", "WON", "LOST"], NEGOTIATION: ["WON", "LOST"], WON: ["CLOSED"], LOST: ["CLOSED"] };
const NEXT_LEAD: Record<string, string[]> = { NEW: ["CONTACTED", "QUALIFIED", "LOST", "ARCHIVED"], CONTACTED: ["QUALIFIED", "LOST", "ARCHIVED"], QUALIFIED: ["LOST", "ARCHIVED"] };

function statusTone(value: string) {
  if (["WON", "CONVERTED", "QUALIFIED"].includes(value)) return "success" as const;
  if (["LOST", "ARCHIVED"].includes(value)) return "danger" as const;
  if (["PROPOSAL", "NEGOTIATION", "CONTACTED"].includes(value)) return "warning" as const;
  return "neutral" as const;
}

export function EnterpriseCrmWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const hotfix = commercialHotfixCopy(locale);
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const stageLabel = (value: string) => professionalErpEnumLabel(locale, "opportunityStage", value);
  const leadLabel = (value: string) => professionalErpEnumLabel(locale, "leadStatus", value);
  const [view, setView] = useState("PIPELINE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], parties: [], currencies: [] });
  const [createKind, setCreateKind] = useState<"LEAD" | "OPPORTUNITY" | null>(null);
  const [leadMode, setLeadMode] = useState<"NEW" | "EXISTING">("NEW");
  const [leadPartyId, setLeadPartyId] = useState("");
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [lostOpportunity, setLostOpportunity] = useState<Opportunity | null>(null);
  const [conversion, setConversion] = useState<ConversionPreview | null>(null);
  const [conversionPartyId, setConversionPartyId] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useToastMessage(success, "success");

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CRM_PIPELINE`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => null) as (Lookups & { message?: string; error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || t("common.selectorsUnavailable"));
      if (active) setLookups({ members: body.members || [], departments: body.departments || [], parties: body.parties || [], currencies: body.currencies || [] });
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : t("common.selectorsUnavailable")); });
    return () => { active = false; };
  }, [organizationId, refreshKey, locale]);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "50" }); if (search.trim()) value.set("search", search.trim()); return value; }, [page, search]);
  const leads = useProfessionalCollection<Lead>({ endpoint: `/api/enterprise/${organizationId}/leads`, params, refreshKey });
  const opportunities = useProfessionalCollection<Opportunity>({ endpoint: `/api/enterprise/${organizationId}/opportunities`, params, refreshKey });
  const canWrite = leads.canWrite || opportunities.canWrite;
  const grouped = useMemo(() => Object.fromEntries(STAGES.map((stage) => [stage, opportunities.items.filter((item) => item.status === stage)])) as Record<string, Opportunity[]>, [opportunities.items]);
  const visibleValue = opportunities.items.reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);
  const currencies = lookups.currencies.length ? lookups.currencies.map((code) => ({ id: code, label: code })) : currencyChoices(locale);
  const sources = SOURCES.map((code) => ({ id: code, label: professionalErpEnumLabel(locale, "source", code) }));

  const resetFeedback = () => { setMessage(""); setSuccess(""); };

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback();
    const form = new FormData(event.currentTarget);
    const party = leadMode === "EXISTING" ? lookups.parties.find((item) => item.id === leadPartyId) : null;
    if (leadMode === "EXISTING" && !party) { setMessage(t("crm.selectExistingRequired")); return; }
    const legalName = party?.legalName || String(form.get("legalName") || "").trim();
    if (!legalName) { setMessage(t("crm.nameOrLegalName")); return; }
    setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/leads`, {
        partyType: party?.partyType || String(form.get("partyType") || "PERSON"),
        legalName,
        displayName: party?.displayName || String(form.get("displayName") || "") || null,
        email: party?.primaryEmail || String(form.get("email") || "") || null,
        phone: party?.primaryPhone || String(form.get("phone") || "") || null,
        companyName: String(form.get("companyName") || "") || null,
        source: String(form.get("source") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        departmentId: String(form.get("departmentId") || "") || null,
        businessPartyId: party?.id || null,
        expectedValue: String(form.get("expectedValue") || "") || null,
        currency: String(form.get("currency") || "") || null,
        nextAction: String(form.get("nextAction") || "") || null,
        nextActionAt: String(form.get("nextActionAt") || "") || null,
        notes: String(form.get("notes") || "") || null,
      });
      setCreateKind(null); setLeadMode("NEW"); setLeadPartyId(""); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedLead);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/opportunities`, {
        businessPartyId: String(form.get("businessPartyId") || ""), name: String(form.get("name") || ""), description: String(form.get("description") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null, departmentId: String(form.get("departmentId") || "") || null,
        estimatedValue: String(form.get("estimatedValue") || "") || null, currency: String(form.get("currency") || "") || null,
        probabilityPercent: String(form.get("probabilityPercent") || "0"), expectedCloseDate: String(form.get("expectedCloseDate") || "") || null,
        source: String(form.get("source") || "") || null, nextAction: String(form.get("nextAction") || "") || null, nextActionAt: String(form.get("nextActionAt") || "") || null, notes: String(form.get("notes") || "") || null,
      });
      setCreateKind(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedOpportunity);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); } finally { setBusy(false); }
  }

  async function transitionLead(item: Lead, targetStatus: string, lostReason?: string) {
    resetFeedback(); setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/leads/${item.id}/transition`, { targetStatus, lostReason: lostReason || null, revision: item.revision }); setLostLead(null); setDetailLead(null); setRefreshKey((value) => value + 1); setSuccess(`${leadLabel(targetStatus)} · ${item.displayName || item.legalName}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.transitionFailed")); } finally { setBusy(false); }
  }

  async function transitionOpportunity(item: Opportunity, targetStatus: string, lostReason?: string) {
    resetFeedback(); setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/opportunities/${item.id}/transition`, { targetStatus, lostReason: lostReason || null, revision: item.revision }); setLostOpportunity(null); setDetailOpportunity(null); setRefreshKey((value) => value + 1); setSuccess(`${stageLabel(targetStatus)} · ${item.name}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.transitionFailed")); } finally { setBusy(false); }
  }

  async function openConversion(item: Lead) {
    resetFeedback();
    try { const response = await fetch(`/api/enterprise/${organizationId}/leads/${item.id}/convert`, { cache: "no-store" }); const body = await response.json().catch(() => null) as (ConversionPreview & { message?: string; error?: string }) | null; if (!response.ok || !body) throw new Error(body?.message || body?.error || t("common.previewFailed")); setConversion(body); setConversionPartyId(item.businessPartyId || body.candidates[0]?.id || ""); setDetailLead(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.previewFailed")); }
  }

  async function convertLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!conversion) return; resetFeedback(); const form = new FormData(event.currentTarget); const createNewParty = form.get("partyDecision") === "NEW";
    if (!createNewParty && !conversionPartyId) { setMessage(t("crm.conversionDecisionRequired")); return; }
    setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/leads/${conversion.lead.id}/convert`, { businessPartyId: createNewParty ? null : conversionPartyId, createNewParty, createOpportunity: form.get("createOpportunity") === "on", opportunityName: String(form.get("opportunityName") || "") || null, estimatedValue: String(form.get("estimatedValue") || "") || null, currency: String(form.get("currency") || "") || null, expectedCloseDate: String(form.get("expectedCloseDate") || "") || null, revision: conversion.lead.revision }); setConversion(null); setRefreshKey((value) => value + 1); setSuccess(`${t("common.convert")} · ${conversion.lead.displayName || conversion.lead.legalName}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.conversionFailed")); } finally { setBusy(false); }
  }

  const views = [{ id: "PIPELINE", label: t("crm.viewPipeline"), count: opportunities.pagination.total }, { id: "OPPORTUNITIES", label: t("crm.viewOpportunities"), count: opportunities.pagination.total }, { id: "LEADS", label: t("crm.viewLeads"), count: leads.pagination.total }];
  const activePages = view === "LEADS" ? leads.pagination : opportunities.pagination;

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("crm.eyebrow", { organization: organizationName })} title={t("crm.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("crm.opportunityCount", { count: opportunities.pagination.total, suffix: opportunities.pagination.total === 1 ? "" : "s" })} primaryAction={canWrite ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { resetFeedback(); setCreateKind("LEAD"); }}><UserRound className="h-4 w-4" />{t("crm.newLead")}</Button><Button onClick={() => { resetFeedback(); setCreateKind("OPPORTUNITY"); }}><Plus className="h-4 w-4" />{t("crm.newOpportunity")}</Button></div> : undefined} />
    <ModuleMetrics label={t("crm.metricsLabel")}><ModuleMetric label={t("crm.metricOpenPipeline")} value={opportunities.metrics.open || 0} /><ModuleMetric label={t("crm.metricVisibleValue")} value={professionalErpMoney(visibleValue, opportunities.items.find((item) => item.currency)?.currency, locale)} /><ModuleMetric label={t("crm.metricProposals")} value={opportunities.metrics.proposal || 0} /><ModuleMetric label={t("crm.metricWon")} value={opportunities.metrics.won || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("crm.searchPlaceholder")} />} controls={<ProfessionalTabs value={view} onChange={(value) => { setView(value); setPage(1); }} items={views} label={t("crm.viewsLabel")} />} summary={t("common.pageOf", { page: activePages.page, pageCount: activePages.pageCount })} />
    <ModuleContent>
      {message && !createKind && !lostLead && !lostOpportunity && !conversion ? <ProfessionalError message={message} /> : null}
      {view === "PIPELINE" ? <ModuleSection title={t("crm.pipelineTitle")} description={t("crm.pipelineDescription")}><p className="mb-3 rounded-xl border border-dtsc-border bg-dtsc-soft px-4 py-3 text-sm text-dtsc-muted">{hotfix.pipelinePageNotice}</p>{opportunities.loading ? <ProfessionalLoading /> : opportunities.error ? <ProfessionalError message={opportunities.error} /> : <div className="flex max-w-full snap-x gap-4 overflow-x-auto pb-3">{STAGES.map((stage) => <section key={stage} className="w-[min(88vw,21rem)] shrink-0 snap-start border-t-4 border-dtsc-blue bg-dtsc-surface p-3"><h3 className="font-black text-dtsc-ink">{stageLabel(stage)}</h3><div className="mt-3 grid gap-3">{(grouped[stage] || []).map((item) => <article key={item.id} className="border-y border-dtsc-border bg-dtsc-soft p-3"><button type="button" className="w-full text-left" onClick={() => setDetailOpportunity(item)}><span className="font-black text-dtsc-ink">{item.name}</span><span className="mt-1 block text-xs text-dtsc-muted">{item.businessParty?.displayName || item.businessParty?.legalName || t("common.thirdPartyToReview")}</span><span className="mt-2 block text-xs">{professionalErpMoney(item.estimatedValue, item.currency, locale)} · {item.probabilityPercent}%</span></button>{canWrite ? <div className="mt-3 flex flex-wrap gap-2">{(NEXT_STAGE[item.status] || []).slice(0, 3).map((next) => <Button key={next} size="sm" variant="outline" disabled={busy} onClick={() => next === "LOST" ? setLostOpportunity(item) : void transitionOpportunity(item, next)}>{stageLabel(next)}</Button>)}</div> : null}</article>)}</div></section>)}</div>}</ModuleSection> : null}
      {view === "OPPORTUNITIES" ? <ModuleSection title={t("crm.viewOpportunities")} description={t("crm.opportunityListDescription")}>{opportunities.loading ? <ProfessionalLoading /> : opportunities.error ? <ProfessionalError message={opportunities.error} /> : opportunities.items.length ? <BusinessList ariaLabel={t("crm.opportunitiesAria")}>{opportunities.items.map((item) => <BusinessListItem key={item.id} title={item.name} leading={<BriefcaseBusiness className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{stageLabel(item.status)}</StatusBadge>} meta={`${item.reference} · ${professionalErpMoney(item.estimatedValue, item.currency, locale)} · ${item.probabilityPercent}%`} description={item.businessParty?.displayName || item.businessParty?.legalName || t("common.thirdPartyToReview")} onOpen={() => setDetailOpportunity(item)} openLabel={t("crm.openNamed", { name: item.name })} actions={<Button size="sm" variant="outline" onClick={() => setDetailOpportunity(item)}><Eye className="h-4 w-4" />{t("common.details")}</Button>} />)}</BusinessList> : <EmptyState compact title={t("crm.noOpportunityTitle")} description={t("crm.noOpportunityDescription")} />}</ModuleSection> : null}
      {view === "LEADS" ? <ModuleSection title={t("crm.viewLeads")} description={t("crm.leadsDescription")}>{leads.loading ? <ProfessionalLoading /> : leads.error ? <ProfessionalError message={leads.error} /> : leads.items.length ? <BusinessList ariaLabel={t("crm.leadsAria")}>{leads.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} leading={<UserRound className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={statusTone(item.status)}>{leadLabel(item.status)}</StatusBadge>} meta={`${item.reference} · ${professionalErpMoney(item.expectedValue, item.currency, locale)}`} description={item.email || item.phone || t("common.contactToComplete")} onOpen={() => setDetailLead(item)} openLabel={t("crm.openNamed", { name: item.legalName })} actions={item.status === "QUALIFIED" && canWrite ? <Button size="sm" onClick={() => void openConversion(item)}><RefreshCcw className="h-4 w-4" />{t("common.convert")}</Button> : undefined} />)}</BusinessList> : <EmptyState compact title={t("crm.noLeadTitle")} description={t("crm.noLeadDescription")} />}</ModuleSection> : null}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= activePages.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div>
      <ProfessionalHelp moduleCode="CRM_PIPELINE" />
    </ModuleContent>

    <Dialog open={createKind === "LEAD"} onClose={() => { if (!busy) setCreateKind(null); }} title={t("crm.newLeadDialog")} className="h-[94dvh] max-w-4xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => setCreateKind(null)}>{t("common.cancel")}</Button><Button type="submit" form="crm-lead-form" disabled={busy}>{busy ? t("common.saving") : t("crm.createLead")}</Button></>}>
      <form id="crm-lead-form" onSubmit={createLead} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("crm.businessRecord")} description={t("crm.businessRecordDescription")}><Field label={t("crm.mode")}><NativeSelect value={leadMode} onChange={(value) => { setLeadMode(value as "NEW" | "EXISTING"); setLeadPartyId(""); }} items={[{ id: "NEW", label: t("crm.createProspectRecord") }, { id: "EXISTING", label: t("crm.reuseExistingRecord") }]} /></Field>{leadMode === "EXISTING" ? <><Field label={t("crm.existingRecord")} help={hotfix.existingPartyCanonical} required><NativeSelect value={leadPartyId} onChange={setLeadPartyId} required items={lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))} /></Field><div className="md:col-span-2 rounded-xl border border-dtsc-border bg-dtsc-soft p-3 text-sm text-dtsc-muted">{hotfix.existingPartyCanonical}</div></> : <><Field label={t("customers.recordType")} required><NativeSelect name="partyType" defaultValue="PERSON" items={[{ id: "PERSON", label: professionalErpEnumLabel(locale, "partyType", "PERSON") }, { id: "ORGANIZATION", label: professionalErpEnumLabel(locale, "partyType", "ORGANIZATION") }]} /></Field><Field label={t("crm.nameOrLegalName")} required><Input name="legalName" required /></Field><Field label={t("crm.displayName")}><Input name="displayName" /></Field><Field label={t("crm.associatedCompany")}><Input name="companyName" /></Field><Field label={t("crm.email")}><Input name="email" type="email" /></Field><Field label={t("crm.phone")}><Input name="phone" /></Field></>}</ProfessionalFormSection><ProfessionalFormSection title={t("crm.contactOrigin")}><Field label={t("crm.source")}><NativeSelect name="source" items={sources} /></Field><Field label={t("crm.owner")}><NativeSelect name="ownerUserId" items={[{ id: "", label: t("common.myself") }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field><Field label={t("crm.department")}><NativeSelect name="departmentId" items={lookups.departments.map((department) => ({ id: department.id, label: locale === "en" ? department.labelEn : department.labelFr }))} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("crm.potentialNextAction")}><Field label={t("crm.estimatedValue")}><Input name="expectedValue" type="number" min="0" step="0.01" /></Field><Field label={t("crm.currency")} help={hotfix.currencyConfigurationHelp}><NativeSelect name="currency" items={currencies} /></Field><Field label={t("crm.nextActionField")}><Input name="nextAction" /></Field><Field label={t("crm.due")}><Input name="nextActionAt" type="datetime-local" /></Field><Field label={t("crm.notes")}><textarea name="notes" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></ProfessionalFormSection></form>
    </Dialog>

    <Dialog open={createKind === "OPPORTUNITY"} onClose={() => { if (!busy) setCreateKind(null); }} title={t("crm.newOpportunityDialog")} className="h-[94dvh] max-w-4xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => setCreateKind(null)}>{t("common.cancel")}</Button><Button type="submit" form="crm-opportunity-form" disabled={busy}>{busy ? t("common.saving") : t("crm.createOpportunity")}</Button></>}>
      <form id="crm-opportunity-form" onSubmit={createOpportunity} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("crm.commercialContext")}><Field label={t("crm.customerOrProspect")} required><NativeSelect name="businessPartyId" required items={lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))} /></Field><Field label={t("crm.opportunityName")} required><Input name="name" required /></Field><Field label={t("crm.source")}><NativeSelect name="source" items={sources} /></Field><Field label={t("crm.owner")}><NativeSelect name="ownerUserId" items={lookups.members.map((member) => ({ id: member.id, label: member.label }))} /></Field><Field label={t("crm.department")}><NativeSelect name="departmentId" items={lookups.departments.map((department) => ({ id: department.id, label: locale === "en" ? department.labelEn : department.labelFr }))} /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("crm.valueProbability")}><Field label={t("crm.estimatedValue")}><Input name="estimatedValue" type="number" min="0" step="0.01" /></Field><Field label={t("crm.currency")} help={hotfix.currencyConfigurationHelp}><NativeSelect name="currency" items={currencies} /></Field><Field label={t("crm.probability")}><Input name="probabilityPercent" type="number" min="0" max="100" defaultValue="10" /></Field><Field label={t("crm.expectedClose")}><Input name="expectedCloseDate" type="date" /></Field></ProfessionalFormSection><ProfessionalFormSection title={t("crm.needNextAction")}><Field label={t("crm.description")}><textarea name="description" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field><Field label={t("crm.nextActionField")}><Input name="nextAction" /></Field><Field label={t("crm.due")}><Input name="nextActionAt" type="datetime-local" /></Field><Field label={t("crm.notes")}><textarea name="notes" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" /></Field></ProfessionalFormSection></form>
    </Dialog>

    <Dialog open={Boolean(detailLead)} onClose={() => setDetailLead(null)} title={detailLead?.displayName || detailLead?.legalName || t("crm.leadFallback")} className="max-w-3xl">{detailLead ? <div className="grid gap-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detailLead.status)}>{leadLabel(detailLead.status)}</StatusBadge><StatusBadge>{detailLead.reference}</StatusBadge></div><p className="text-sm text-dtsc-muted">{detailLead.email || detailLead.phone || t("common.contactToComplete")} · {professionalErpMoney(detailLead.expectedValue, detailLead.currency, locale)} · {professionalErpDate(detailLead.nextActionAt, locale)}</p>{canWrite ? <div className="flex flex-wrap gap-2">{(NEXT_LEAD[detailLead.status] || []).map((next) => <Button key={next} variant="outline" disabled={busy} onClick={() => next === "LOST" ? setLostLead(detailLead) : void transitionLead(detailLead, next)}>{leadLabel(next)}</Button>)}{detailLead.status === "QUALIFIED" ? <Button disabled={busy} onClick={() => void openConversion(detailLead)}><RefreshCcw className="h-4 w-4" />{t("common.convert")}</Button> : null}</div> : null}</div> : null}</Dialog>
    <Dialog open={Boolean(detailOpportunity)} onClose={() => setDetailOpportunity(null)} title={detailOpportunity?.name || t("crm.opportunityFallback")} className="max-w-3xl">{detailOpportunity ? <div className="grid gap-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={statusTone(detailOpportunity.status)}>{stageLabel(detailOpportunity.status)}</StatusBadge><StatusBadge>{detailOpportunity.reference}</StatusBadge></div><p className="text-sm text-dtsc-muted">{detailOpportunity.businessParty?.displayName || detailOpportunity.businessParty?.legalName} · {professionalErpMoney(detailOpportunity.estimatedValue, detailOpportunity.currency, locale)} · {professionalErpDate(detailOpportunity.expectedCloseDate, locale)}</p>{canWrite ? <div className="flex flex-wrap gap-2">{(NEXT_STAGE[detailOpportunity.status] || []).map((next) => <Button key={next} variant="outline" disabled={busy} onClick={() => next === "LOST" ? setLostOpportunity(detailOpportunity) : void transitionOpportunity(detailOpportunity, next)}>{stageLabel(next)}</Button>)}</div> : null}</div> : null}</Dialog>

    <LostDialog open={Boolean(lostLead)} title={hotfix.leadLostTitle} message={message} busy={busy} reasonPlaceholder={hotfix.leadLostReason} cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")} onClose={() => setLostLead(null)} onSubmit={(reason) => lostLead ? void transitionLead(lostLead, "LOST", reason) : undefined} />
    <LostDialog open={Boolean(lostOpportunity)} title={t("crm.lostDialogTitle")} message={message} busy={busy} reasonPlaceholder={hotfix.leadLostReason} cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")} onClose={() => setLostOpportunity(null)} onSubmit={(reason) => lostOpportunity ? void transitionOpportunity(lostOpportunity, "LOST", reason) : undefined} />

    <Dialog open={Boolean(conversion)} onClose={() => { if (!busy) setConversion(null); }} title={t("crm.convertDialogTitle")} className="h-[92dvh] max-w-3xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => setConversion(null)}>{t("common.cancel")}</Button><Button type="submit" form="crm-convert-form" disabled={busy}>{busy ? hotfix.busy : t("common.convert")}</Button></>}>
      {conversion ? <form id="crm-convert-form" onSubmit={convertLead} className="grid gap-5 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("crm.recordDecision")} description={t("crm.recordDecisionDescription")}><div className="md:col-span-2 grid gap-3"><NativeSelect value={conversionPartyId} onChange={setConversionPartyId} items={conversion.candidates.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))} /><label className="flex gap-2"><input type="radio" name="partyDecision" value="EXISTING" defaultChecked={Boolean(conversion.candidates.length)} />{t("crm.selectRecord")}</label><label className="flex gap-2"><input type="radio" name="partyDecision" value="NEW" defaultChecked={!conversion.candidates.length} />{t("crm.createCustomerRecord")}</label></div></ProfessionalFormSection><ProfessionalFormSection title={t("crm.opportunitySection")}><Field label={t("crm.createCommercialOpportunity")}><label className="flex gap-2"><input type="checkbox" name="createOpportunity" defaultChecked />{t("crm.createCommercialOpportunity")}</label></Field><Field label={t("crm.opportunityName")}><Input name="opportunityName" defaultValue={t("crm.opportunityDefaultName", { name: conversion.lead.displayName || conversion.lead.legalName })} /></Field><Field label={t("crm.estimatedValue")}><Input name="estimatedValue" type="number" min="0" step="0.01" defaultValue={conversion.lead.expectedValue ? String(conversion.lead.expectedValue) : ""} /></Field><Field label={t("crm.currency")}><NativeSelect name="currency" defaultValue={conversion.lead.currency || ""} items={currencies} /></Field><Field label={t("crm.expectedClose")}><Input name="expectedCloseDate" type="date" /></Field></ProfessionalFormSection></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}

function LostDialog({ open, title, message, busy, reasonPlaceholder, cancelLabel, confirmLabel, onClose, onSubmit }: { open: boolean; title: string; message: string; busy: boolean; reasonPlaceholder: string; cancelLabel: string; confirmLabel: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }} title={title} className="max-w-xl">{open ? <form onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") || "").trim(); if (reason) onSubmit(reason); }} className="grid gap-4">{message ? <ProfessionalError message={message} /> : null}<Field label={reasonPlaceholder} required><textarea name="reason" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3" placeholder={reasonPlaceholder} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{cancelLabel}</Button><Button type="submit" variant="destructive" disabled={busy}>{confirmLabel}</Button></div></form> : null}</Dialog>;
}
