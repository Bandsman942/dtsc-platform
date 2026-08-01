"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Eye, Plus, RefreshCcw, UserRound } from "lucide-react";
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

type Party = {
  id: string;
  code: string;
  partyType: "PERSON" | "ORGANIZATION";
  legalName: string;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  roles: Array<{ roleCode: string }>;
};
type Member = { id: string; label: string; email: string; role: string; positionCode: string | null; positionTitle: string | null };
type Department = { id: string; departmentCode: string; labelFr: string; labelEn: string };
type Lookups = { members: Member[]; departments: Department[]; parties: Party[] };
type Lead = {
  id: string;
  reference: string;
  partyType: "PERSON" | "ORGANIZATION";
  legalName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  status: string;
  ownerUserId: string | null;
  expectedValue: string | number | null;
  currency: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  notes: string | null;
  businessPartyId: string | null;
  businessParty: { id: string; code: string; legalName: string; displayName: string | null; partyType: string } | null;
  revision: number;
};
type Opportunity = {
  id: string;
  reference: string;
  businessPartyId: string;
  businessParty: { id: string; code: string; legalName: string; displayName: string | null } | null;
  name: string;
  description: string | null;
  status: string;
  ownerUserId: string | null;
  estimatedValue: string | number | null;
  currency: string | null;
  probabilityPercent: number;
  expectedCloseDate: string | null;
  source: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  lostReason: string | null;
  revision: number;
  quotes: Array<{ id: string; reference: string; status: string; totalAmount: string | number; currency: string }>;
};
type ConversionPreview = { lead: Lead; candidates: Array<Pick<Party, "id" | "code" | "partyType" | "legalName" | "displayName" | "primaryEmail" | "primaryPhone">> };

const OPPORTUNITY_STAGES = ["OPEN", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "CLOSED"] as const;
const OPPORTUNITY_LABELS: Record<string, string> = {
  OPEN: "Ouverte",
  QUALIFIED: "Qualifiée",
  PROPOSAL: "Proposition",
  NEGOTIATION: "Négociation",
  WON: "Gagnée",
  LOST: "Perdue",
  CLOSED: "Clôturée",
};
const LEAD_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  QUALIFIED: "Qualifié",
  CONVERTED: "Converti",
  LOST: "Perdu",
  ARCHIVED: "Archivé",
};
const NEXT_STAGE: Record<string, string[]> = {
  OPEN: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: ["CLOSED"],
  LOST: ["CLOSED"],
};
const LEAD_NEXT: Record<string, string[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "LOST", "ARCHIVED"],
  CONTACTED: ["QUALIFIED", "LOST", "ARCHIVED"],
  QUALIFIED: ["LOST", "ARCHIVED"],
};

function money(value: Opportunity["estimatedValue"], currency?: string | null) {
  if (value === null || value === undefined || value === "") return "Montant à préciser";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(value));
}
function dateLabel(value?: string | null) {
  if (!value) return "Non planifiée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}
function tone(status: string) {
  if (["WON", "CONVERTED", "QUALIFIED"].includes(status)) return "success" as const;
  if (["LOST", "ARCHIVED"].includes(status)) return "danger" as const;
  if (["PROPOSAL", "NEGOTIATION", "CONTACTED"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export function EnterpriseCrmWorkspace({
  organizationId,
  organizationName,
  definition,
}: {
  organizationId: string;
  organizationName: string;
  definition: EnterpriseModuleDefinition;
}) {
  const [view, setView] = useState("PIPELINE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<Lookups>({ members: [], departments: [], parties: [] });
  const [lookupsError, setLookupsError] = useState("");
  const [createKind, setCreateKind] = useState<"LEAD" | "OPPORTUNITY" | null>(null);
  const searchParams = useSearchParams();
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailOpportunity, setDetailOpportunity] = useState<Opportunity | null>(null);
  const [message, setMessage] = useState("");
  const [identityChoice, setIdentityChoice] = useState<EnterpriseIdentityLinkChoiceValue>("MANUAL_ONLY");
  const [leadPartyMode, setLeadPartyMode] = useState<"NEW" | "EXISTING">("NEW");
  const [conversion, setConversion] = useState<ConversionPreview | null>(null);
  const [conversionPartyId, setConversionPartyId] = useState("");
  const [transition, setTransition] = useState<Opportunity | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/enterprise/${organizationId}/professional-lookups?module=CRM_PIPELINE`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Lookups & { message?: string; error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.message || body?.error || "Sélecteurs indisponibles.");
        if (active) setLookups(body);
      })
      .catch((error) => { if (active) setLookupsError(error instanceof Error ? error.message : "Sélecteurs indisponibles."); });
    return () => { active = false; };
  }, [organizationId, refreshKey]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search.trim()) value.set("search", search.trim());
    return value;
  }, [page, search]);
  const leadCollection = useProfessionalCollection<Lead>({ endpoint: `/api/enterprise/${organizationId}/leads`, params, refreshKey });
  const opportunityCollection = useProfessionalCollection<Opportunity>({ endpoint: `/api/enterprise/${organizationId}/opportunities`, params, refreshKey });
  useEffect(() => {
    const leadId = searchParams.get("lead");
    const opportunityId = searchParams.get("opportunity");
    if (leadId) { const target = leadCollection.items.find((item) => item.id === leadId); if (target) { setView("LEADS"); setDetailLead(target); } }
    if (opportunityId) { const target = opportunityCollection.items.find((item) => item.id === opportunityId); if (target) { setView("OPPORTUNITIES"); setDetailOpportunity(target); } }
  }, [leadCollection.items, opportunityCollection.items, searchParams]);
  const canManage = leadCollection.canManage || opportunityCollection.canManage;

  const pipelineValue = useMemo(() => opportunityCollection.items.reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0), [opportunityCollection.items]);
  const grouped = useMemo(() => Object.fromEntries(OPPORTUNITY_STAGES.map((stage) => [stage, opportunityCollection.items.filter((item) => item.status === stage)])) as Record<string, Opportunity[]>, [opportunityCollection.items]);

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      let partyId = String(form.get("businessPartyId") || "") || null;
      const legalName = String(form.get("legalName") || "").trim();
      const email = String(form.get("email") || "").trim();
      const phone = String(form.get("phone") || "").trim();
      const partyType = String(form.get("partyType") || "PERSON") as "PERSON" | "ORGANIZATION";
      if (leadPartyMode === "NEW") {
        const created = await professionalMutation(`/api/enterprise/${organizationId}/business-parties`, {
          partyType,
          legalName,
          displayName: String(form.get("displayName") || "") || null,
          primaryEmail: email || null,
          primaryPhone: phone || null,
          roles: ["PROSPECT"],
          contacts: [
            ...(email ? [{ contactType: "EMAIL", label: "Contact commercial", value: email, isPrimary: true }] : []),
            ...(phone ? [{ contactType: "PHONE", label: "Téléphone commercial", value: phone, isPrimary: !email }] : []),
          ],
          addresses: [],
          notes: String(form.get("notes") || "") || null,
        });
        const party = created.party as Party | undefined;
        partyId = party?.id || null;
        if (party && partyType === "PERSON" && identityChoice !== "MANUAL_ONLY" && identityChoice !== "LINK_LATER") {
          if (!email) throw new Error("Une adresse e-mail exacte est nécessaire pour remettre l’invitation privée.");
          await professionalMutation(`/api/enterprise/${organizationId}/identity-link-invitations`, {
            email,
            displayName: String(form.get("displayName") || "") || legalName,
            businessPartyId: party.id,
            relationType: "PROSPECT",
            purpose: `Permettre à cette personne de suivre sa relation commerciale avec ${organizationName}.`,
          });
        }
      } else {
        const selected = lookups.parties.find((party) => party.id === partyId);
        if (!selected) throw new Error("Sélectionnez une fiche métier existante.");
      }
      await professionalMutation(`/api/enterprise/${organizationId}/leads`, {
        partyType,
        legalName,
        displayName: String(form.get("displayName") || "") || null,
        email: email || null,
        phone: phone || null,
        companyName: String(form.get("companyName") || "") || null,
        source: String(form.get("source") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        departmentId: String(form.get("departmentId") || "") || null,
        businessPartyId: partyId,
        expectedValue: String(form.get("expectedValue") || "") || null,
        currency: String(form.get("currency") || "") || null,
        nextAction: String(form.get("nextAction") || "") || null,
        nextActionAt: String(form.get("nextActionAt") || "") || null,
        notes: String(form.get("notes") || "") || null,
      });
      setCreateKind(null);
      setIdentityChoice("MANUAL_ONLY");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/opportunities`, {
        businessPartyId: String(form.get("businessPartyId") || ""),
        name: String(form.get("name") || ""),
        description: String(form.get("description") || "") || null,
        ownerUserId: String(form.get("ownerUserId") || "") || null,
        departmentId: String(form.get("departmentId") || "") || null,
        estimatedValue: String(form.get("estimatedValue") || "") || null,
        currency: String(form.get("currency") || "") || null,
        probabilityPercent: String(form.get("probabilityPercent") || "0"),
        expectedCloseDate: String(form.get("expectedCloseDate") || "") || null,
        source: String(form.get("source") || "") || null,
        nextAction: String(form.get("nextAction") || "") || null,
        nextActionAt: String(form.get("nextActionAt") || "") || null,
        notes: String(form.get("notes") || "") || null,
      });
      setCreateKind(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    }
  }

  async function transitionOpportunity(item: Opportunity, targetStatus: string, extra: Record<string, unknown> = {}) {
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/opportunities/${item.id}/transition`, { targetStatus, revision: item.revision, ...extra });
      setTransition(null);
      setDetailOpportunity(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transition impossible.");
    }
  }

  async function transitionLead(item: Lead, targetStatus: string) {
    const lostReason = targetStatus === "LOST" ? window.prompt("Pourquoi ce prospect est-il perdu ?") || "" : null;
    if (targetStatus === "LOST" && !lostReason) return;
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/leads/${item.id}/transition`, { targetStatus, lostReason, revision: item.revision });
      setDetailLead(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Transition impossible.");
    }
  }

  async function openConversion(item: Lead) {
    setMessage("");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/leads/${item.id}/convert`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as ConversionPreview & { message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message || body?.error || "Prévisualisation impossible.");
      setConversion(body);
      setConversionPartyId(item.businessPartyId || body.candidates[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prévisualisation impossible.");
    }
  }

  async function convertLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversion) return;
    const form = new FormData(event.currentTarget);
    const createNewParty = form.get("partyDecision") === "NEW";
    if (!createNewParty && !conversionPartyId) {
      setMessage("Sélectionnez une fiche existante ou confirmez explicitement la création d’une nouvelle fiche.");
      return;
    }
    try {
      await professionalMutation(`/api/enterprise/${organizationId}/leads/${conversion.lead.id}/convert`, {
        businessPartyId: createNewParty ? null : conversionPartyId,
        createNewParty,
        createOpportunity: form.get("createOpportunity") === "on",
        opportunityName: String(form.get("opportunityName") || "") || null,
        estimatedValue: String(form.get("estimatedValue") || "") || null,
        currency: String(form.get("currency") || "") || null,
        expectedCloseDate: String(form.get("expectedCloseDate") || "") || null,
        revision: conversion.lead.revision,
      });
      setConversion(null);
      setDetailLead(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Conversion impossible.");
    }
  }

  const views = [
    { id: "PIPELINE", label: "Pipeline", count: opportunityCollection.pagination.total },
    { id: "OPPORTUNITIES", label: "Liste des opportunités", count: opportunityCollection.pagination.total },
    { id: "LEADS", label: "Prospects", count: leadCollection.pagination.total },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`CRM commercial · ${organizationName}`}
        title="Prospects et opportunités"
        description={definition.descriptionFr}
        count={`${opportunityCollection.pagination.total} opportunité${opportunityCollection.pagination.total > 1 ? "s" : ""}`}
        primaryAction={canManage ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCreateKind("LEAD")}><UserRound className="h-4 w-4" />Nouveau prospect</Button><Button onClick={() => setCreateKind("OPPORTUNITY")} className="bg-dtsc-blue text-white"><Plus className="h-4 w-4" />Nouvelle opportunité</Button></div> : undefined}
      />
      <ModuleMetrics label="Indicateurs CRM">
        <ModuleMetric label="Pipeline ouvert" value={opportunityCollection.metrics.open || 0} />
        <ModuleMetric label="Valeur visible" value={money(pipelineValue, opportunityCollection.items.find((item) => item.currency)?.currency)} />
        <ModuleMetric label="Propositions" value={opportunityCollection.metrics.proposal || 0} />
        <ModuleMetric label="Opportunités gagnées" value={opportunityCollection.metrics.won || 0} />
      </ModuleMetrics>
      <ModuleToolbar
        search={<ProfessionalSearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Prospect, opportunité, référence…" />}
        controls={<ProfessionalTabs value={view} onChange={(value) => { setView(value); setPage(1); }} items={views} label="Vues CRM" />}
        summary={`${leadCollection.pagination.total} prospect${leadCollection.pagination.total > 1 ? "s" : ""} · ${opportunityCollection.pagination.total} opportunité${opportunityCollection.pagination.total > 1 ? "s" : ""}`}
      />
      <ModuleContent>
        {message ? <ProfessionalError message={message} /> : null}
        {lookupsError ? <ProfessionalError message={lookupsError} /> : null}
        {view === "PIPELINE" ? (
          <ModuleSection title="Pipeline commercial" description="Le changement d’étape est contrôlé côté serveur. Chaque carte propose une alternative accessible au glisser-déposer.">
            {opportunityCollection.error ? <ProfessionalError message={opportunityCollection.error} /> : opportunityCollection.loading ? <ProfessionalLoading /> : (
              <div className="-mx-1 flex max-w-full snap-x gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
                {OPPORTUNITY_STAGES.map((stage) => {
                  const items = grouped[stage] || [];
                  const total = items.reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0);
                  return (
                    <section key={stage} aria-label={OPPORTUNITY_LABELS[stage]} className="w-[min(88vw,21rem)] shrink-0 snap-start border-t-4 border-dtsc-blue bg-dtsc-surface px-3 pb-3 pt-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3 border-b border-dtsc-border pb-3"><div><h3 className="font-black text-dtsc-ink">{OPPORTUNITY_LABELS[stage]}</h3><p className="text-xs text-dtsc-muted">{items.length} dossier{items.length > 1 ? "s" : ""}</p></div><strong className="text-xs text-dtsc-ink">{money(total, items[0]?.currency)}</strong></div>
                      <div className="mt-3 grid gap-3">
                        {items.length ? items.map((item) => (
                          <article key={item.id} className="border-y border-dtsc-border bg-dtsc-soft px-3 py-3">
                            <button type="button" onClick={() => setDetailOpportunity(item)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                              <span className="block font-black text-dtsc-ink">{item.name}</span>
                              <span className="mt-1 block text-xs text-dtsc-muted">{item.businessParty?.displayName || item.businessParty?.legalName || "Tiers à vérifier"}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-2 text-xs"><StatusBadge tone={tone(item.status)}>{item.probabilityPercent}%</StatusBadge><strong>{money(item.estimatedValue, item.currency)}</strong></span>
                              <span className="mt-2 block text-xs text-dtsc-muted">Prochaine action : {item.nextAction || "à planifier"} · {dateLabel(item.nextActionAt)}</span>
                            </button>
                            {canManage && NEXT_STAGE[item.status]?.length ? <div className="mt-3 flex flex-wrap gap-2">{NEXT_STAGE[item.status].slice(0, 3).map((next) => <Button key={next} type="button" size="sm" variant="outline" onClick={() => next === "LOST" ? setTransition(item) : void transitionOpportunity(item, next)}>{OPPORTUNITY_LABELS[next]}<ArrowRight className="h-3.5 w-3.5" /></Button>)}</div> : null}
                          </article>
                        )) : <p className="py-8 text-center text-sm text-dtsc-muted">Aucune opportunité à cette étape.</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </ModuleSection>
        ) : view === "OPPORTUNITIES" ? (
          <ModuleSection title="Liste des opportunités" description="Recherche, échéance, valeur, probabilité et prochaine action commerciale.">
            {opportunityCollection.error ? <ProfessionalError message={opportunityCollection.error} /> : opportunityCollection.loading ? <ProfessionalLoading /> : opportunityCollection.items.length ? <BusinessList ariaLabel="Opportunités commerciales">{opportunityCollection.items.map((item) => <BusinessListItem key={item.id} title={item.name} leading={<BriefcaseBusiness className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={tone(item.status)}>{OPPORTUNITY_LABELS[item.status] || item.status}</StatusBadge>} meta={`${item.reference} · ${money(item.estimatedValue, item.currency)} · ${item.probabilityPercent}%`} description={`${item.businessParty?.displayName || item.businessParty?.legalName || "Tiers à vérifier"} · Prochaine action : ${item.nextAction || "à planifier"}`} onOpen={() => setDetailOpportunity(item)} openLabel={`Ouvrir ${item.name}`} actions={<Button size="sm" variant="outline" onClick={() => setDetailOpportunity(item)}><Eye className="h-4 w-4" />Détail</Button>} />)}</BusinessList> : <EmptyState compact title="Aucune opportunité" description="Créez une opportunité ou convertissez un prospect qualifié." />}
          </ModuleSection>
        ) : (
          <ModuleSection title="Prospects" description="Chaque prospect peut être associé à une fiche métier, puis converti sans créer de doublon silencieux.">
            {leadCollection.error ? <ProfessionalError message={leadCollection.error} /> : leadCollection.loading ? <ProfessionalLoading /> : leadCollection.items.length ? <BusinessList ariaLabel="Prospects CRM">{leadCollection.items.map((item) => <BusinessListItem key={item.id} title={item.displayName || item.legalName} leading={<UserRound className="h-5 w-5 text-dtsc-blue" />} status={<StatusBadge tone={tone(item.status)}>{LEAD_LABELS[item.status] || item.status}</StatusBadge>} meta={`${item.reference} · ${item.source || "Source non renseignée"} · ${money(item.expectedValue, item.currency)}`} description={`${item.email || item.phone || "Coordonnées à compléter"} · Prochaine action : ${item.nextAction || "à planifier"}`} onOpen={() => setDetailLead(item)} openLabel={`Ouvrir ${item.legalName}`} actions={item.status === "QUALIFIED" && canManage ? <Button size="sm" onClick={() => void openConversion(item)}><RefreshCcw className="h-4 w-4" />Convertir</Button> : undefined} />)}</BusinessList> : <EmptyState compact title="Aucun prospect" description="Ajoutez le premier prospect et planifiez immédiatement une prochaine action." />}
          </ModuleSection>
        )}
        <ProfessionalHelp moduleCode="CRM_PIPELINE" />
      </ModuleContent>

      <Dialog open={createKind === "LEAD"} onClose={() => { setCreateKind(null); setMessage(""); }} title="Nouveau prospect" className="h-[94dvh] max-w-4xl">
        <form onSubmit={createLead} className="grid gap-6">
          {message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title="Fiche métier" description="Réutilisez une fiche existante ou créez un prospect. Aucun UUID n’est demandé.">
            <Field label="Mode"><NativeSelect value={leadPartyMode} onChange={(value) => setLeadPartyMode(value as "NEW" | "EXISTING")} items={[{ id: "NEW", label: "Créer une fiche prospect" }, { id: "EXISTING", label: "Réutiliser une fiche existante" }]} /></Field>
            {leadPartyMode === "EXISTING" ? <Field label="Fiche existante"><NativeSelect name="businessPartyId" required items={[{ id: "", label: "Sélectionner…" }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))]} /></Field> : null}
            <Field label="Type"><NativeSelect name="partyType" defaultValue="PERSON" items={[{ id: "PERSON", label: "Personne" }, { id: "ORGANIZATION", label: "Organisation" }]} /></Field>
            <Field label="Nom ou raison sociale"><Input name="legalName" required /></Field>
            <Field label="Nom d’usage"><Input name="displayName" /></Field>
            <Field label="Entreprise associée"><Input name="companyName" /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Coordonnées et origine">
            <Field label="E-mail"><Input name="email" type="email" /></Field><Field label="Téléphone"><Input name="phone" /></Field>
            <Field label="Source"><NativeSelect name="source" items={[{ id: "", label: "Non renseignée" }, { id: "REFERRAL", label: "Recommandation" }, { id: "WEBSITE", label: "Site web" }, { id: "SOCIAL", label: "Réseaux sociaux" }, { id: "EVENT", label: "Événement" }, { id: "OUTBOUND", label: "Prospection directe" }, { id: "OTHER", label: "Autre" }]} /></Field>
            <Field label="Responsable"><NativeSelect name="ownerUserId" items={[{ id: "", label: "Moi-même" }, ...lookups.members.map((member) => ({ id: member.id, label: `${member.label} · ${member.positionTitle || member.role}` }))]} /></Field>
            <Field label="Département"><NativeSelect name="departmentId" items={[{ id: "", label: "Aucun" }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Potentiel et prochaine action">
            <Field label="Valeur estimée"><Input name="expectedValue" type="number" min="0" step="0.01" /></Field><Field label="Devise"><Input name="currency" defaultValue="USD" maxLength={3} /></Field>
            <Field label="Prochaine action"><Input name="nextAction" placeholder="Appeler, envoyer une proposition…" /></Field><Field label="Échéance"><Input name="nextActionAt" type="datetime-local" /></Field>
            <Field label="Notes"><textarea name="notes" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
          </ProfessionalFormSection>
          {leadPartyMode === "NEW" ? <ProfessionalFormSection title="Relation DTSC" description="La fiche peut rester manuelle. Une invitation exige toujours un consentement explicite."><div className="md:col-span-2"><EnterpriseIdentityLinkChoice value={identityChoice} onChange={setIdentityChoice} /></div></ProfessionalFormSection> : null}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateKind(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Créer le prospect</Button></div>
        </form>
      </Dialog>

      <Dialog open={createKind === "OPPORTUNITY"} onClose={() => { setCreateKind(null); setMessage(""); }} title="Nouvelle opportunité" className="h-[94dvh] max-w-4xl">
        <form onSubmit={createOpportunity} className="grid gap-6">
          {message ? <ProfessionalError message={message} /> : null}
          <ProfessionalFormSection title="Contexte commercial">
            <Field label="Client ou prospect"><NativeSelect name="businessPartyId" required items={[{ id: "", label: "Sélectionner une fiche…" }, ...lookups.parties.map((party) => ({ id: party.id, label: `${party.displayName || party.legalName} · ${party.code}` }))]} /></Field>
            <Field label="Nom de l’opportunité"><Input name="name" required /></Field>
            <Field label="Source"><Input name="source" /></Field>
            <Field label="Responsable"><NativeSelect name="ownerUserId" items={[{ id: "", label: "Moi-même" }, ...lookups.members.map((member) => ({ id: member.id, label: member.label }))]} /></Field>
            <Field label="Département"><NativeSelect name="departmentId" items={[{ id: "", label: "Aucun" }, ...lookups.departments.map((department) => ({ id: department.id, label: department.labelFr }))]} /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Valeur et probabilité">
            <Field label="Valeur estimée"><Input name="estimatedValue" type="number" min="0" step="0.01" /></Field><Field label="Devise"><Input name="currency" defaultValue="USD" maxLength={3} /></Field>
            <Field label="Probabilité (%)"><Input name="probabilityPercent" type="number" min="0" max="100" defaultValue="10" /></Field><Field label="Clôture attendue"><Input name="expectedCloseDate" type="date" /></Field>
          </ProfessionalFormSection>
          <ProfessionalFormSection title="Besoin et action suivante">
            <Field label="Description"><textarea name="description" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
            <Field label="Prochaine action"><Input name="nextAction" /></Field><Field label="Échéance"><Input name="nextActionAt" type="datetime-local" /></Field>
            <Field label="Notes"><textarea name="notes" className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field>
          </ProfessionalFormSection>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setCreateKind(null)}>Annuler</Button><Button type="submit" className="bg-dtsc-blue text-white">Créer l’opportunité</Button></div>
        </form>
      </Dialog>

      <Dialog open={Boolean(detailLead)} onClose={() => setDetailLead(null)} title={detailLead?.displayName || detailLead?.legalName || "Prospect"} className="h-[92dvh] max-w-3xl">
        {detailLead ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={tone(detailLead.status)}>{LEAD_LABELS[detailLead.status] || detailLead.status}</StatusBadge><StatusBadge>{detailLead.reference}</StatusBadge>{detailLead.businessParty ? <StatusBadge tone="success">Fiche {detailLead.businessParty.code}</StatusBadge> : <StatusBadge tone="warning">Fiche à créer ou sélectionner</StatusBadge>}</div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">Coordonnées</dt><dd className="mt-1 text-sm text-dtsc-ink">{detailLead.email || detailLead.phone || "À compléter"}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Valeur</dt><dd className="mt-1 text-sm text-dtsc-ink">{money(detailLead.expectedValue, detailLead.currency)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Prochaine action</dt><dd className="mt-1 text-sm text-dtsc-ink">{detailLead.nextAction || "À planifier"} · {dateLabel(detailLead.nextActionAt)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Source</dt><dd className="mt-1 text-sm text-dtsc-ink">{detailLead.source || "Non renseignée"}</dd></div></dl>{canManage ? <div className="flex flex-wrap gap-2">{LEAD_NEXT[detailLead.status]?.map((next) => <Button key={next} variant="outline" onClick={() => void transitionLead(detailLead, next)}>{LEAD_LABELS[next]}</Button>)}{detailLead.status === "QUALIFIED" ? <Button onClick={() => void openConversion(detailLead)}><RefreshCcw className="h-4 w-4" />Convertir</Button> : null}</div> : null}</div> : null}
      </Dialog>

      <Dialog open={Boolean(detailOpportunity)} onClose={() => setDetailOpportunity(null)} title={detailOpportunity?.name || "Opportunité"} className="h-[92dvh] max-w-3xl">
        {detailOpportunity ? <div className="grid gap-5"><div className="flex flex-wrap gap-2"><StatusBadge tone={tone(detailOpportunity.status)}>{OPPORTUNITY_LABELS[detailOpportunity.status] || detailOpportunity.status}</StatusBadge><StatusBadge>{detailOpportunity.reference}</StatusBadge><StatusBadge>{detailOpportunity.probabilityPercent}%</StatusBadge></div><dl className="grid gap-3 border-y border-dtsc-border py-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-dtsc-muted">Tiers</dt><dd className="mt-1 text-sm text-dtsc-ink">{detailOpportunity.businessParty?.displayName || detailOpportunity.businessParty?.legalName}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Valeur estimée</dt><dd className="mt-1 text-sm text-dtsc-ink">{money(detailOpportunity.estimatedValue, detailOpportunity.currency)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Clôture attendue</dt><dd className="mt-1 text-sm text-dtsc-ink">{dateLabel(detailOpportunity.expectedCloseDate)}</dd></div><div><dt className="text-xs font-black uppercase text-dtsc-muted">Prochaine action</dt><dd className="mt-1 text-sm text-dtsc-ink">{detailOpportunity.nextAction || "À planifier"} · {dateLabel(detailOpportunity.nextActionAt)}</dd></div></dl>{detailOpportunity.quotes.length ? <div><h3 className="font-black text-dtsc-ink">Devis liés</h3><ul className="mt-2 divide-y divide-dtsc-border">{detailOpportunity.quotes.map((quote) => <li key={quote.id} className="flex justify-between py-2 text-sm"><span>{quote.reference}</span><span>{quote.status} · {money(quote.totalAmount, quote.currency)}</span></li>)}</ul></div> : <EmptyState compact title="Aucun devis lié" description="La conversion en devis sera proposée par le module Ventes lorsqu’il est actif." />}{canManage && NEXT_STAGE[detailOpportunity.status]?.length ? <div className="flex flex-wrap gap-2">{NEXT_STAGE[detailOpportunity.status].map((next) => <Button key={next} variant="outline" onClick={() => next === "LOST" ? setTransition(detailOpportunity) : void transitionOpportunity(detailOpportunity, next)}>{OPPORTUNITY_LABELS[next]}</Button>)}</div> : null}</div> : null}
      </Dialog>

      <Dialog open={Boolean(transition)} onClose={() => setTransition(null)} title="Déclarer l’opportunité perdue" className="max-w-xl">
        {transition ? <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void transitionOpportunity(transition, "LOST", { lostReason: String(form.get("lostReason") || ""), probabilityPercent: 0 }); }} className="grid gap-4"><Field label="Motif"><textarea name="lostReason" required className="min-h-28 w-full rounded-xl border border-dtsc-border bg-dtsc-surface p-3 text-sm" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTransition(null)}>Annuler</Button><Button type="submit">Confirmer</Button></div></form> : null}
      </Dialog>

      <Dialog open={Boolean(conversion)} onClose={() => setConversion(null)} title="Convertir le prospect" className="h-[92dvh] max-w-3xl">
        {conversion ? <form onSubmit={convertLead} className="grid gap-6">{message ? <ProfessionalError message={message} /> : null}<ProfessionalFormSection title="Décision sur la fiche métier" description="Aucune fusion automatique n’est effectuée. Comparez les fiches candidates puis choisissez explicitement."><div className="md:col-span-2 grid gap-3">{conversion.candidates.length ? conversion.candidates.map((candidate) => <label key={candidate.id} className="flex min-w-0 items-start gap-3 border-y border-dtsc-border py-3"><input type="radio" name="partyDecision" value="EXISTING" checked={conversionPartyId === candidate.id} onChange={() => setConversionPartyId(candidate.id)} /><span className="min-w-0"><strong className="block break-words text-sm text-dtsc-ink">{candidate.displayName || candidate.legalName} · {candidate.code}</strong><span className="block break-words text-xs text-dtsc-muted">{candidate.primaryEmail || candidate.primaryPhone || "Coordonnées à comparer"}</span></span></label>) : <p className="text-sm text-dtsc-muted">Aucune fiche exacte détectée.</p>}<label className="flex items-start gap-3 border-y border-dtsc-border py-3"><input type="radio" name="partyDecision" value="NEW" defaultChecked={!conversion.candidates.length} onChange={() => setConversionPartyId("")} /><span><strong className="block text-sm text-dtsc-ink">Créer une nouvelle fiche client</strong><span className="block text-xs text-dtsc-muted">Choix explicite, auditable, sans fusion silencieuse.</span></span></label></div></ProfessionalFormSection><ProfessionalFormSection title="Opportunité"><label className="md:col-span-2 flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="createOpportunity" defaultChecked />Créer une opportunité commerciale</label><Field label="Nom"><Input name="opportunityName" defaultValue={`Opportunité ${conversion.lead.displayName || conversion.lead.legalName}`} /></Field><Field label="Valeur estimée"><Input name="estimatedValue" type="number" min="0" step="0.01" defaultValue={String(conversion.lead.expectedValue || "")} /></Field><Field label="Devise"><Input name="currency" defaultValue={conversion.lead.currency || "USD"} /></Field><Field label="Clôture attendue"><Input name="expectedCloseDate" type="date" /></Field></ProfessionalFormSection><div className="sticky bottom-0 flex justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface py-3"><Button type="button" variant="outline" onClick={() => setConversion(null)}>Annuler</Button><Button type="submit">Convertir</Button></div></form> : null}
      </Dialog>
    </ModuleWorkspace>
  );
}
