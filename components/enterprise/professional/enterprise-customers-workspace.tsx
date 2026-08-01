"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Eye, Link2, Plus, UserRound } from "lucide-react";
import { EnterpriseIdentityLinkChoice, type EnterpriseIdentityLinkChoiceValue } from "@/components/enterprise/identity-links/identity-link-choice";
import { Field, NativeSelect } from "@/components/enterprise/core-v2/erp-v2-ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  ProfessionalError,
  ProfessionalFormSection,
  ProfessionalHelp,
  ProfessionalLoading,
  ProfessionalSearch,
  ProfessionalTabs,
  professionalMutation,
  useProfessionalCollection,
} from "@/components/enterprise/professional/professional-erp-ui";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Contact = { id: string; contactType: string; label: string | null; value: string; isPrimary: boolean };
type Address = { id: string; addressType: string; line1: string; city: string | null; countryCode: string | null; isPrimary: boolean };
type Party = {
  id: string;
  code: string;
  partyType: "PERSON" | "ORGANIZATION";
  legalName: string;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  taxIdentifier: string | null;
  registrationId: string | null;
  status: string;
  notes: string | null;
  revision: number;
  roles: Array<{ id: string; roleCode: string }>;
  contacts: Contact[];
  addresses: Address[];
  identityLink: { id: string; status: string; requestedRelationType: string; activatedAt: string | null; expiresAt: string | null } | null;
};

type DuplicateCandidate = Pick<Party, "id" | "code" | "partyType" | "legalName" | "displayName" | "primaryEmail" | "primaryPhone" | "status">;

const ROLE_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  CUSTOMER: "Client",
  SUPPLIER: "Fournisseur",
  PARTNER: "Partenaire",
  CONTRACTOR: "Prestataire",
};

const IDENTITY_STATUS_LABELS: Record<string, string> = {
  INVITATION_PENDING: "Invitation en attente",
  REQUEST_PENDING: "Demande en attente",
  USER_CONSENT_REQUIRED: "Consentement requis",
  ORGANIZATION_APPROVAL_REQUIRED: "Approbation requise",
  ACTIVE: "Relation DTSC active",
  REFUSED: "Relation refusée",
  EXPIRED: "Invitation expirée",
  REVOKED: "Relation révoquée",
  CANCELLED: "Relation annulée",
};

function identityTone(status?: string | null) {
  if (status === "ACTIVE") return "success" as const;
  if (["INVITATION_PENDING", "REQUEST_PENDING", "USER_CONSENT_REQUIRED", "ORGANIZATION_APPROVAL_REQUIRED"].includes(status || "")) return "warning" as const;
  if (["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"].includes(status || "")) return "danger" as const;
  return "neutral" as const;
}

function roleFilter(tab: string) {
  if (["PROSPECT", "CUSTOMER", "PARTNER", "CONTRACTOR", "SUPPLIER"].includes(tab)) return tab;
  return "";
}

function relationForRoles(roles: string[]) {
  if (roles.includes("CUSTOMER")) return "CUSTOMER";
  if (roles.includes("PROSPECT")) return "PROSPECT";
  if (roles.includes("PARTNER")) return "PARTNER";
  if (roles.includes("CONTRACTOR")) return "CONTRACTOR";
  return "OTHER";
}

export function EnterpriseCustomersWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<Party | null>(null);
  const [edit, setEdit] = useState<Party | null>(null);
  const [identityChoice, setIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [partyType, setPartyType] = useState<"PERSON" | "ORGANIZATION">("PERSON");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["PROSPECT"]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [message, setMessage] = useState("");

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) value.set("search", search.trim());
    const role = roleFilter(tab);
    if (role) value.set("role", role);
    if (tab === "PERSON" || tab === "ORGANIZATION") value.set("partyType", tab);
    return value;
  }, [page, search, tab]);

  const collection = useProfessionalCollection<Party>({
    endpoint: `/api/enterprise/${organizationId}/business-parties`,
    params,
    refreshKey,
  });
  useEffect(() => {
    const partyId = searchParams.get("party");
    if (partyId) {
      const target = collection.items.find((item) => item.id === partyId);
      if (target) setDetail(target);
    }
    if (searchParams.get("action") === "create") {
      setCreateOpen(true);
    }
  }, [collection.items, searchParams]);

  function resetForm() {
    setIdentityChoice("MANUAL_ONLY");
    setPartyType("PERSON");
    setSelectedRoles(["PROSPECT"]);
    setDuplicates([]);
    setMessage("");
  }

  async function checkDuplicates(form: FormData) {
    const legalName = String(form.get("legalName") || "").trim();
    if (legalName.length < 2) return [];
    setCheckingDuplicates(true);
    try {
      const query = new URLSearchParams({ legalName });
      const email = String(form.get("primaryEmail") || "").trim();
      const phone = String(form.get("primaryPhone") || "").trim();
      if (email) query.set("primaryEmail", email);
      if (phone) query.set("primaryPhone", phone);
      const response = await fetch(`/api/enterprise/${organizationId}/business-parties/duplicates?${query.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({ items: [] }));
      const items = response.ok && Array.isArray(body.items) ? body.items as DuplicateCandidate[] : [];
      setDuplicates(items);
      return items;
    } finally {
      setCheckingDuplicates(false);
    }
  }

  async function createParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const candidates = await checkDuplicates(form);
    const duplicateConfirmed = form.get("duplicateConfirmed") === "yes";
    if (candidates.length && !duplicateConfirmed) {
      setMessage("Des fiches proches existent déjà. Comparez-les puis confirmez explicitement la création d’une nouvelle fiche.");
      return;
    }
    const primaryEmail = String(form.get("primaryEmail") || "").trim();
    const primaryPhone = String(form.get("primaryPhone") || "").trim();
    const addressLine1 = String(form.get("addressLine1") || "").trim();
    const payload = {
      partyType,
      legalName: String(form.get("legalName") || ""),
      displayName: String(form.get("displayName") || "") || null,
      taxIdentifier: String(form.get("taxIdentifier") || "") || null,
      registrationId: String(form.get("registrationId") || "") || null,
      primaryEmail: primaryEmail || null,
      primaryPhone: primaryPhone || null,
      roles: selectedRoles,
      contacts: [
        ...(primaryEmail ? [{ contactType: "EMAIL", label: "Contact principal", value: primaryEmail, isPrimary: true }] : []),
        ...(primaryPhone ? [{ contactType: "PHONE", label: "Téléphone principal", value: primaryPhone, isPrimary: !primaryEmail }] : []),
      ],
      addresses: addressLine1 ? [{
        addressType: "PRIMARY",
        label: "Adresse principale",
        line1: addressLine1,
        line2: String(form.get("addressLine2") || "") || null,
        city: String(form.get("city") || "") || null,
        stateProvince: String(form.get("stateProvince") || "") || null,
        postalCode: String(form.get("postalCode") || "") || null,
        countryCode: String(form.get("countryCode") || "") || null,
        isPrimary: true,
      }] : [],
      notes: String(form.get("notes") || "") || null,
    };
    try {
      const result = await professionalMutation(`/api/enterprise/${organizationId}/business-parties`, payload);
      const party = result.party as Party | undefined;
      if (party && identityChoice !== "MANUAL_ONLY" && identityChoice !== "LINK_LATER") {
        if (!primaryEmail) throw new Error("Une adresse e-mail exacte est nécessaire pour envoyer l’invitation privée.");
        await professionalMutation(`/api/enterprise/${organizationId}/identity-link-invitations`, {
          email: primaryEmail,
          displayName: payload.displayName || payload.legalName,
          businessPartyId: party.id,
          relationType: relationForRoles(selectedRoles),
          purpose: `Permettre à cette personne de bénéficier des services associés à sa relation avec ${organizationName}.`,
        });
      }
      setCreateOpen(false);
      resetForm();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  async function updateParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/business-parties`, {
        partyId: edit.id,
        displayName: String(form.get("displayName") || "") || null,
        primaryEmail: String(form.get("primaryEmail") || "") || null,
        primaryPhone: String(form.get("primaryPhone") || "") || null,
        notes: String(form.get("notes") || "") || null,
        status: String(form.get("status") || edit.status),
        revision: edit.revision,
      }, "PATCH");
      setEdit(null);
      setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Modification impossible.");
    }
  }

  const tabs = [
    { id: "ALL", label: "Tous", count: collection.metrics.total },
    { id: "PROSPECT", label: "Prospects", count: collection.metrics.prospects },
    { id: "CUSTOMER", label: "Clients", count: collection.metrics.customers },
    { id: "ORGANIZATION", label: "Organisations", count: collection.metrics.organizations },
    { id: "PERSON", label: "Personnes", count: collection.metrics.persons },
    { id: "PARTNER", label: "Partenaires" },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`Référentiel commercial · ${organizationName}`}
        title="Tiers, prospects et clients"
        description={definition.descriptionFr}
        count={`${collection.pagination.total} fiche${collection.pagination.total > 1 ? "s" : ""}`}
        primaryAction={collection.canManage ? <Button onClick={() => { resetForm(); setCreateOpen(true); }} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouvelle fiche</Button> : undefined}
      />

      <ModuleMetrics label="Indicateurs tiers et clients">
        <ModuleMetric label="Clients actifs" value={collection.metrics.customers || 0} />
        <ModuleMetric label="Prospects" value={collection.metrics.prospects || 0} />
        <ModuleMetric label="Organisations" value={collection.metrics.organizations || 0} />
        <ModuleMetric label="Relations DTSC en attente" value={collection.metrics.pendingIdentity || 0} />
      </ModuleMetrics>

      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nom, référence, e-mail…" />}
        controls={<ProfessionalTabs value={tab} onChange={(value) => { setTab(value); setPage(1); }} items={tabs} label="Vues du référentiel" />}
        summary={`${collection.pagination.total} résultat${collection.pagination.total > 1 ? "s" : ""}`}
      />

      <ModuleContent>
        <ModuleSection title="Référentiel 360°" description="Une même personne ou organisation peut cumuler plusieurs rôles. La fiche reste utilisable sans compte DTSC.">
          {collection.error ? <ProfessionalError message={collection.error} /> : collection.loading ? <ProfessionalLoading /> : collection.items.length ? (
            <BusinessList ariaLabel="Tiers, prospects et clients">
              {collection.items.map((item) => (
                <BusinessListItem
                  key={item.id}
                  title={item.displayName || item.legalName}
                  leading={item.partyType === "PERSON" ? <UserRound className="h-5 w-5 text-dtsc-blue" /> : <Building2 className="h-5 w-5 text-dtsc-blue" />}
                  status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : "neutral"}>{item.status === "ACTIVE" ? "Actif" : "Inactif"}</StatusBadge>}
                  meta={`${item.code} · ${item.roles.map((role) => ROLE_LABELS[role.roleCode] || role.roleCode).join(" · ") || "Sans rôle"}`}
                  description={[item.primaryEmail, item.primaryPhone, item.addresses[0]?.city].filter(Boolean).join(" · ") || "Coordonnées à compléter"}
                  onOpen={() => setDetail(item)}
                  openLabel={`Ouvrir la fiche ${item.displayName || item.legalName}`}
                  actions={item.identityLink ? <StatusBadge tone={identityTone(item.identityLink.status)}>{IDENTITY_STATUS_LABELS[item.identityLink.status] || item.identityLink.status}</StatusBadge> : <StatusBadge><Link2 className="mr-1 h-3.5 w-3.5" />Non liée</StatusBadge>}
                />
              ))}
            </BusinessList>
          ) : <EmptyState title="Aucune fiche métier" description="Commencez par créer un prospect, un client, une organisation ou une personne. La liaison à un compte DTSC reste facultative." action={collection.canManage ? <Button onClick={() => setCreateOpen(true)} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Créer la première fiche</Button> : undefined} />}
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-dtsc-muted">
            <span>Page {collection.pagination.page} sur {collection.pagination.pageCount}</span>
            <div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Précédent</Button><Button variant="outline" disabled={page >= collection.pagination.pageCount} onClick={() => setPage((value) => value + 1)}>Suivant</Button></div>
          </div>
        </ModuleSection>

        <ModuleSection title="Prise en main" description="Créez votre premier client, ajoutez ses contacts puis proposez éventuellement une liaison DTSC consentie.">
          <ProfessionalHelp moduleCode="CRM_CUSTOMERS" />
        </ModuleSection>
      </ModuleContent>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle fiche métier" description="La création manuelle reste toujours possible. La liaison DTSC est une étape séparée et consentie." className="h-[94dvh] max-w-5xl">
        <form onSubmit={createParty} className="grid gap-6">
          {message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title="Type et rôles" description="Choisissez l’objet métier avant de compléter ses coordonnées.">
            <Field label="Type de fiche"><NativeSelect value={partyType} onChange={(value) => setPartyType(value as "PERSON" | "ORGANIZATION")} items={[{ id: "PERSON", label: "Personne" }, { id: "ORGANIZATION", label: "Organisation" }]} /></Field>
            <div className="grid gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(ROLE_LABELS).map(([role, label]) => <label key={role} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" checked={selectedRoles.includes(role)} onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...new Set([...current, role])] : current.filter((item) => item !== role))} />{label}</label>)}
            </div>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Identité" description="Les références techniques sont générées automatiquement.">
            <Field label={partyType === "PERSON" ? "Nom complet" : "Raison sociale"}><Input name="legalName" required minLength={2} /></Field>
            <Field label="Nom usuel"><Input name="displayName" /></Field>
            {partyType === "ORGANIZATION" ? <><Field label="Identifiant fiscal"><Input name="taxIdentifier" /></Field><Field label="Numéro d’enregistrement"><Input name="registrationId" /></Field></> : null}
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Coordonnées" description="Seules les données utiles à la relation métier sont demandées.">
            <Field label="E-mail principal"><Input name="primaryEmail" type="email" /></Field>
            <Field label="Téléphone principal"><Input name="primaryPhone" /></Field>
            <Field label="Adresse"><Input name="addressLine1" /></Field>
            <Field label="Complément"><Input name="addressLine2" /></Field>
            <Field label="Ville"><Input name="city" /></Field>
            <Field label="Province / région"><Input name="stateProvince" /></Field>
            <Field label="Code postal"><Input name="postalCode" /></Field>
            <Field label="Pays (code)"><Input name="countryCode" maxLength={3} /></Field>
          </ProfessionalFormSection>
          {partyType === "PERSON" ? <ProfessionalFormSection title="Relation avec DTSC" description="La fiche peut être enregistrée sans compte. Aucun rapprochement automatique n’est effectué."><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} helper="L’adresse exacte est utilisée uniquement pour remettre l’invitation privée. La réponse reste neutre sur l’existence d’un compte." /></div></ProfessionalFormSection> : null}
          <ProfessionalFormSection title="Notes et contrôle des doublons">
            <Field label="Notes"><textarea name="notes" rows={4} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-bold"><input type="checkbox" name="duplicateConfirmed" value="yes" />Créer malgré les doublons présentés après comparaison</label>
            {duplicates.length ? <div className="md:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="font-black">Doublons possibles — aucune fusion automatique</p>{duplicates.map((candidate) => <p key={candidate.id} className="mt-2 text-sm">{candidate.code} · {candidate.displayName || candidate.legalName} · {candidate.primaryEmail || candidate.primaryPhone || "sans contact"}</p>)}</div> : null}
          </ProfessionalFormSection>
          <div data-responsive-actions><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit" disabled={!selectedRoles.length || checkingDuplicates} className="bg-dtsc-blue text-white">{checkingDuplicates ? "Vérification…" : "Enregistrer la fiche"}</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.displayName || detail?.legalName || "Fiche 360°"} description={detail ? `${detail.code} · ${detail.partyType === "PERSON" ? "Personne" : "Organisation"}` : undefined} className="h-[94dvh] max-w-5xl">
        {detail ? <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2"><DetailBlock title="Rôles" value={detail.roles.map((role) => ROLE_LABELS[role.roleCode] || role.roleCode).join(", ") || "Aucun"} /><DetailBlock title="Statut" value={detail.status === "ACTIVE" ? "Actif" : "Inactif"} /><DetailBlock title="E-mail" value={detail.primaryEmail || "Non renseigné"} /><DetailBlock title="Téléphone" value={detail.primaryPhone || "Non renseigné"} /></div>
          <ModuleSection title="Contacts" count={detail.contacts.length}>{detail.contacts.length ? <BusinessList ariaLabel="Contacts de la fiche">{detail.contacts.map((contact) => <BusinessListItem key={contact.id} title={contact.label || contact.contactType} meta={contact.isPrimary ? "Contact principal" : contact.contactType} description={contact.value} />)}</BusinessList> : <EmptyState compact title="Aucun contact" description="Ajoutez un contact autorisé depuis la prochaine action d’édition." />}</ModuleSection>
          <ModuleSection title="Adresses" count={detail.addresses.length}>{detail.addresses.length ? <BusinessList ariaLabel="Adresses de la fiche">{detail.addresses.map((address) => <BusinessListItem key={address.id} title={address.line1} meta={address.addressType} description={[address.city, address.countryCode].filter(Boolean).join(" · ")} />)}</BusinessList> : <EmptyState compact title="Aucune adresse" description="L’adresse peut être complétée sans affecter la relation DTSC." />}</ModuleSection>
          <ModuleSection title="Relation DTSC" description="Le compte global et la fiche métier restent deux objets distincts.">{detail.identityLink ? <div className="border-y border-dtsc-border py-4"><StatusBadge tone={identityTone(detail.identityLink.status)}>{IDENTITY_STATUS_LABELS[detail.identityLink.status] || detail.identityLink.status}</StatusBadge><p className="mt-2 text-sm text-dtsc-muted">Type : {detail.identityLink.requestedRelationType}. Les avantages ne sont accordés que lorsque la relation est active.</p></div> : <EmptyState compact title="Aucune relation DTSC" description="Cette fiche fonctionne normalement sans compte global. Une invitation pourra être proposée plus tard." />}</ModuleSection>
          <ModuleSection title="Historique et objets associés" description="Les opportunités, devis, commandes, contrats, documents et événements resteront accessibles depuis leurs modules dédiés."><div className="border-y border-dtsc-border py-4 text-sm text-dtsc-muted">Les liens profonds utilisent cette référence : <strong>{detail.code}</strong>.</div></ModuleSection>
          {collection.canManage ? <div className="sticky bottom-0 flex justify-end border-t border-dtsc-border bg-dtsc-surface py-3"><Button onClick={() => setEdit(detail)}>Modifier la fiche</Button></div> : null}
        </div> : null}
      </Dialog>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title="Modifier la fiche" className="h-[90dvh] max-w-3xl">
        {edit ? <form onSubmit={updateParty} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Informations modifiables"><Field label="Nom usuel"><Input name="displayName" defaultValue={edit.displayName || ""} /></Field><Field label="E-mail principal"><Input name="primaryEmail" type="email" defaultValue={edit.primaryEmail || ""} /></Field><Field label="Téléphone principal"><Input name="primaryPhone" defaultValue={edit.primaryPhone || ""} /></Field><Field label="Statut"><NativeSelect name="status" defaultValue={edit.status} items={[{ id: "ACTIVE", label: "Actif" }, { id: "INACTIVE", label: "Inactif" }]} /></Field><Field label="Notes"><textarea name="notes" defaultValue={edit.notes || ""} rows={5} className="w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" /></Field></ProfessionalFormSection><div data-responsive-actions><Button type="button" variant="outline" onClick={() => setEdit(null)}>Annuler</Button><Button type="submit">Enregistrer</Button></div></form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return <div className="border-y border-dtsc-border py-3"><p className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{title}</p><p className="mt-1 break-words text-sm font-bold text-dtsc-ink">{value}</p></div>;
}
