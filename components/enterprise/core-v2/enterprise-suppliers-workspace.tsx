"use client";

import { Archive, Eye, PauseCircle, Pencil, Plus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { ProfessionalError, ProfessionalFormSection } from "@/components/enterprise/professional/professional-erp-ui";
import { BusinessPartyIdentityFields, type BusinessPartyIdentityLabels } from "@/components/enterprise/shared/business-party-identity-fields";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ContextActions, type BusinessContextAction } from "@/components/workspace/context-actions";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleSection } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { Field, NativeSelect, statusLabel } from "@/components/enterprise/core-v2/erp-v2-ui";
import { enterpriseV2Mutation, useEnterpriseV2Collection } from "@/components/enterprise/core-v2/use-enterprise-v2-collection";
import { enterpriseCoreT, type EnterpriseCoreKey } from "@/lib/enterprise-core-i18n";

type IdentityLink = { id: string; status: string; requestedRelationType: string; activatedAt: string | null; expiresAt: string | null };
type SupplierContact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; isPrimary: boolean; identityLink: IdentityLink | null };
type SupplierItem = { id: string; legalName: string; displayName: string | null; supplierType: string | null; category: string | null; status: string; email: string | null; phone: string | null; country: string | null; revision: number; contacts: SupplierContact[]; identityLink: IdentityLink | null; _count: { purchases: number } };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };
type PartyOption = { id: string; code: string; partyType: "PERSON" | "ORGANIZATION"; legalName: string; displayName: string | null; primaryEmail: string | null; primaryPhone: string | null; taxIdentifier: string | null; registrationId: string | null; roles: Array<{ roleCode: string; status: string }>; supplierId: string | null; supplierLinkArchived: boolean };

const supplierStatuses = ["PROSPECT", "ACTIVE", "SUSPENDED", "INACTIVE"];

function identityTone(status?: string | null) {
  return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const;
}
function identityStatusLabel(locale: string | null | undefined, status: string) { return enterpriseCoreT(locale, `suppliers.identity.${status}` as EnterpriseCoreKey); }
function supplierTypeLabel(locale: string | null | undefined, supplierType?: string | null) { return enterpriseCoreT(locale, `suppliers.type.${supplierType === "PERSON" ? "PERSON" : "ORGANIZATION"}` as EnterpriseCoreKey); }

export function EnterpriseSuppliersWorkspace({ organizationId, canManage, locale, legacyRecords = [] }: { organizationId: string; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [country, setCountry] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SupplierItem | null>(null);
  const [contactTarget, setContactTarget] = useState<SupplierItem | null>(null);
  const [feedback, setFeedback] = useState("");
  const [createError, setCreateError] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [partyType, setPartyType] = useState<"PERSON" | "ORGANIZATION">("ORGANIZATION");
  const [partySearch, setPartySearch] = useState("");
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyLoadError, setPartyLoadError] = useState("");
  const [businessPartyId, setBusinessPartyId] = useState("");
  const [category, setCategory] = useState("");
  const [supplierStatus, setSupplierStatus] = useState("PROSPECT");
  const [website, setWebsite] = useState("");
  const [supplierIdentityChoice, setSupplierIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [contactIdentityChoice, setContactIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");

  useToastMessage(feedback);
  useToastMessage(createError, "error");
  useToastMessage(warning, "warning");

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (statusFilter) value.set("status", statusFilter); if (country.trim()) value.set("country", country.trim()); return value; }, [page, search, statusFilter, country]);
  const collection = useEnterpriseV2Collection<SupplierItem>({ endpoint: `/api/enterprise/${organizationId}/suppliers`, params, refreshKey });
  const metrics = collection.meta.metrics || {};

  const identityLabels: BusinessPartyIdentityLabels = {
    identityTitle: t("suppliers.onboarding.identityTitle"),
    identityDescription: t("suppliers.onboarding.identityDescription"),
    contactTitle: t("suppliers.onboarding.contactTitle"),
    contactDescription: t("suppliers.onboarding.contactDescription"),
    partyType: t("suppliers.onboarding.partyType"),
    personType: t("suppliers.type.PERSON"),
    organizationType: t("suppliers.type.ORGANIZATION"),
    legalNamePerson: t("suppliers.onboarding.legalName.person"),
    legalNameOrganization: t("suppliers.onboarding.legalName.organization"),
    displayName: t("suppliers.onboarding.displayName"),
    taxIdentifier: t("suppliers.onboarding.taxIdentifier"),
    registrationId: t("suppliers.onboarding.registrationId"),
    primaryEmail: t("suppliers.onboarding.primaryEmail"),
    primaryPhone: t("suppliers.onboarding.primaryPhone"),
    addressLine1: t("suppliers.onboarding.addressLine1"),
    addressLine2: t("suppliers.onboarding.addressLine2"),
    city: t("suppliers.onboarding.city"),
    stateProvince: t("suppliers.onboarding.stateProvince"),
    postalCode: t("suppliers.onboarding.postalCode"),
    countryCode: t("suppliers.onboarding.countryCode"),
  };

  useEffect(() => {
    if (!createOpen || mode !== "EXISTING") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPartyLoading(true); setPartyLoadError("");
      const query = new URLSearchParams({ page: "1", pageSize: "30" });
      if (partySearch.trim()) query.set("search", partySearch.trim());
      try {
        const response = await fetch(`/api/enterprise/${organizationId}/suppliers/party-options?${query.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null) as { items?: PartyOption[]; message?: string } | null;
        if (!response.ok || !body?.items) throw new Error(body?.message || t("suppliers.onboarding.loadFailed"));
        setPartyOptions(body.items);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPartyLoadError(error instanceof Error ? error.message : t("suppliers.onboarding.loadFailed"));
      } finally { if (!controller.signal.aborted) setPartyLoading(false); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [createOpen, mode, organizationId, partySearch]);

  function resetCreate() {
    setMode("EXISTING"); setPartyType("ORGANIZATION"); setPartySearch(""); setPartyOptions([]); setPartyLoadError(""); setBusinessPartyId("");
    setCategory(""); setSupplierStatus("PROSPECT"); setWebsite(""); setSupplierIdentityChoice("MANUAL_ONLY"); setCreateError(""); setWarning("");
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(""); setWarning(""); setFeedback("");
    const form = new FormData(event.currentTarget);
    if (mode === "EXISTING" && !businessPartyId) { setCreateError(t("suppliers.onboarding.choosePartyPlaceholder")); return; }
    setBusy(true);
    try {
      const base = { mode, category, status: supplierStatus, website } as const;
      const email = String(form.get("primaryEmail") || "").trim();
      const phone = String(form.get("primaryPhone") || "").trim();
      const address = String(form.get("addressLine1") || "").trim();
      const payload = mode === "EXISTING" ? { ...base, businessPartyId } : {
        ...base,
        party: {
          partyType,
          legalName: String(form.get("legalName") || ""),
          displayName: String(form.get("displayName") || "") || null,
          taxIdentifier: String(form.get("taxIdentifier") || "") || null,
          registrationId: String(form.get("registrationId") || "") || null,
          primaryEmail: email || null,
          primaryPhone: phone || null,
          contacts: [
            ...(email ? [{ contactType: "EMAIL", label: t("suppliers.onboarding.primaryEmail"), value: email, isPrimary: true }] : []),
            ...(phone ? [{ contactType: "PHONE", label: t("suppliers.onboarding.primaryPhone"), value: phone, isPrimary: !email }] : []),
          ],
          addresses: address ? [{ addressType: "PRIMARY", label: t("suppliers.onboarding.addressLine1"), line1: address, line2: String(form.get("addressLine2") || "") || null, city: String(form.get("city") || "") || null, stateProvince: String(form.get("stateProvince") || "") || null, postalCode: String(form.get("postalCode") || "") || null, countryCode: String(form.get("countryCode") || "") || null, isPrimary: true }] : [],
          notes: String(form.get("notes") || "") || null,
        },
      };
      const result = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/onboarding`, "POST", payload) as { supplier?: SupplierItem; party?: { id: string; displayName: string | null; legalName: string } };
      if (mode === "NEW" && partyType === "PERSON" && result.party && supplierIdentityChoice !== "MANUAL_ONLY" && supplierIdentityChoice !== "LINK_LATER") {
        try {
          if (!email) throw new Error(t("suppliers.invitationEmailRequired"));
          await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", { email, displayName: result.party.displayName || result.party.legalName, businessPartyId: result.party.id, relationType: "SUPPLIER_REPRESENTATIVE", purpose: t("suppliers.invitationPurpose.individual") });
        } catch (error) { setWarning(error instanceof Error ? error.message : t("suppliers.invitationEmailRequired")); }
      }
      setCreateOpen(false); resetCreate(); setRefreshKey((value) => value + 1); setFeedback(t("suppliers.onboarding.created"));
    } catch (error) { setCreateError(error instanceof Error ? error.message : t("suppliers.onboarding.loadFailed")); }
    finally { setBusy(false); }
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!contactTarget) return; const form = new FormData(event.currentTarget); setFeedback("");
    try {
      const result = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/${contactTarget.id}/contacts`, "POST", { ...Object.fromEntries(form.entries()), isPrimary: form.get("isPrimary") === "on" }) as { contact?: SupplierContact };
      const contact = result.contact; const email = String(form.get("email") || "").trim();
      if (contact && contactIdentityChoice !== "MANUAL_ONLY" && contactIdentityChoice !== "LINK_LATER") {
        if (!email) throw new Error(t("suppliers.invitationEmailRequired"));
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", { email, displayName: contact.name, supplierContactId: contact.id, relationType: "SUPPLIER_REPRESENTATIVE", purpose: t("suppliers.invitationPurpose.contact") });
      }
      setContactTarget(null); setRefreshKey((value) => value + 1); setContactIdentityChoice("MANUAL_ONLY"); setFeedback(t("suppliers.contactAdded"));
    } catch (error) { setFeedback(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function action(item: SupplierItem, actionName: string) {
    const reason = actionName === "SUSPEND" ? (window.prompt(t("suppliers.suspensionReason")) || "") : "";
    if (actionName === "SUSPEND" && !reason) return;
    try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/${item.id}/actions`, "POST", { action: actionName, revision: item.revision, reason }); setRefreshKey((value) => value + 1); setFeedback(t("suppliers.updated")); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  const actionsFor = (item: SupplierItem): BusinessContextAction[] => [
    { id: "open", label: t("suppliers.action.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(canManage ? [
      { id: "contact", label: t("suppliers.action.addContact"), icon: UserPlus, onSelect: () => setContactTarget(item) },
      ...(item.status === "ACTIVE" ? [{ id: "suspend", label: t("suppliers.action.suspend"), icon: PauseCircle, onSelect: () => void action(item, "SUSPEND") }] : [{ id: "activate", label: t("suppliers.action.activate"), icon: Pencil, onSelect: () => void action(item, "ACTIVATE") }]),
      { id: "archive", label: t("suppliers.action.archive"), icon: Archive, destructive: true, separatorBefore: true, onSelect: () => void action(item, "ARCHIVE") },
    ] : []),
  ];

  const availablePartyOptions = partyOptions.filter((party) => !party.supplierId);
  const partySelectItems = [{ id: "", label: t("suppliers.onboarding.choosePartyPlaceholder") }, ...availablePartyOptions.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}${party.primaryEmail ? ` · ${party.primaryEmail}` : ""}` }))];

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={t("suppliers.indicators")}><ModuleMetric label={t("suppliers.metric.active")} value={metrics.active || 0} /><ModuleMetric label={t("suppliers.metric.suspended")} value={metrics.suspended || 0} /><ModuleMetric label={t("suppliers.metric.recent")} value={metrics.recent || 0} /></ModuleMetrics>
    <ModuleSection title={t("suppliers.section.title")} description={t("suppliers.section.description")} count={`${collection.pagination.total}`} action={canManage ? <Button onClick={() => { resetCreate(); setCreateOpen(true); }} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("suppliers.new")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("suppliers.search")} /><NativeSelect value={statusFilter} onChange={setStatusFilter} items={[{ id: "", label: t("suppliers.allStatuses") }, ...supplierStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))]} /><Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("suppliers.country")} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("suppliers.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} status={<StatusBadge>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${supplierTypeLabel(locale, item.supplierType)} · ${item.category || t("suppliers.category.uncategorized")} · ${t("suppliers.purchasesCount", { count: item._count.purchases })}`} description={item.contacts[0] ? `${item.contacts[0].name}${item.contacts[0].title ? ` · ${item.contacts[0].title}` : ""}` : item.email || item.phone || ""} onOpen={() => setDetail(item)} openLabel={t("suppliers.openNamed", { name: item.legalName })} actions={<div className="flex items-center gap-2">{item.identityLink ? <StatusBadge tone={identityTone(item.identityLink.status)}>{identityStatusLabel(locale, item.identityLink.status)}</StatusBadge> : null}<ContextActions label={t("suppliers.actions")} actions={actionsFor(item)} /></div>} />)}</BusinessList> : <EmptyState compact title={t("suppliers.noSuppliers")} description={collection.error || t("suppliers.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("suppliers.historical.title")} description={t("suppliers.historical.description")}><BusinessList ariaLabel={t("suppliers.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("suppliers.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen} onClose={() => { if (!busy) { setCreateOpen(false); resetCreate(); } }} title={t("suppliers.onboarding.title")} description={t("suppliers.onboarding.description")} className="h-[94dvh] max-w-5xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => { setCreateOpen(false); resetCreate(); }}>{t("suppliers.form.cancel")}</Button><Button type="submit" form="supplier-onboarding-form" disabled={busy || (mode === "EXISTING" && !businessPartyId)}>{busy ? t("suppliers.onboarding.creating") : t("suppliers.onboarding.create")}</Button></>}>
      <form id="supplier-onboarding-form" onSubmit={createSupplier} className="grid gap-6 p-4 sm:p-5">
        {createError ? <ProfessionalError message={createError} /> : null}
        <ProfessionalFormSection title={t("suppliers.onboarding.mode")} description={mode === "EXISTING" ? t("suppliers.onboarding.existingHelp") : t("suppliers.onboarding.newHelp")}>
          <div className="grid gap-2 md:col-span-2 sm:grid-cols-2">
            <Button type="button" variant={mode === "EXISTING" ? "default" : "outline"} aria-pressed={mode === "EXISTING"} onClick={() => { setMode("EXISTING"); setCreateError(""); }}>{t("suppliers.onboarding.mode.existing")}</Button>
            <Button type="button" variant={mode === "NEW" ? "default" : "outline"} aria-pressed={mode === "NEW"} onClick={() => { setMode("NEW"); setBusinessPartyId(""); setCreateError(""); }}>{t("suppliers.onboarding.mode.new")}</Button>
          </div>
          {mode === "EXISTING" ? <><Field label={t("suppliers.onboarding.searchParty")}><Input value={partySearch} onChange={(event) => setPartySearch(event.target.value)} /></Field><Field label={t("suppliers.onboarding.chooseParty")} required><NativeSelect value={businessPartyId} onChange={setBusinessPartyId} items={partySelectItems} disabled={partyLoading} /></Field>{partyLoadError ? <div className="md:col-span-2"><ProfessionalError message={partyLoadError} /></div> : null}{!partyLoading && !partyLoadError && !availablePartyOptions.length ? <div className="md:col-span-2"><EmptyState compact title={t("suppliers.onboarding.noParty")} description={t("suppliers.onboarding.newHelp")} /></div> : null}</> : null}
        </ProfessionalFormSection>

        {mode === "NEW" ? <><BusinessPartyIdentityFields partyType={partyType} onPartyTypeChange={setPartyType} labels={identityLabels} />{partyType === "PERSON" ? <ProfessionalFormSection title={t("suppliers.detail.representatives")} description={t("suppliers.onboarding.identityChoiceHelp")}><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={supplierIdentityChoice} onChange={setSupplierIdentityChoice} helper={t("suppliers.form.individualHelper")} /></div></ProfessionalFormSection> : null}<ProfessionalFormSection title={t("suppliers.onboarding.notes")}><Field label={t("suppliers.onboarding.notes")}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection></> : null}

        <ProfessionalFormSection title={t("suppliers.onboarding.procurementTitle")} description={t("suppliers.onboarding.procurementDescription")}>
          <Field label={t("suppliers.onboarding.category")}><Input value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
          <Field label={t("suppliers.onboarding.status")}><NativeSelect value={supplierStatus} onChange={setSupplierStatus} items={supplierStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /></Field>
          <Field label={t("suppliers.onboarding.website")}><Input value={website} onChange={(event) => setWebsite(event.target.value)} type="url" /></Field>
        </ProfessionalFormSection>
      </form>
    </Dialog>

    <Dialog open={Boolean(contactTarget)} onClose={() => setContactTarget(null)} title={t("suppliers.contact.title")} className="h-[92dvh] max-w-2xl"><form onSubmit={addContact} className="grid gap-5"><div className="grid gap-3 md:grid-cols-2"><Field label={t("suppliers.contact.name")}><Input name="name" required /></Field><Field label={t("suppliers.contact.role")}><Input name="title" /></Field><Field label={t("suppliers.form.email")}><Input name="email" type="email" /></Field><Field label={t("suppliers.contact.phone")}><Input name="phone" /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPrimary" />{t("suppliers.contact.primary")}</label></div><EnterpriseIdentityLinkChoice value={contactIdentityChoice} onChange={setContactIdentityChoice} helper={t("suppliers.contact.helper")} /><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setContactTarget(null)}>{t("suppliers.form.cancel")}</Button><Button type="submit">{t("suppliers.contact.add")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || detail?.legalName || t("suppliers.detail.fallbackTitle")} className="h-[92dvh] max-w-3xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{statusLabel(locale, detail.status)}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{identityStatusLabel(locale, detail.identityLink.status)}</StatusBadge> : <StatusBadge>{t("suppliers.detail.noRelationship")}</StatusBadge>}</div><div className="grid gap-3 md:grid-cols-2"><DetailBlock title={t("suppliers.detail.type")} value={supplierTypeLabel(locale, detail.supplierType)} /><DetailBlock title={t("suppliers.form.category")} value={detail.category || t("suppliers.category.uncategorized")} /><DetailBlock title={t("suppliers.detail.contact")} value={[detail.email, detail.phone, detail.country].filter(Boolean).join(" · ") || t("common.notSpecified")} /><DetailBlock title={t("purchases")} value={String(detail._count.purchases)} /></div><ModuleSection title={t("suppliers.detail.representatives")} description={t("suppliers.detail.representativesDescription")} count={`${detail.contacts.length}`}>{detail.contacts.length ? <BusinessList ariaLabel={t("suppliers.detail.contactsAria")}>{detail.contacts.map((contact) => <BusinessListItem key={contact.id} title={contact.name} status={contact.identityLink ? <StatusBadge tone={identityTone(contact.identityLink.status)}>{identityStatusLabel(locale, contact.identityLink.status)}</StatusBadge> : <StatusBadge>{t("suppliers.detail.notLinked")}</StatusBadge>} meta={contact.title || t("suppliers.detail.contactFallback")} description={[contact.email, contact.phone].filter(Boolean).join(" · ")} />)}</BusinessList> : <EmptyState compact title={t("suppliers.detail.noContacts")} description={t("suppliers.detail.noContactsDescription")} />}</ModuleSection></div> : null}</Dialog>
  </div>;
}

function DetailBlock({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
