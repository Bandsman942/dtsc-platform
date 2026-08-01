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

type IdentityLink = { id: string; status: string; requestedRelationType: string; activatedAt: string | null; expiresAt: string | null };
type SupplierContact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; isPrimary: boolean; identityLink: IdentityLink | null };
type SupplierItem = { id: string; legalName: string; displayName: string | null; supplierType: string | null; category: string | null; status: string; email: string | null; phone: string | null; country: string | null; revision: number; contacts: SupplierContact[]; identityLink: IdentityLink | null; _count: { purchases: number } };
type LegacyRecord = { id: string; title: string; description: string | null; status: string; updatedAt: string };

const supplierStatuses = ["PROSPECT", "ACTIVE", "SUSPENDED", "INACTIVE"];
const identityLabels: Record<string, string> = { INVITATION_PENDING: "Invitation en attente", REQUEST_PENDING: "Demande en attente", USER_CONSENT_REQUIRED: "Consentement requis", ORGANIZATION_APPROVAL_REQUIRED: "Approbation requise", ACTIVE: "Relation DTSC active", REFUSED: "Refusée", EXPIRED: "Expirée", REVOKED: "Révoquée", CANCELLED: "Annulée" };
function supplierStatusLabel(locale: string | null | undefined, value: string) { const fr: Record<string, string> = { PROSPECT: "Prospect", ACTIVE: "Actif", SUSPENDED: "Suspendu", INACTIVE: "Inactif" }; const en: Record<string, string> = { PROSPECT: "Prospect", ACTIVE: "Active", SUSPENDED: "Suspended", INACTIVE: "Inactive" }; return (locale === "en" ? en : fr)[value] || value; }
function identityTone(status?: string | null) { return status === "ACTIVE" ? "success" as const : ["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "") ? "danger" as const : status ? "warning" as const : "neutral" as const; }

export function EnterpriseSuppliersWorkspace({ organizationId, canManage, locale, legacyRecords = [] }: { organizationId: string; canManage: boolean; locale?: string | null; legacyRecords?: LegacyRecord[] }) {
  const en = locale === "en";
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
        if (!email) throw new Error(en ? "An exact email address is required for the private invitation." : "Une adresse e-mail exacte est nécessaire pour remettre l’invitation privée.");
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", {
          email,
          displayName: supplier.displayName || supplier.legalName,
          supplierId: supplier.id,
          relationType: "SUPPLIER_REPRESENTATIVE",
          purpose: en ? "Allow this individual supplier to access the services attached to the supplier relationship." : "Permettre à ce fournisseur personne physique d’accéder aux services attachés à sa relation fournisseur.",
        });
      }
      setCreateOpen(false); setRefreshKey((value) => value + 1); setSupplierIdentityChoice("MANUAL_ONLY"); setMessage(en ? "Supplier created." : "Fournisseur créé.");
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
        if (!email) throw new Error(en ? "An exact email address is required for the private invitation." : "Une adresse e-mail exacte est nécessaire pour remettre l’invitation privée.");
        await enterpriseV2Mutation(`/api/enterprise/${organizationId}/identity-link-invitations`, "POST", {
          email,
          displayName: contact.name,
          supplierContactId: contact.id,
          relationType: "SUPPLIER_REPRESENTATIVE",
          purpose: en ? "Allow this supplier contact to access the services explicitly attached to this relationship." : "Permettre à cet interlocuteur fournisseur d’accéder aux services explicitement attachés à cette relation.",
        });
      }
      setContactTarget(null); setRefreshKey((value) => value + 1); setContactIdentityChoice("MANUAL_ONLY"); setMessage(en ? "Contact added." : "Contact ajouté.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); }
  }

  async function action(item: SupplierItem, actionName: string) { const reason = actionName === "SUSPEND" ? (window.prompt(en ? "Suspension reason" : "Motif de suspension") || "") : ""; if (actionName === "SUSPEND" && !reason) return; try { await enterpriseV2Mutation(`/api/enterprise/${organizationId}/suppliers/${item.id}/actions`, "POST", { action: actionName, revision: item.revision, reason }); setRefreshKey((value) => value + 1); setMessage(en ? "Supplier updated." : "Fournisseur mis à jour."); } catch (error) { setMessage(error instanceof Error ? error.message : "ACTION_FAILED"); } }
  const actionsFor = (item: SupplierItem): BusinessContextAction[] => [{ id: "open", label: en ? "Open" : "Ouvrir", icon: Eye, onSelect: () => setDetail(item) }, ...(canManage ? [{ id: "contact", label: en ? "Add contact" : "Ajouter contact", icon: UserPlus, onSelect: () => setContactTarget(item) }, ...(item.status === "ACTIVE" ? [{ id: "suspend", label: en ? "Suspend" : "Suspendre", icon: PauseCircle, onSelect: () => void action(item, "SUSPEND") }] : [{ id: "activate", label: en ? "Activate" : "Activer", icon: Pencil, onSelect: () => void action(item, "ACTIVATE") }]), { id: "archive", label: en ? "Archive" : "Archiver", icon: Archive, destructive: true, separatorBefore: true, onSelect: () => void action(item, "ARCHIVE") }] : [])];

  return <div className="grid min-w-0 gap-5">
    <ModuleMetrics label={en ? "Supplier indicators" : "Indicateurs fournisseurs"}><ModuleMetric label={en ? "Active" : "Actifs"} value={metrics.active || 0} /><ModuleMetric label={en ? "Suspended" : "Suspendus"} value={metrics.suspended || 0} /><ModuleMetric label={en ? "New (30 days)" : "Nouveaux (30 jours)"} value={metrics.recent || 0} /></ModuleMetrics>
    <ModuleSection title={en ? "Suppliers" : "Fournisseurs"} description={en ? "Supplier organizations and individuals remain independent from DTSC accounts." : "Les organisations fournisseurs et personnes physiques restent indépendantes des comptes DTSC."} count={`${collection.pagination.total}`} action={canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />{en ? "New supplier" : "Nouveau fournisseur"}</Button> : undefined}>
      <div className="grid gap-2 border-y border-dtsc-border py-3 md:grid-cols-3"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={en ? "Search suppliers…" : "Rechercher un fournisseur…"} /><NativeSelect value={status} onChange={setStatus} items={[{ id: "", label: en ? "All statuses" : "Tous les statuts" }, ...supplierStatuses.map((id) => ({ id, label: supplierStatusLabel(locale, id) }))]} /><Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={en ? "Country" : "Pays"} /></div>
      {collection.loading ? <p className="py-8 text-center text-sm text-dtsc-muted">{en ? "Loading…" : "Chargement…"}</p> : collection.items.length ? <BusinessList ariaLabel={en ? "Suppliers" : "Fournisseurs"}>{collection.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} status={<StatusBadge>{supplierStatusLabel(locale, item.status)}</StatusBadge>} meta={`${item.supplierType === "PERSON" ? (en ? "Individual supplier" : "Personne physique") : (en ? "Organization" : "Organisation")} · ${item.category || (en ? "Uncategorized" : "Sans catégorie")} · ${item._count.purchases} ${en ? "purchases" : "achats"}`} description={item.contacts[0] ? `${item.contacts[0].name}${item.contacts[0].title ? ` · ${item.contacts[0].title}` : ""}` : item.email || item.phone || ""} onOpen={() => setDetail(item)} openLabel={`${en ? "Open" : "Ouvrir"} ${item.legalName}`} actions={<div className="flex items-center gap-2">{item.identityLink ? <StatusBadge tone={identityTone(item.identityLink.status)}>{identityLabels[item.identityLink.status] || item.identityLink.status}</StatusBadge> : null}<ContextActions label={en ? "Supplier actions" : "Actions fournisseur"} actions={actionsFor(item)} /></div>} />)}</BusinessList> : <EmptyState compact title={en ? "No suppliers" : "Aucun fournisseur"} description={collection.error || (en ? "No supplier matches the filters." : "Aucun fournisseur ne correspond aux filtres.")} />}
      <div className="mt-3 flex justify-between border-t border-dtsc-border pt-3 text-sm text-dtsc-muted"><span>Page {collection.pagination.page}/{collection.pagination.pageCount}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>{en ? "Next" : "Suivant"}</Button></div></div>
    </ModuleSection>
    {legacyRecords.length ? <ModuleSection title={en ? "Historical suppliers" : "Fournisseurs historiques"} description={en ? "Legacy supplier records are read-only." : "Les anciens fournisseurs restent en lecture seule."}><BusinessList ariaLabel="legacy suppliers">{legacyRecords.map((item) => <BusinessListItem key={item.id} title={item.title} status={<StatusBadge>{en ? "History" : "Historique"}</StatusBadge>} description={item.description || statusLabel(locale, item.status)} />)}</BusinessList></ModuleSection> : null}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={en ? "New supplier" : "Nouveau fournisseur"} className="h-[94dvh] max-w-3xl"><form onSubmit={createSupplier} className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Supplier type" : "Type de fournisseur"}><NativeSelect value={supplierType} onChange={setSupplierType} items={[{ id: "ORGANIZATION", label: en ? "Organization" : "Organisation" }, { id: "PERSON", label: en ? "Individual" : "Personne physique" }]} /></Field><Field label={en ? "Legal name" : supplierType === "PERSON" ? "Nom complet" : "Raison sociale"}><Input name="legalName" required /></Field><Field label={en ? "Display name" : "Nom usuel"}><Input name="displayName" /></Field><Field label={en ? "Category" : "Catégorie"}><Input name="category" /></Field><Field label="Email"><Input name="email" type="email" /></Field><Field label={en ? "Phone" : "Téléphone"}><Input name="phone" /></Field><Field label={en ? "Country" : "Pays"}><Input name="country" /></Field><Field label={en ? "Status" : "Statut"}><NativeSelect name="status" defaultValue="PROSPECT" items={supplierStatuses.map((id) => ({ id, label: supplierStatusLabel(locale, id) }))} /></Field></div>
      {supplierType === "PERSON" ? <EnterpriseIdentityLinkChoice value={supplierIdentityChoice} onChange={setSupplierIdentityChoice} helper={en ? "The business record can be created without a DTSC account." : "La fiche fournisseur peut être créée sans compte DTSC."} /> : <p className="text-sm text-dtsc-muted">{en ? "The organization itself is never linked to a representative’s personal account. Add representatives as contacts below." : "L’organisation elle-même n’est jamais liée au compte personnel d’un représentant. Ajoutez ses représentants comme contacts."}</p>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit">{en ? "Create" : "Créer"}</Button></div>
    </form></Dialog>

    <Dialog open={Boolean(contactTarget)} onClose={() => setContactTarget(null)} title={en ? "Add supplier contact" : "Ajouter un interlocuteur fournisseur"} className="h-[92dvh] max-w-2xl"><form onSubmit={addContact} className="grid gap-5"><div className="grid gap-3 md:grid-cols-2"><Field label={en ? "Name" : "Nom"}><Input name="name" required /></Field><Field label={en ? "Role / title" : "Fonction"}><Input name="title" /></Field><Field label="Email"><Input name="email" type="email" /></Field><Field label={en ? "Phone" : "Téléphone"}><Input name="phone" /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPrimary" />{en ? "Primary contact" : "Contact principal"}</label></div><EnterpriseIdentityLinkChoice value={contactIdentityChoice} onChange={setContactIdentityChoice} helper={en ? "The representative’s account is linked to the contact record, never to the supplier organization itself." : "Le compte du représentant est lié à sa fiche de contact, jamais à l’organisation fournisseur elle-même."} /><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setContactTarget(null)}>{en ? "Cancel" : "Annuler"}</Button><Button type="submit">{en ? "Add" : "Ajouter"}</Button></div></form></Dialog>

    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || detail?.legalName || (en ? "Supplier" : "Fournisseur")} className="h-[92dvh] max-w-3xl">{detail ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge>{supplierStatusLabel(locale, detail.status)}</StatusBadge>{detail.identityLink ? <StatusBadge tone={identityTone(detail.identityLink.status)}>{identityLabels[detail.identityLink.status] || detail.identityLink.status}</StatusBadge> : detail.supplierType === "PERSON" ? <StatusBadge>{en ? "No DTSC relationship" : "Aucune relation DTSC"}</StatusBadge> : null}</div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">{en ? "Type" : "Type"}</dt><dd className="mt-1 text-sm">{detail.supplierType === "PERSON" ? (en ? "Individual" : "Personne physique") : (en ? "Organization" : "Organisation")}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">{en ? "Contact" : "Coordonnées"}</dt><dd className="mt-1 text-sm">{detail.email || detail.phone || "—"}</dd></div></dl><ModuleSection title={en ? "Representatives and contacts" : "Représentants et contacts"} description={en ? "Each person keeps a separate business record and optional consented account link." : "Chaque personne conserve une fiche distincte et une liaison de compte facultative avec consentement."}>{detail.contacts.length ? <BusinessList ariaLabel="supplier contacts">{detail.contacts.map((contact) => <BusinessListItem key={contact.id} title={contact.name} status={contact.identityLink ? <StatusBadge tone={identityTone(contact.identityLink.status)}>{identityLabels[contact.identityLink.status] || contact.identityLink.status}</StatusBadge> : <StatusBadge>{en ? "Not linked" : "Non lié"}</StatusBadge>} meta={contact.title || (en ? "Contact" : "Interlocuteur")} description={contact.email || contact.phone || "—"} />)}</BusinessList> : <EmptyState compact title={en ? "No contacts" : "Aucun contact"} description={en ? "Add a commercial or billing contact." : "Ajoutez un contact commercial ou de facturation."} />}</ModuleSection></div> : null}</Dialog>
  </div>;
}
