"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Building2, Link2, Plus, UserRound } from "lucide-react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { commercialHotfixCopy } from "@/components/enterprise/professional/commercial-hotfix-copy";
import { ProfessionalError, ProfessionalFormSection, ProfessionalHelp, ProfessionalLoading, ProfessionalSearch, ProfessionalTabs, professionalMutation, useProfessionalCollection } from "@/components/enterprise/professional/professional-erp-ui";
import { professionalErpEnumLabel, professionalErpT, useProfessionalErpLocale } from "@/components/enterprise/professional/professional-erp-i18n";
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

type Contact = { id: string; contactType: string; label: string | null; value: string; isPrimary: boolean };
type Address = { id: string; addressType: string; line1: string; city: string | null; countryCode: string | null; isPrimary: boolean };
type Party = { id: string; code: string; partyType: "PERSON" | "ORGANIZATION"; legalName: string; displayName: string | null; primaryEmail: string | null; primaryPhone: string | null; taxIdentifier: string | null; registrationId: string | null; status: string; notes: string | null; revision: number; roles: Array<{ id: string; roleCode: string }>; contacts: Contact[]; addresses: Address[]; identityLink: { id: string; status: string; requestedRelationType: string } | null };
type DuplicateCandidate = Pick<Party, "id" | "code" | "partyType" | "legalName" | "displayName" | "primaryEmail" | "primaryPhone" | "status">;

const ROLES = ["PROSPECT", "CUSTOMER", "SUPPLIER", "PARTNER", "CONTRACTOR"] as const;
function roleFilter(tab: string) { return ["PROSPECT", "CUSTOMER", "PARTNER", "CONTRACTOR", "SUPPLIER"].includes(tab) ? tab : ""; }
function relationForRoles(roles: string[]) { if (roles.includes("CUSTOMER")) return "CUSTOMER"; if (roles.includes("PROSPECT")) return "PROSPECT"; if (roles.includes("PARTNER")) return "PARTNER"; if (roles.includes("CONTRACTOR")) return "CONTRACTOR"; return "OTHER"; }
function identityTone(status?: string | null) { if (status === "ACTIVE") return "success" as const; if (["INVITATION_PENDING", "REQUEST_PENDING", "USER_CONSENT_REQUIRED", "ORGANIZATION_APPROVAL_REQUIRED"].includes(status || "")) return "warning" as const; if (["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "")) return "danger" as const; return "neutral" as const; }

export function EnterpriseCustomersWorkspace({ organizationId, organizationName, definition }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition }) {
  const locale = useProfessionalErpLocale();
  const hotfix = commercialHotfixCopy(locale);
  const t = (key: Parameters<typeof professionalErpT>[1], values?: Record<string, string | number>) => professionalErpT(locale, key, values);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Party | null>(null);
  const [edit, setEdit] = useState<Party | null>(null);
  const [identityChoice, setIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [partyType, setPartyType] = useState<"PERSON" | "ORGANIZATION">("PERSON");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["PROSPECT"]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  useToastMessage(success, "success");
  useToastMessage(warning, "warning");

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); const role = roleFilter(tab); if (role) value.set("role", role); if (tab === "PERSON" || tab === "ORGANIZATION") value.set("partyType", tab); return value; }, [page, search, tab]);
  const collection = useProfessionalCollection<Party>({ endpoint: `/api/enterprise/${organizationId}/business-parties`, params, refreshKey });

  function resetForm() { setIdentityChoice("MANUAL_ONLY"); setPartyType("PERSON"); setSelectedRoles(["PROSPECT"]); setDuplicates([]); setMessage(""); }
  function resetFeedback() { setMessage(""); setSuccess(""); setWarning(""); }

  async function checkDuplicates(form: FormData) {
    const legalName = String(form.get("legalName") || "").trim(); if (legalName.length < 2) return [];
    const query = new URLSearchParams({ legalName }); const email = String(form.get("primaryEmail") || "").trim(); const phone = String(form.get("primaryPhone") || "").trim(); if (email) query.set("primaryEmail", email); if (phone) query.set("primaryPhone", phone);
    const response = await fetch(`/api/enterprise/${organizationId}/business-parties/duplicates?${query.toString()}`, { cache: "no-store" }); const body = await response.json().catch(() => ({ items: [] })); const items = response.ok && Array.isArray(body.items) ? body.items as DuplicateCandidate[] : []; setDuplicates(items); return items;
  }

  async function sendIdentityInvitation(party: Party) {
    if (!party.primaryEmail) throw new Error(t("customers.invitationEmailRequired"));
    await professionalMutation(`/api/enterprise/${organizationId}/identity-link-invitations`, { email: party.primaryEmail, displayName: party.displayName || party.legalName, businessPartyId: party.id, relationType: relationForRoles(party.roles.map((role) => role.roleCode)), purpose: t("customers.invitationPurpose", { organization: organizationName }) });
  }

  async function createParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const candidates = await checkDuplicates(form); if (candidates.length && form.get("duplicateConfirmed") !== "yes") { setMessage(t("customers.duplicateWarning")); return; }
      const email = String(form.get("primaryEmail") || "").trim(); const phone = String(form.get("primaryPhone") || "").trim(); const address = String(form.get("addressLine1") || "").trim();
      const result = await professionalMutation(`/api/enterprise/${organizationId}/business-parties`, {
        partyType, legalName: String(form.get("legalName") || ""), displayName: String(form.get("displayName") || "") || null,
        taxIdentifier: String(form.get("taxIdentifier") || "") || null, registrationId: String(form.get("registrationId") || "") || null,
        primaryEmail: email || null, primaryPhone: phone || null, roles: selectedRoles,
        contacts: [...(email ? [{ contactType: "EMAIL", label: t("customers.primaryEmailPayloadLabel"), value: email, isPrimary: true }] : []), ...(phone ? [{ contactType: "PHONE", label: t("customers.primaryPhonePayloadLabel"), value: phone, isPrimary: !email }] : [])],
        addresses: address ? [{ addressType: "PRIMARY", label: t("customers.primaryAddressPayloadLabel"), line1: address, line2: String(form.get("addressLine2") || "") || null, city: String(form.get("city") || "") || null, stateProvince: String(form.get("stateProvince") || "") || null, postalCode: String(form.get("postalCode") || "") || null, countryCode: String(form.get("countryCode") || "") || null, isPrimary: true }] : [],
        notes: String(form.get("notes") || "") || null,
      });
      const party = result.party as Party;
      if (party && identityChoice !== "MANUAL_ONLY" && identityChoice !== "LINK_LATER") {
        try { await sendIdentityInvitation({ ...party, primaryEmail: email || party.primaryEmail, roles: party.roles?.length ? party.roles : selectedRoles.map((roleCode, index) => ({ id: String(index), roleCode })) }); }
        catch { setWarning(hotfix.savedPartyInvitationPending); }
      }
      setCreateOpen(false); resetForm(); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedParty);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
    finally { setBusy(false); }
  }

  async function retryIdentityInvitation(party: Party) {
    resetFeedback(); setBusy(true);
    try { await sendIdentityInvitation(party); setDetail(null); setRefreshKey((value) => value + 1); setSuccess(t("customers.relationshipTitle")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.createFailed")); }
    finally { setBusy(false); }
  }

  async function updateParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit) return; resetFeedback(); const form = new FormData(event.currentTarget); setBusy(true);
    try { await professionalMutation(`/api/enterprise/${organizationId}/business-parties`, { partyId: edit.id, displayName: String(form.get("displayName") || "") || null, primaryEmail: String(form.get("primaryEmail") || "") || null, primaryPhone: String(form.get("primaryPhone") || "") || null, notes: String(form.get("notes") || "") || null, status: String(form.get("status") || edit.status), revision: edit.revision }, "PATCH"); setEdit(null); setRefreshKey((value) => value + 1); setSuccess(hotfix.savedParty); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("common.updateFailed")); } finally { setBusy(false); }
  }

  function openEdit(party: Party) { resetFeedback(); setDetail(null); setEdit(party); }
  const tabs = [{ id: "ALL", label: t("customers.tabAll"), count: collection.metrics.total }, { id: "PROSPECT", label: t("customers.tabProspects"), count: collection.metrics.prospects }, { id: "CUSTOMER", label: t("customers.tabCustomers"), count: collection.metrics.customers }, { id: "ORGANIZATION", label: t("customers.tabOrganizations"), count: collection.metrics.organizations }, { id: "PERSON", label: t("customers.tabPeople"), count: collection.metrics.persons }, { id: "PARTNER", label: t("customers.tabPartners") }];

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={t("customers.eyebrow", { organization: organizationName })} title={t("customers.title")} description={locale === "en" ? definition.descriptionEn : definition.descriptionFr} count={t("common.records", { count: collection.pagination.total, suffix: collection.pagination.total === 1 ? "" : "s" })} primaryAction={collection.canWrite || collection.canManage ? <Button onClick={() => { resetForm(); resetFeedback(); setCreateOpen(true); }}><Plus className="h-4 w-4" />{t("customers.newRecord")}</Button> : undefined} />
    <ModuleMetrics label={t("customers.metricsLabel")}><ModuleMetric label={t("customers.metricActiveCustomers")} value={collection.metrics.customers || 0} /><ModuleMetric label={t("customers.metricProspects")} value={collection.metrics.prospects || 0} /><ModuleMetric label={t("customers.metricOrganizations")} value={collection.metrics.organizations || 0} /><ModuleMetric label={t("customers.metricPendingIdentity")} value={collection.metrics.pendingIdentity || 0} /></ModuleMetrics>
    <ModuleToolbar search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("customers.searchPlaceholder")} />} controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={tabs} label={t("customers.viewsLabel")} />} summary={t("common.pageOf", { page: collection.pagination.page, pageCount: collection.pagination.pageCount })} />
    <ModuleContent>
      {message && !createOpen && !edit && !detail ? <ProfessionalError message={message} /> : null}
      <ModuleSection title={t("customers.section360")} description={t("customers.section360Description")}>{collection.loading ? <ProfessionalLoading /> : collection.error ? <ProfessionalError message={collection.error} /> : collection.items.length ? <BusinessList ariaLabel={t("customers.listAria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} leading={item.partyType === "PERSON" ? <UserRound className="h-5 w-5 text-dtsc-blue" /> : <Building2 className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{professionalErpEnumLabel(locale, "status", item.status)}</StatusBadge>} meta={`${item.code} · ${item.roles.map((role) => professionalErpEnumLabel(locale, "role", role.roleCode)).join(" · ") || t("common.noRole")}`} description={[item.primaryEmail, item.primaryPhone, item.addresses[0]?.city].filter(Boolean).join(" · ") || t("common.contactToComplete")} onOpen={() => { resetFeedback(); setDetail(item); }} openLabel={t("customers.openRecord", { name: item.displayName || item.legalName })} actions={item.identityLink ? <StatusBadge tone={identityTone(item.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", item.identityLink.status)}</StatusBadge> : <StatusBadge><Link2 className="mr-1 h-3.5 w-3.5" />{t("customers.notLinked")}</StatusBadge>} />)}</BusinessList> : <EmptyState title={t("customers.emptyTitle")} description={t("customers.emptyDescription")} />}
        <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div>
      </ModuleSection><ProfessionalHelp moduleCode="CRM_CUSTOMERS" />
    </ModuleContent>

    <Dialog open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title={t("customers.createDialogTitle")} description={t("customers.createDialogDescription")} className="h-[94dvh] max-w-5xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button type="submit" form="customer-create-form" disabled={busy || !selectedRoles.length}>{busy ? t("common.saving") : t("customers.saveRecord")}</Button></>}>
      <form id="customer-create-form" onSubmit={createParty} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("customers.typeRolesTitle")} description={t("customers.typeRolesDescription")}><Field label={t("customers.recordType")} required><NativeSelect value={partyType} onChange={(value) => setPartyType(value as "PERSON" | "ORGANIZATION")} items={[{ id: "PERSON", label: professionalErpEnumLabel(locale, "partyType", "PERSON") }, { id: "ORGANIZATION", label: professionalErpEnumLabel(locale, "partyType", "ORGANIZATION") }]} /></Field><div className="grid gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-5">{ROLES.map((role) => <label key={role} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...new Set([...current, role])] : current.filter((item) => item !== role))} />{professionalErpEnumLabel(locale, "role", role)}</label>)}</div></ProfessionalFormSection><ProfessionalFormSection title={t("customers.identityTitle")} description={t("customers.identityDescription")}><Field label={partyType === "PERSON" ? t("customers.fullName") : t("customers.legalName")} required><Input name="legalName" required minLength={2} /></Field><Field label={t("customers.displayName")}><Input name="displayName" /></Field>{partyType === "ORGANIZATION" ? <><Field label={t("customers.taxIdentifier")}><Input name="taxIdentifier" /></Field><Field label={t("customers.registrationId")}><Input name="registrationId" /></Field></> : null}</ProfessionalFormSection><ProfessionalFormSection title={t("customers.contactTitle")} description={t("customers.contactDescription")}><Field label={t("customers.primaryEmail")}><Input name="primaryEmail" type="email" /></Field><Field label={t("customers.primaryPhone")}><Input name="primaryPhone" /></Field><Field label={t("customers.address")}><Input name="addressLine1" /></Field><Field label={t("customers.addressLine2")}><Input name="addressLine2" /></Field><Field label={t("customers.city")}><Input name="city" /></Field><Field label={t("customers.stateProvince")}><Input name="stateProvince" /></Field><Field label={t("customers.postalCode")}><Input name="postalCode" /></Field><Field label={t("customers.countryCode")}><Input name="countryCode" maxLength={3} /></Field></ProfessionalFormSection>{partyType === "PERSON" ? <ProfessionalFormSection title={t("customers.relationshipTitle")} description={t("customers.relationshipDescription")}><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} helper={t("customers.relationshipHelper")} /></div></ProfessionalFormSection> : null}<ProfessionalFormSection title={t("customers.notesDuplicatesTitle")}><Field label={t("customers.notes")}><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field><label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="duplicateConfirmed" value="yes" />{t("customers.forceDuplicate")}</label>{duplicates.length ? <div className="md:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="font-black">{t("customers.duplicatesTitle")}</p>{duplicates.map((candidate) => <p key={candidate.id} className="mt-2 text-sm">{candidate.code} · {candidate.displayName || candidate.legalName} · {candidate.primaryEmail || candidate.primaryPhone || t("common.noContactValue")}</p>)}</div> : null}</ProfessionalFormSection></form>
    </Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || detail?.legalName || t("customers.detailFallbackTitle")} description={detail ? `${detail.code} · ${professionalErpEnumLabel(locale, "partyType", detail.partyType)}` : undefined} className="h-[94dvh] max-w-5xl">
      {detail ? <div className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<div className="grid gap-4 md:grid-cols-2"><DetailBlock title={t("customers.roles")} value={detail.roles.map((role) => professionalErpEnumLabel(locale, "role", role.roleCode)).join(", ") || t("common.none")} /><DetailBlock title={t("customers.status")} value={professionalErpEnumLabel(locale, "status", detail.status)} /><DetailBlock title={t("customers.email")} value={detail.primaryEmail || t("common.notProvided")} /><DetailBlock title={t("customers.phone")} value={detail.primaryPhone || t("common.notProvided")} /></div><ModuleSection title={t("customers.contacts")} count={detail.contacts.length}>{detail.contacts.length ? <BusinessList ariaLabel={t("customers.contactsAria")}>{detail.contacts.map((contact) => <BusinessListItem key={contact.id} title={contact.label || contact.contactType} description={contact.value} />)}</BusinessList> : <EmptyState compact title={t("customers.noContactTitle")} description={t("customers.noContactDescription")} />}</ModuleSection><ModuleSection title={t("customers.addresses")} count={detail.addresses.length}>{detail.addresses.length ? <BusinessList ariaLabel={t("customers.addressesAria")}>{detail.addresses.map((address) => <BusinessListItem key={address.id} title={address.line1} description={[address.city, address.countryCode].filter(Boolean).join(" · ")} />)}</BusinessList> : <EmptyState compact title={t("customers.noAddressTitle")} description={t("customers.noAddressDescription")} />}</ModuleSection><ModuleSection title={t("customers.relationshipSection")} description={t("customers.relationshipSectionDescription")}>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{professionalErpEnumLabel(locale, "identityStatus", detail.identityLink.status)}</StatusBadge> : <div className="grid gap-3"><EmptyState compact title={t("customers.noRelationshipTitle")} description={t("customers.noRelationshipDescription")} />{detail.partyType === "PERSON" && detail.primaryEmail && (collection.canWrite || collection.canManage) ? <Button disabled={busy} onClick={() => void retryIdentityInvitation(detail)}><Link2 className="h-4 w-4" />{t("customers.relationshipTitle")}</Button> : null}</div>}</ModuleSection>{collection.canWrite || collection.canManage ? <div className="flex justify-end border-t border-dtsc-border pt-3"><Button onClick={() => openEdit(detail)}>{t("customers.editRecord")}</Button></div> : null}</div> : null}
    </Dialog>

    <Dialog open={Boolean(edit)} onClose={() => { if (!busy) setEdit(null); }} title={t("customers.editDialogTitle")} className="h-[90dvh] max-w-3xl" presentation="editor" footer={<><Button variant="outline" disabled={busy} onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button type="submit" form="customer-edit-form" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button></>}>
      {edit ? <form id="customer-edit-form" onSubmit={updateParty} className="grid gap-6 p-4 sm:p-5">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title={t("customers.editableInformation")}><Field label={t("customers.displayName")}><Input name="displayName" defaultValue={edit.displayName || ""} /></Field><Field label={t("customers.primaryEmail")}><Input name="primaryEmail" type="email" defaultValue={edit.primaryEmail || ""} /></Field><Field label={t("customers.primaryPhone")}><Input name="primaryPhone" defaultValue={edit.primaryPhone || ""} /></Field><Field label={t("customers.status")}><NativeSelect name="status" defaultValue={edit.status} items={[{ id: "ACTIVE", label: professionalErpEnumLabel(locale, "status", "ACTIVE") }, { id: "INACTIVE", label: professionalErpEnumLabel(locale, "status", "INACTIVE") }]} /></Field><Field label={t("customers.notes")}><textarea name="notes" defaultValue={edit.notes || ""} rows={5} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection></form> : null}
    </Dialog>
  </ModuleWorkspace>;
}

function DetailBlock({ title, value }: { title: string; value: string }) { return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>; }
