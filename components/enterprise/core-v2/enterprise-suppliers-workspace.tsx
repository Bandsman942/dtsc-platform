"use client";

import { Archive, Eye, PauseCircle, Pencil, Plus, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
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

const supplierStatuses = ["PROSPECT", "ACTIVE", "SUSPENDED", "INACTIVE"];

function identityTone(status?: string | null) {
  return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const;
}

function identityStatusLabel(locale: string | null | undefined, status: string) {
  return enterpriseCoreT(locale, `suppliers.identity.${status}` as EnterpriseCoreKey);
}

function supplierTypeLabel(locale: string | null | undefined, supplierType?: string | null) {
  return enterpriseCoreT(locale, `suppliers.type.${supplierType === "PERSON" ? "PERSON" : "ORGANIZATION"}` as EnterpriseCoreKey);
}

export function EnterpriseSuppliersWorkspace({ organizationId, canManage, locale, legacyRecords = [] }: { organizationId: string; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const t = (key: EnterpriseCoreKey, vars?: Record<string, string | number>) => enterpriseCoreT(locale, key, vars);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<SupplierItem | null>(null);
  const [contactTarget, setContactTarget] = useState<SupplierItem | null>(null);
  const [message, setMessage] = useState("");
  const [supplierType, setSupplierType] = useState("ORGANIZATION");
  const [supplierIdentityChoice, setSupplierIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [contactIdentityChoice, setContactIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  useToastMessage(message);

  const params = useMemo(() => { const value = new URLSearchParams({ page: String(page), pageSize: "20" }); if (search.trim()) value.set("search", search.trim()); if (status) value.set("status", status); if (country.trim()) value.set("country", country.trim()); return value; }, [page, search, status, country]);
  const collection = useEnterpriseV2Collection<SupplierItem>({ endpoint: `/api/enterprise/${organizationId}/suppliers`, params, refreshKey });
  const metrics = collection.meta.metrics || {};

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = { ...Object.fromEntries(form.entries()), supplierType };
      const result = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers`, "POST", payload) as { supplier?: SupplierItem };
      const supplier = result.supplier;
      const email = String(form.get("email") || "").trim();
      if (supplier && supplierType === "PERSON" && supplierIdentityChoice !== "MANUAL_ONLY" && supplierIdentityChoice !== "LINK_LATER") {
        if (!email) throw new Error(t("suppliers.invitationEmailRequired"));
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", {
          email,
          displayName: supplier.displayName || supplier.legalName,
          supplierId: supplier.id,
          relationType: "SUPPLIER_REPRESENTATIVE",
          purpose: t("suppliers.invitationPurpose.individual"),
        });
      }
      setCreateOpen(false);
      setRefreshKey((value) => value + 1);
      setSupplierIdentityChoice("MANUAL_ONLY");
      setMessage(t("suppliers.created"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contactTarget) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/${contactTarget.id}/contacts`, "POST", { ...Object.fromEntries(form.entries()), isPrimary: form.get("isPrimary") === "on" }) as { contact?: SupplierContact };
      const contact = result.contact;
      const email = String(form.get("email") || "").trim();
      if (contact && contactIdentityChoice !== "MANUAL_ONLY" && contactIdentityChoice !== "LINK_LATER") {
        if (!email) throw new Error(t("suppliers.invitationEmailRequired"));
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", {
          email,
          displayName: contact.name,
          supplierContactId: contact.id,
          relationType: "SUPPLIER_REPRESENTATIVE",
          purpose: t("suppliers.invitationPurpose.contact"),
        });
      }
      setContactTarget(null);
      setRefreshKey((value) => value + 1);
      setContactIdentityChoice("MANUAL_ONLY");
      setMessage(t("suppliers.contactAdded"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function action(item: SupplierItem, actionName: string) {
    const reason = actionName === "SUSPEND" ? (window.prompt(t("suppliers.suspensionReason")) || "") : "";
    if (actionName === "SUSPEND" && !reason) return;
    try {
      await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/${item.id}/actions`, "POST", { action: actionName, revision: item.revision, reason });
      setRefreshKey((value) => value + 1);
      setMessage(t("suppliers.updated"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  const actionsFor = (item: SupplierItem): BusinessContextAction[] => [
    { id: "open", label: t("suppliers.action.open"), icon: Eye, onSelect: () => setDetail(item) },
    ...(canManage ? [
      { id: "contact", label: t("suppliers.action.addContact"), icon: UserPlus, onSelect: () => setContactTarget(item) },
      ...(item.status === "ACTIVE"
        ? [{ id: "suspend", label: t("suppliers.action.suspend"), icon: PauseCircle, onSelect: () => void action(item, "SUSPEND") }]
        : [{ id: "activate", label: t("suppliers.action.activate"), icon: Pencil, onSelect: () => void action(item, "ACTIVATE") }]),
      { id: "archive", label: t("suppliers.action.archive"), icon: Archive, destructive: true, separatorBefore: true, onSelect: () => void action(item, "ARCHIVE") },
    ] : []),
  ];

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={t("suppliers.indicators")}><ModuleMetric label={t("suppliers.metric.active")} value={metrics.active || 0} /><ModuleMetric label={t("suppliers.metric.suspended")} value={metrics.suspended || 0} /><ModuleMetric label={t("suppliers.metric.recent")} value={metrics.recent || 0} /></ModuleMetrics>
    <ModuleSection title={t("suppliers.section.title")} description={t("suppliers.section.description")} count={`${collection.pagination.total}`} action={canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{t("suppliers.new")}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("suppliers.search")} /><NativeSelect value={status} onChange={setStatus} items={[{ id: "", label: t("suppliers.allStatuses") }, ...supplierStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))]} /><Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("suppliers.country")} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{t("common.loading")}</p> : collection.items.length ? <BusinessList ariaLabel={t("suppliers.aria")}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} status={<StatusBadge>{statusLabel(locale, item.status)}</StatusBadge>} meta={`${supplierTypeLabel(locale, item.supplierType)} · ${item.category || t("suppliers.category.uncategorized")} · ${t("suppliers.purchasesCount", { count: item._count.purchases })}`} description={item.contacts[0] ? `${item.contacts[0].name}${item.contacts[0].title ? ` · ${item.contacts[0].title}` : ""}` : item.email || item.phone || ""} onOpen={() => setDetail(item)} openLabel={t("suppliers.openNamed", { name: item.legalName })} actions={<div className="flex items-center gap-2">{item.identityLink ? <StatusBadge tone={identityTone(item.identityLink.status)}>{identityStatusLabel(locale, item.identityLink.status)}</StatusBadge> : null}<ContextActions label={t("suppliers.actions")} actions={actionsFor(item)} /></div>} />)}</BusinessList> : <EmptyState compact title={t("suppliers.noSuppliers")} description={collection.error || t("suppliers.noMatch")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>{t("common.page", { current: collection.pagination.page, total: collection.pagination.pageCount })}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("common.previous")}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={t("suppliers.historical.title")} description={t("suppliers.historical.description")}><BusinessList ariaLabel={t("suppliers.historical.aria")}>{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{t("suppliers.historyBadge")}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t("suppliers.new")} className="h-[94dvh] max-w-3xl"><form onSubmit={createSupplier} className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2"><Field label={t("suppliers.form.type")}><NativeSelect value={supplierType} onChange={setSupplierType} items={[{ id: "ORGANIZATION", label: t("suppliers.type.ORGANIZATION") }, { id: "PERSON", label: t("suppliers.type.PERSON") }]} /></Field><Field label={supplierType === "PERSON" ? t("suppliers.form.legalName.person") : t("suppliers.form.legalName.organization")}><Input name="legalName" required /></Field><Field label={t("suppliers.form.displayName")}><Input name="displayName" /></Field><Field label={t("suppliers.form.category")}><Input name="category" /></Field><Field label={t("suppliers.form.email")}><Input name="email" type="email" /></Field><Field label={t("suppliers.form.phone")}><Input name="phone" /></Field><Field label={t("suppliers.form.country")}><Input name="country" /></Field><Field label={t("suppliers.form.status")}><NativeSelect name="status" defaultValue="PROSPECT" items={supplierStatuses.map((id) => ({ id, label: statusLabel(locale, id) }))} /></Field></div>
      {supplierType === "PERSON" ? <EnterpriseIdentityLinkChoice value={supplierIdentityChoice} onChange={setSupplierIdentityChoice} helper={t("suppliers.form.individualHelper")} /> : <p className="text-sm text-dtsc-muted">{t("suppliers.form.organizationHelper")}</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("suppliers.form.cancel")}</Button><Button type="submit">{t("suppliers.form.create")}</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(contactTarget)} onClose={() => setContactTarget(null)} title={t("suppliers.contact.title")} className="h-[92dvh] max-w-2xl"><form onSubmit={addContact} className="grid gap-5"><div className="grid gap-3 md:grid-cols-2"><Field label={t("suppliers.contact.name")}><Input name="name" required /></Field><Field label={t("suppliers.contact.role")}><Input name="title" /></Field><Field label={t("suppliers.form.email")}><Input name="email" type="email" /></Field><Field label={t("suppliers.contact.phone")}><Input name="phone" /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPrimary" />{t("suppliers.contact.primary")}</label></div><EnterpriseIdentityLinkChoice value={contactIdentityChoice} onChange={setContactIdentityChoice} helper={t("suppliers.contact.helper")} /><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setContactTarget(null)}>{t("suppliers.form.cancel")}</Button><Button type="submit">{t("suppliers.contact.add")}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || detail?.legalName || t("suppliers.detail.fallbackTitle")} className="h-[92dvh] max-w-3xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{statusLabel(locale, detail.status)}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{identityStatusLabel(locale, detail.identityLink.status)}</StatusBadge> : detail.supplierType === "PERSON" ? <StatusBadge>{t("suppliers.detail.noRelationship")}</StatusBadge> : null}</div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("suppliers.detail.type")}</dt><dd className="mt-1 text-sm">{supplierTypeLabel(locale, detail.supplierType)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{t("suppliers.detail.contact")}</dt><dd className="mt-1 text-sm">{detail.email || detail.phone || "—"}</dd></div></dl><ModuleSection title={t("suppliers.detail.representatives")} description={t("suppliers.detail.representativesDescription")}>{detail.contacts.length ? <BusinessList ariaLabel={t("suppliers.detail.contactsAria")}>{detail.contacts.map((contact) => <BusinessListItem key={contact.id} title={contact.name} status={contact.identityLink ? <StatusBadge tone={identityTone(contact.identityLink.status)}>{identityStatusLabel(locale, contact.identityLink.status)}</StatusBadge> : <StatusBadge>{t("suppliers.detail.notLinked")}</StatusBadge>} meta={contact.title || t("suppliers.detail.contactFallback")} description={contact.email || contact.phone || "—"} />)}</BusinessList> : <EmptyState compact title={t("suppliers.detail.noContacts")} description={t("suppliers.detail.noContactsDescription")} />}</ModuleSection></div> : null}</Dialog>
  </div>;
}
