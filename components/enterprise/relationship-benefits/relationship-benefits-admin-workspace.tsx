"use client";

import { FormEvent, useMemo, useState } from "react";
import { BadgePercent, Check, CheckCircle2, Clock3, Loader2, Pause, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyToast } from "@/lib/client-toast";
import {
  ENTERPRISE_IDENTITY_RELATION_TYPES,
  getEnterpriseIdentityRelationLabel,
  type EnterpriseIdentityRelationType,
} from "@/lib/enterprise/identity-links/contracts";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { StatusBadge } from "@/components/workspace/status-badge";

type Benefit = {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  benefitType: string;
  assignmentMode: string;
  valueType: string;
  valueDecimal: number | null;
  currencyCode: string | null;
  minimumAmount: number | null;
  actionCode: string;
  actionLabelFr: string | null;
  actionLabelEn: string | null;
  targetModuleCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerPeriod: number | null;
  usagePeriodDays: number | null;
  stackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  revision: number;
  relationTypes: string[];
  assignmentCount: number;
  createdAt: string;
};

type Usage = {
  id: string;
  benefitId: string;
  identityLinkId: string;
  userId: string;
  actionCode: string;
  status: string;
  note: string | null;
  organizationNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
  cancelledAt: string | null;
  revision: number;
  relationType: string | null;
  personName: string | null;
};

type RelationshipLink = {
  id: string;
  relationType: string;
  personName: string;
  activatedAt: string | null;
};

type ConfigurationOptions = {
  transactionalAdapters: Array<{ code: string; label: string }>;
  loyaltyPrograms: Array<{ id: string; code: string; label: string; currencyCode: string }>;
  storedValueAccountTypes: Array<{ code: string; label: string }>;
};

const TRANSACTIONAL_BENEFIT_TYPES = new Set([
  "DISCOUNT",
  "FIXED_PRICE",
  "CASHBACK",
  "CREDIT",
  "LOYALTY",
]);

function tone(status: string) {
  if (status === "ACTIVE" || status === "APPROVED" || status === "CONSUMED") return "success" as const;
  if (status === "DRAFT" || status === "REQUESTED") return "warning" as const;
  if (status === "SUSPENDED" || status === "CANCELLED") return "neutral" as const;
  if (status === "REJECTED" || status === "ARCHIVED") return "danger" as const;
  return "neutral" as const;
}

function localStatus(status: string, english: boolean) {
  const fr: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Actif", SUSPENDED: "Suspendu", ARCHIVED: "Archivé", REQUESTED: "Demandé", APPROVED: "Approuvé", REJECTED: "Refusé", CONSUMED: "Utilisé", CANCELLED: "Annulé" };
  const en: Record<string, string> = { DRAFT: "Draft", ACTIVE: "Active", SUSPENDED: "Suspended", ARCHIVED: "Archived", REQUESTED: "Requested", APPROVED: "Approved", REJECTED: "Rejected", CONSUMED: "Consumed", CANCELLED: "Cancelled" };
  return (english ? en : fr)[status] || status;
}

export function RelationshipBenefitsAdminWorkspace({
  organizationId,
  locale,
  canManage,
  focusedUsageId,
  initialBenefits,
  initialUsages,
  relationshipLinks,
  configurationOptions,
}: {
  organizationId: string;
  locale?: string | null;
  canManage: boolean;
  focusedUsageId?: string;
  initialBenefits: Benefit[];
  initialUsages: Usage[];
  relationshipLinks: RelationshipLink[];
  configurationOptions: ConfigurationOptions;
}) {
  const english = locale === "en";
  const [tab, setTab] = useState<"CATALOGUE" | "REQUESTS">("CATALOGUE");
  const [benefits, setBenefits] = useState(initialBenefits);
  const [usages, setUsages] = useState(initialUsages);
  const [links, setLinks] = useState(relationshipLinks);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [benefitType, setBenefitType] = useState("DISCOUNT");
  const [options, setOptions] = useState(configurationOptions);
  const transactionalBenefit = TRANSACTIONAL_BENEFIT_TYPES.has(benefitType);

  const benefitById = useMemo(() => new Map(benefits.map((item) => [item.id, item])), [benefits]);
  const pendingCount = usages.filter((item) => ["REQUESTED", "APPROVED"].includes(item.status)).length;

  async function refresh() {
    const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || (english ? "Refresh failed." : "Actualisation impossible."));
    setBenefits(body.benefits || []);
    setUsages(body.usages || []);
    setLinks(body.links || []);
    if (body.configurationOptions) setOptions(body.configurationOptions);
  }

  async function createBenefit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const relationTypes = ENTERPRISE_IDENTITY_RELATION_TYPES.filter((relationType) => data.getAll("relationTypes").includes(relationType));
    const identityLinkIds = data.getAll("identityLinkIds").map(String);
    const selectedBenefitType = String(data.get("benefitType") || "OTHER");
    const transactional = TRANSACTIONAL_BENEFIT_TYPES.has(selectedBenefitType);
    const conditions: Record<string, unknown> = {};
    if (selectedBenefitType === "LOYALTY" && data.get("retailLoyaltyProgramId")) {
      conditions.retailLoyaltyProgramId = String(data.get("retailLoyaltyProgramId"));
    }
    if (["CASHBACK", "CREDIT"].includes(selectedBenefitType) && data.get("retailStoredValueAccountType")) {
      conditions.retailStoredValueAccountType = String(data.get("retailStoredValueAccountType"));
    }
    setBusy("create");
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: String(data.get("code") || "").trim().toUpperCase(),
          nameFr: String(data.get("nameFr") || "").trim(),
          nameEn: String(data.get("nameEn") || "").trim(),
          descriptionFr: String(data.get("descriptionFr") || "").trim(),
          descriptionEn: String(data.get("descriptionEn") || "").trim(),
          benefitType: selectedBenefitType,
          assignmentMode: String(data.get("assignmentMode") || "AUTOMATIC"),
          relationTypes,
          identityLinkIds,
          valueType: String(data.get("valueType") || "NONE"),
          valueDecimal: data.get("valueDecimal") ? Number(data.get("valueDecimal")) : null,
          currencyCode: String(data.get("currencyCode") || "").trim().toUpperCase() || null,
          minimumAmount: data.get("minimumAmount") ? Number(data.get("minimumAmount")) : null,
          actionCode: transactional ? "NONE" : String(data.get("actionCode") || "NONE"),
          actionLabelFr: transactional ? null : String(data.get("actionLabelFr") || "").trim() || null,
          actionLabelEn: transactional ? null : String(data.get("actionLabelEn") || "").trim() || null,
          targetModuleCode: transactional ? String(data.get("targetModuleCode") || "").trim() || null : null,
          usageLimitTotal: data.get("usageLimitTotal") ? Number(data.get("usageLimitTotal")) : null,
          usageLimitPerPeriod: data.get("usageLimitPerPeriod") ? Number(data.get("usageLimitPerPeriod")) : null,
          usagePeriodDays: data.get("usagePeriodDays") ? Number(data.get("usagePeriodDays")) : null,
          stackable: data.get("stackable") === "on",
          startsAt: data.get("startsAt") ? new Date(String(data.get("startsAt"))).toISOString() : null,
          endsAt: data.get("endsAt") ? new Date(String(data.get("endsAt"))).toISOString() : null,
          status: String(data.get("status") || "DRAFT"),
          conditions: Object.keys(conditions).length ? conditions : null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || (english ? "Benefit could not be saved." : "L’avantage n’a pas pu être enregistré."));
      await refresh();
      form.reset();
      setBenefitType("DISCOUNT");
      setEditorOpen(false);
      notifyToast(body?.message || (english ? "Benefit saved." : "Avantage enregistré."), "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : (english ? "Benefit could not be saved." : "L’avantage n’a pas pu être enregistré."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function changeBenefitStatus(benefit: Benefit, status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    setBusy(`benefit:${benefit.id}`);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits/${benefit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: benefit.revision, status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || (english ? "Status could not be updated." : "Le statut n’a pas pu être mis à jour."));
      await refresh();
      notifyToast(body?.message || (english ? "Benefit updated." : "Avantage mis à jour."), "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : (english ? "Status could not be updated." : "Le statut n’a pas pu être mis à jour."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function decideUsage(usage: Usage, status: "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED") {
    setBusy(`usage:${usage.id}`);
    try {
      const response = await fetch(`/api/enterprise/${organizationId}/relationship-benefits/usages/${usage.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: usage.revision, status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || (english ? "Request could not be updated." : "La demande n’a pas pu être mise à jour."));
      await refresh();
      notifyToast(body?.message || (english ? "Request updated." : "Demande mise à jour."), "success");
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : (english ? "Request could not be updated." : "La demande n’a pas pu être mise à jour."), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={english ? "Administration · Customer relationships" : "Administration · Relations clients"}
        title={english ? "Relationships & benefits" : "Relations & avantages"}
        description={english ? "Create benefits, choose eligible relationships and process member requests without granting tenant access." : "Créez les avantages, choisissez les relations éligibles et traitez les demandes des membres sans leur donner accès au tenant."}
        count={english ? `${benefits.length} benefits` : `${benefits.length} avantage${benefits.length > 1 ? "s" : ""}`}
        primaryAction={canManage ? <Button type="button" onClick={() => setEditorOpen(true)}><Plus className="mr-2 h-4 w-4" />{english ? "New benefit" : "Nouvel avantage"}</Button> : null}
      />
      <ModuleMetrics label={english ? "Relationship benefit indicators" : "Indicateurs des avantages relationnels"}>
        <ModuleMetric label={english ? "Active" : "Actifs"} value={benefits.filter((item) => item.status === "ACTIVE").length} />
        <ModuleMetric label={english ? "Drafts" : "Brouillons"} value={benefits.filter((item) => item.status === "DRAFT").length} />
        <ModuleMetric label={english ? "Pending requests" : "Demandes en cours"} value={pendingCount} />
        <ModuleMetric label={english ? "Active relationships" : "Relations actives"} value={links.length} />
      </ModuleMetrics>
      <ModuleToolbar
        controls={<ProfessionalTabs value={tab} onChange={(value) => setTab(value as "CATALOGUE" | "REQUESTS")} items={[
          { id: "CATALOGUE", label: english ? "Catalogue" : "Catalogue", count: benefits.length },
          { id: "REQUESTS", label: english ? "Requests" : "Demandes", count: pendingCount },
        ]} label={english ? "Relationship benefits views" : "Vues des avantages relationnels"} />}
        summary={english ? "The server remains the authority for eligibility and usage limits." : "Le serveur reste l’autorité pour l’éligibilité et les limites d’utilisation."}
      />
      <ModuleContent>
        {tab === "CATALOGUE" ? (
          <ModuleSection title={english ? "Benefit catalogue" : "Catalogue des avantages"} description={english ? "Published benefits are resolved only for eligible active relationships." : "Les avantages publiés ne sont résolus que pour les relations actives éligibles."}>
            {benefits.length ? (
              <BusinessList ariaLabel={english ? "Benefit catalogue" : "Catalogue des avantages"}>
                {benefits.map((benefit) => (
                  <BusinessListItem
                    key={benefit.id}
                    title={english ? benefit.nameEn : benefit.nameFr}
                    leading={<BadgePercent className="h-5 w-5 text-cyan-600" />}
                    status={<StatusBadge tone={tone(benefit.status)}>{localStatus(benefit.status, english)}</StatusBadge>}
                    meta={`${benefit.code} · ${benefit.relationTypes.length ? benefit.relationTypes.map((item) => getEnterpriseIdentityRelationLabel(item as EnterpriseIdentityRelationType, locale)).join(", ") : (english ? "All active relationship types" : "Tous les types de relation active")}`}
                    description={english ? benefit.descriptionEn : benefit.descriptionFr}
                    actions={canManage ? (
                      <div data-no-group-swipe data-responsive-actions className="flex flex-wrap gap-2">
                        {benefit.status !== "ACTIVE" && benefit.status !== "ARCHIVED" ? <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); void changeBenefitStatus(benefit, "ACTIVE"); }} disabled={busy !== null}><Check className="mr-1 h-4 w-4" />{english ? "Publish" : "Publier"}</Button> : null}
                        {benefit.status === "ACTIVE" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void changeBenefitStatus(benefit, "SUSPENDED"); }} disabled={busy !== null}><Pause className="mr-1 h-4 w-4" />{english ? "Suspend" : "Suspendre"}</Button> : null}
                        {benefit.status !== "ARCHIVED" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void changeBenefitStatus(benefit, "ARCHIVED"); }} disabled={busy !== null}>{english ? "Archive" : "Archiver"}</Button> : null}
                      </div>
                    ) : null}
                  />
                ))}
              </BusinessList>
            ) : (
              <div className="rounded-xl border border-dashed border-dtsc-border p-8 text-center text-sm text-dtsc-muted">{english ? "No benefit has been created yet." : "Aucun avantage n’a encore été créé."}</div>
            )}
          </ModuleSection>
        ) : null}

        {tab === "REQUESTS" ? (
          <ModuleSection title={english ? "Member requests" : "Demandes des membres"} description={english ? "Approve, reject or mark a request benefit as fulfilled. Transactional benefits are applied by their business module instead." : "Approuvez, refusez ou marquez comme fourni un avantage sur demande. Les avantages transactionnels sont appliqués par leur module métier."}>
            {usages.length ? (
              <BusinessList ariaLabel={english ? "Benefit requests" : "Demandes d’avantages"}>
                {usages.map((usage) => {
                  const benefit = benefitById.get(usage.benefitId);
                  const focused = focusedUsageId === usage.id;
                  return (
                    <div key={usage.id} className={focused ? "rounded-xl bg-cyan-500/10 p-1" : undefined}>
                      <BusinessListItem
                        title={usage.personName || (english ? "Linked member" : "Membre lié")}
                        leading={usage.status === "REQUESTED" ? <Clock3 className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-cyan-600" />}
                        status={<StatusBadge tone={tone(usage.status)}>{localStatus(usage.status, english)}</StatusBadge>}
                        meta={benefit ? (english ? benefit.nameEn : benefit.nameFr) : (english ? "Benefit" : "Avantage")}
                        description={usage.note || (english ? "No member note." : "Aucune note du membre.")}
                        actions={canManage ? (
                          <div data-no-group-swipe data-responsive-actions className="flex flex-wrap gap-2">
                            {usage.status === "REQUESTED" ? <>
                              <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); void decideUsage(usage, "APPROVED"); }} disabled={busy !== null}><Check className="mr-1 h-4 w-4" />{english ? "Approve" : "Approuver"}</Button>
                              <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void decideUsage(usage, "REJECTED"); }} disabled={busy !== null}><X className="mr-1 h-4 w-4" />{english ? "Reject" : "Refuser"}</Button>
                            </> : null}
                            {usage.status === "APPROVED" ? <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); void decideUsage(usage, "CONSUMED"); }} disabled={busy !== null}><CheckCircle2 className="mr-1 h-4 w-4" />{english ? "Mark fulfilled" : "Marquer fourni"}</Button> : null}
                          </div>
                        ) : null}
                      />
                    </div>
                  );
                })}
              </BusinessList>
            ) : (
              <div className="rounded-xl border border-dashed border-dtsc-border p-8 text-center text-sm text-dtsc-muted">{english ? "No benefit request yet." : "Aucune demande d’avantage pour le moment."}</div>
            )}
          </ModuleSection>
        ) : null}
      </ModuleContent>

      <Dialog
        open={editorOpen}
        onClose={() => busy ? undefined : setEditorOpen(false)}
        title={english ? "Create a relationship benefit" : "Créer un avantage relationnel"}
        description={english ? "Define the audience, validity, limits and member action." : "Définissez l’audience, la validité, les limites et l’action proposée au membre."}
        presentation="editor"
        footer={null}
      >
        <form onSubmit={createBenefit} className="grid min-w-0 gap-5 p-4 sm:p-5">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="text-sm font-black text-dtsc-ink">{english ? "Code" : "Code"}<input name="code" required placeholder="LIVRAISON_GRATUITE" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal uppercase" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Status" : "Statut"}<select name="status" defaultValue="DRAFT" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal"><option value="DRAFT">{english ? "Draft" : "Brouillon"}</option><option value="ACTIVE">{english ? "Active" : "Actif"}</option></select></label>
            <label className="text-sm font-black text-dtsc-ink">Nom FR<input name="nameFr" required className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">Name EN<input name="nameEn" required className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink sm:col-span-2">Description FR<textarea name="descriptionFr" required rows={3} className="mt-1.5 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink sm:col-span-2">Description EN<textarea name="descriptionEn" required rows={3} className="mt-1.5 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">
              {english ? "Benefit type" : "Type d’avantage"}
              <select name="benefitType" value={benefitType} onChange={(event) => setBenefitType(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal">
                <option value="DISCOUNT">{english ? "Discount" : "Remise"}</option>
                <option value="FIXED_PRICE">{english ? "Fixed price" : "Prix fixe"}</option>
                <option value="CASHBACK">Cashback</option>
                <option value="CREDIT">{english ? "Store credit" : "Avoir client"}</option>
                <option value="LOYALTY">{english ? "Loyalty points" : "Points de fidélité"}</option>
                <option value="FREE_SERVICE">{english ? "Free service" : "Service offert"}</option>
                <option value="DELIVERY">{english ? "Delivery" : "Livraison"}</option>
                <option value="PRIORITY">{english ? "Priority" : "Priorité"}</option>
                <option value="ACCESS">{english ? "Exclusive access" : "Accès exclusif"}</option>
                <option value="SUPPORT">Support</option>
                <option value="BOOKING">{english ? "Booking request" : "Demande de réservation"}</option>
                <option value="DOCUMENT">{english ? "Document request" : "Demande de document"}</option>
                <option value="EVENT">{english ? "Event access request" : "Demande d’accès événement"}</option>
                <option value="REFERRAL">{english ? "Referral" : "Parrainage"}</option>
                <option value="OTHER">{english ? "Other request benefit" : "Autre avantage sur demande"}</option>
              </select>
            </label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Targeting" : "Attribution"}<select name="assignmentMode" defaultValue="AUTOMATIC" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal"><option value="AUTOMATIC">{english ? "Automatic by relationship" : "Automatique par relation"}</option><option value="MANUAL">{english ? "Manual" : "Manuelle"}</option><option value="HYBRID">{english ? "Hybrid" : "Hybride"}</option></select></label>
          </div>

          <fieldset className="min-w-0 rounded-xl border border-dtsc-border p-4">
            <legend className="px-2 text-sm font-black text-dtsc-ink">{english ? "Eligible relationship types" : "Types de relation éligibles"}</legend>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ENTERPRISE_IDENTITY_RELATION_TYPES.map((relationType) => <label key={relationType} className="flex min-w-0 items-center gap-2 text-sm text-dtsc-ink"><input type="checkbox" name="relationTypes" value={relationType} /> <span className="break-words">{getEnterpriseIdentityRelationLabel(relationType, locale)}</span></label>)}
            </div>
            <p className="mt-3 text-xs leading-5 text-dtsc-muted">{english ? "Leave empty to target every active relationship when using automatic mode." : "Laissez vide pour cibler toutes les relations actives en mode automatique."}</p>
          </fieldset>

          <fieldset className="min-w-0 rounded-xl border border-dtsc-border p-4">
            <legend className="px-2 text-sm font-black text-dtsc-ink">{english ? "Manual assignments" : "Attributions manuelles"}</legend>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {links.map((link) => <label key={link.id} className="flex min-w-0 items-center gap-2 text-sm text-dtsc-ink"><input type="checkbox" name="identityLinkIds" value={link.id} /> <span className="break-words">{link.personName} · {getEnterpriseIdentityRelationLabel(link.relationType as EnterpriseIdentityRelationType, locale)}</span></label>)}
              {!links.length ? <p className="text-sm text-dtsc-muted">{english ? "No active relationship is available." : "Aucune relation active n’est disponible."}</p> : null}
            </div>
          </fieldset>

          {transactionalBenefit ? (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4">
              <p className="text-sm font-black text-dtsc-ink">
                {english ? "Automatic server application" : "Application automatique serveur"}
              </p>
              <p className="mt-1 text-xs leading-5 text-dtsc-muted">
                {english
                  ? "This benefit is evaluated again by the business transaction. It cannot be manually marked as consumed."
                  : "Cet avantage est réévalué dans la transaction métier. Il ne peut pas être marqué manuellement comme consommé."}
              </p>
            </div>
          ) : null}

          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-black text-dtsc-ink">{english ? "Value type" : "Type de valeur"}<select name="valueType" defaultValue="NONE" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal"><option value="NONE">{english ? "No numeric value" : "Sans valeur numérique"}</option><option value="PERCENT">{english ? "Percentage" : "Pourcentage"}</option><option value="AMOUNT">{english ? "Amount" : "Montant"}</option><option value="POINTS">Points</option></select></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Value" : "Valeur"}<input name="valueDecimal" type="number" min="0" step="0.01" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Currency" : "Devise"}<Input name="currencyCode" placeholder={english ? "Select currency" : "Sélectionner une devise"} className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Minimum operation amount" : "Montant minimum de l’opération"}<input name="minimumAmount" type="number" min="0" step="0.01" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            {transactionalBenefit ? (
              <label className="text-sm font-black text-dtsc-ink">
                {english ? "Business adapter" : "Adaptateur métier"}
                <select name="targetModuleCode" required className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal">
                  <option value="">{english ? "Select an active adapter" : "Choisir un adaptateur actif"}</option>
                  {options.transactionalAdapters.map((adapter) => <option key={adapter.code} value={adapter.code}>{adapter.label}</option>)}
                </select>
                {!options.transactionalAdapters.length ? <span className="mt-1 block text-xs font-normal text-amber-700 dark:text-amber-300">{english ? "No transactional adapter is available in the current plan." : "Aucun adaptateur transactionnel n’est disponible dans le plan actuel."}</span> : null}
              </label>
            ) : null}
            {benefitType === "LOYALTY" ? (
              <label className="text-sm font-black text-dtsc-ink">
                {english ? "Loyalty program" : "Programme de fidélité"}
                <select name="retailLoyaltyProgramId" required className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal">
                  <option value="">{english ? "Select a program" : "Choisir un programme"}</option>
                  {options.loyaltyPrograms.map((program) => <option key={program.id} value={program.id}>{program.label} · {program.currencyCode}</option>)}
                </select>
              </label>
            ) : null}
            {["CASHBACK", "CREDIT"].includes(benefitType) ? (
              <label className="text-sm font-black text-dtsc-ink">
                {english ? "Credit ledger" : "Ledger de l’avoir"}
                <select name="retailStoredValueAccountType" required defaultValue="STORE_CREDIT" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal">
                  {options.storedValueAccountTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
            ) : null}
            {!transactionalBenefit ? <>
              <label className="text-sm font-black text-dtsc-ink">{english ? "Member action" : "Action membre"}<select name="actionCode" defaultValue="REQUEST" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal"><option value="NONE">{english ? "Informational only" : "Information uniquement"}</option><option value="REQUEST">{english ? "Request" : "Demander"}</option><option value="CLAIM">{english ? "Request use" : "Demander l’utilisation"}</option><option value="BOOK">{english ? "Request booking" : "Demander une réservation"}</option><option value="CONTACT">{english ? "Contact company" : "Contacter l’entreprise"}</option></select></label>
              <label className="text-sm font-black text-dtsc-ink">{english ? "French action label" : "Libellé action FR"}<input name="actionLabelFr" placeholder="Demander une livraison" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
              <label className="text-sm font-black text-dtsc-ink">{english ? "English action label" : "Libellé action EN"}<input name="actionLabelEn" placeholder="Request delivery" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            </> : null}
            <label className="text-sm font-black text-dtsc-ink">{english ? "Total limit per relationship" : "Limite totale par relation"}<input name="usageLimitTotal" type="number" min="1" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Period limit per relationship" : "Limite par période et relation"}<input name="usageLimitPerPeriod" type="number" min="1" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Period (days)" : "Période (jours)"}<input name="usagePeriodDays" type="number" min="1" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Starts at" : "Début"}<input name="startsAt" type="datetime-local" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="text-sm font-black text-dtsc-ink">{english ? "Ends at" : "Fin"}<input name="endsAt" type="datetime-local" className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 font-normal" /></label>
            <label className="flex min-h-11 items-center gap-2 self-end text-sm font-black text-dtsc-ink"><input type="checkbox" name="stackable" /> {english ? "Can be combined with other benefits" : "Cumulable avec d’autres avantages"}</label>
          </div>

          <div data-responsive-actions className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-dtsc-border bg-dtsc-surface px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={busy !== null}>{english ? "Cancel" : "Annuler"}</Button>
            <Button type="submit" disabled={busy !== null}>{busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{english ? "Save benefit" : "Enregistrer l’avantage"}</Button>
          </div>
        </form>
      </Dialog>
    </ModuleWorkspace>
  );
}
