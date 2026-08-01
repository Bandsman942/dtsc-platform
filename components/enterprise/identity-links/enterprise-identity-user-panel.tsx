"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Clock3, History, Send, ShieldCheck } from "lucide-react";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleMetrics, ModuleMetric, ModuleSection, ModuleToolbar, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { ProfessionalTabs } from "@/components/enterprise/professional/professional-erp-ui";
import { StatusBadge, type StatusBadgeTone } from "@/components/workspace/status-badge";
import {
  ENTERPRISE_IDENTITY_RELATION_TYPES,
  getEnterpriseIdentityRelationLabel,
  getEnterpriseIdentityStatusLabel,
  type EnterpriseIdentityLinkStatus,
  type EnterpriseIdentityRelationType,
} from "@/lib/enterprise/identity-links/contracts";

type UserIdentityLink = {
  id: string;
  organizationId: string;
  origin: string;
  requestedRelationType: string;
  requestedRoleCode: string | null;
  status: string;
  purpose: string;
  revision: number;
  createdAt: string;
  expiresAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  cancelledAt: string | null;
  organization: { id: string; name: string; logoUrl: string | null } | null;
  person: { id: string; displayName: string } | null;
};

type InvitationPreview = {
  id: string;
  requestedRelationType: string;
  requestedRoleCode: string | null;
  status: string;
  purpose: string;
  consentTextVersion: string;
  expiresAt: string | null;
  expired: boolean;
  organization: { id: string; name: string; logoUrl: string | null };
  person: { id: string; displayName: string };
};

type RelationshipView = "ACTION" | "ACTIVE" | "REQUESTS" | "HISTORY";

const USER_ACTION_STATUSES = new Set(["INVITATION_PENDING", "USER_CONSENT_REQUIRED"]);
const USER_REQUEST_STATUSES = new Set(["REQUEST_PENDING", "ORGANIZATION_APPROVAL_REQUIRED"]);
const HISTORY_STATUSES = new Set(["REFUSED", "EXPIRED", "REVOKED", "CANCELLED"]);

function statusTone(status: string): StatusBadgeTone {
  if (status === "ACTIVE") return "success";
  if (["INVITATION_PENDING", "USER_CONSENT_REQUIRED", "ORGANIZATION_APPROVAL_REQUIRED", "REQUEST_PENDING"].includes(status)) return "warning";
  if (["REFUSED", "REVOKED", "EXPIRED", "CANCELLED"].includes(status)) return "danger";
  return "neutral";
}

function readableDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

function initialRelationshipView(value?: string) {
  const normalized = value?.trim().toUpperCase();
  return (["ACTION", "ACTIVE", "REQUESTS", "HISTORY"] as RelationshipView[]).includes(normalized as RelationshipView)
    ? normalized as RelationshipView
    : "ACTION";
}

export function EnterpriseIdentityUserPanel({
  initialLinks,
  invitation,
  token,
  focusedLinkId,
  initialView,
}: {
  initialLinks: UserIdentityLink[];
  invitation: InvitationPreview | null;
  token?: string;
  focusedLinkId?: string;
  initialView?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<RelationshipView>(token ? "ACTION" : initialRelationshipView(initialView));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const actionable = useMemo(() => initialLinks.filter((link) => USER_ACTION_STATUSES.has(link.status)), [initialLinks]);
  const active = useMemo(() => initialLinks.filter((link) => link.status === "ACTIVE"), [initialLinks]);
  const requests = useMemo(() => initialLinks.filter((link) => link.origin === "USER" && USER_REQUEST_STATUSES.has(link.status)), [initialLinks]);
  const history = useMemo(() => initialLinks.filter((link) => HISTORY_STATUSES.has(link.status)), [initialLinks]);

  useEffect(() => {
    if (!focusedLinkId) return;
    const target = document.getElementById(`company-relationship-${focusedLinkId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedLinkId, view]);

  async function submitDecision(payload: Record<string, unknown>, busyKey: string) {
    setBusyId(busyKey);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/identity-links/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "L’action n’a pas pu être terminée.");
      router.replace("/enterprise-links?view=active");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "L’action n’a pas pu être terminée.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRequest(link: UserIdentityLink) {
    setBusyId(`cancel:${link.id}`);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/identity-links/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkId: link.id, revision: link.revision }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "La demande n’a pas pu être annulée.");
      setSuccess("La demande a été annulée sans supprimer son historique.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "La demande n’a pas pu être annulée.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitUserRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyId("request");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/account/identity-link-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationCode: String(form.get("organizationCode") || "").trim().toLowerCase(),
          relationType: String(form.get("relationType") || ""),
          roleCode: String(form.get("roleCode") || "").trim() || undefined,
          purpose: String(form.get("purpose") || "").trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "La demande n’a pas pu être envoyée.");
      event.currentTarget.reset();
      setSuccess(data?.message || "Votre demande a été envoyée à l’entreprise.");
      setView("REQUESTS");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "La demande n’a pas pu être envoyée.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs = [
    { id: "ACTION", label: "À traiter", count: actionable.length + (invitation && token ? 1 : 0) },
    { id: "ACTIVE", label: "Relations actives", count: active.length },
    { id: "REQUESTS", label: "Mes demandes", count: requests.length },
    { id: "HISTORY", label: "Historique", count: history.length },
  ];

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Vie privée, consentements et accès dérivés"
        title="Relations avec les entreprises"
        description="Traitez les invitations reçues, suivez vos demandes et contrôlez les relations actives de votre compte DTSC, même sans entreprise active."
        count={`${initialLinks.length} relation${initialLinks.length > 1 ? "s" : ""}`}
      />

      <ModuleMetrics label="Indicateurs des relations avec les entreprises">
        <ModuleMetric label="Décisions attendues" value={actionable.length + (invitation && token ? 1 : 0)} />
        <ModuleMetric label="Relations actives" value={active.length} />
        <ModuleMetric label="Demandes en cours" value={requests.length} />
        <ModuleMetric label="Éléments historiques" value={history.length} />
      </ModuleMetrics>

      <ModuleToolbar
        controls={<ProfessionalTabs value={view} onChange={(value) => setView(value as RelationshipView)} items={tabs} label="Vues des relations avec les entreprises" />}
        summary="Les avantages ne sont accordés que par le résolveur serveur."
      />

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">{error}</div> : null}
      {success ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{success}</div> : null}

      <ModuleContent>
        {view === "ACTION" ? (
          <ModuleSection title="À traiter" description="Ce badge ne compte que les décisions réellement attendues de votre part.">
            {invitation && token ? (
              <article id={`company-relationship-${invitation.id}`} className="min-w-0 rounded-2xl border border-cyan-400/40 bg-cyan-400/5 p-4 sm:p-5">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-black text-dtsc-ink">{invitation.organization.name}</h3>
                    <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">souhaite relier votre compte à la fiche « {invitation.person.displayName} » comme {getEnterpriseIdentityRelationLabel(invitation.requestedRelationType as EnterpriseIdentityRelationType, "fr").toLocaleLowerCase("fr")}.</p>
                  </div>
                  <StatusBadge tone={invitation.expired ? "danger" : "warning"}>{invitation.expired ? "Invitation expirée" : "Votre décision est requise"}</StatusBadge>
                </div>
                <div className="mt-4 border-l-2 border-cyan-400 pl-4 text-sm leading-6 text-dtsc-muted">
                  <p className="font-black text-dtsc-ink">Finalité déclarée</p>
                  <p className="mt-1 break-words">{invitation.purpose}</p>
                  <p className="mt-2 text-xs">Texte de consentement : version {invitation.consentTextVersion}</p>
                </div>
                <p className="mt-4 break-words text-sm leading-6 text-dtsc-muted">En refusant, la fiche métier peut être conservée pour les besoins légitimes de l’entreprise, mais elle ne sera pas reliée à votre compte.</p>
                <div data-responsive-actions className="mt-5">
                  <button type="button" disabled={invitation.expired || busyId !== null} onClick={() => submitDecision({ action: "ACCEPT", token }, `accept:${invitation.id}`)} className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busyId === `accept:${invitation.id}` ? "Acceptation…" : "Accepter la relation"}</button>
                  <button type="button" disabled={invitation.expired || busyId !== null} onClick={() => submitDecision({ action: "REFUSE", token }, `refuse:${invitation.id}`)} className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-black text-dtsc-ink disabled:cursor-not-allowed disabled:opacity-50">{busyId === `refuse:${invitation.id}` ? "Refus…" : "Refuser"}</button>
                </div>
              </article>
            ) : actionable.length ? (
              <BusinessList ariaLabel="Relations nécessitant une action">
                {actionable.map((link) => <RelationshipListItem key={link.id} link={link} focused={focusedLinkId === link.id} descriptionSuffix="Ouvrez la notification privée reçue pour retrouver l’action sécurisée et son lien personnel." />)}
              </BusinessList>
            ) : (
              <EmptyRelationship icon={CheckCircle2} title="Aucune décision en attente" description="Vos invitations et consentements nécessitant une action apparaîtront ici." />
            )}
          </ModuleSection>
        ) : null}

        {view === "ACTIVE" ? (
          <ModuleSection title="Relations actives" description="Chaque accès reste limité à la relation, au service partagé et aux permissions explicitement résolues côté serveur.">
            {active.length ? (
              <BusinessList ariaLabel="Relations actives avec des entreprises">
                {active.map((link) => (
                  <RelationshipListItem
                    key={link.id}
                    link={link}
                    focused={focusedLinkId === link.id}
                    descriptionSuffix={`Activée le ${readableDate(link.activatedAt)} · Avantages disponibles uniquement selon les services autorisés.`}
                    actions={<button type="button" disabled={busyId !== null} onClick={() => submitDecision({ action: "REVOKE", linkId: link.id, revision: link.revision }, `revoke:${link.id}`)} className="min-h-10 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50 dark:text-red-300">{busyId === `revoke:${link.id}` ? "Retrait…" : "Retirer l’autorisation"}</button>}
                  />
                ))}
              </BusinessList>
            ) : <EmptyRelationship icon={ShieldCheck} title="Aucune relation active" description="Une relation acceptée et approuvée apparaîtra ici avec les accès qui lui sont réellement associés." />}
          </ModuleSection>
        ) : null}

        {view === "REQUESTS" ? (
          <>
            <ModuleSection title="Mes demandes" description="Suivez les demandes initiées depuis votre compte et annulez celles qui n’ont pas encore été décidées.">
              {requests.length ? (
                <BusinessList ariaLabel="Demandes de relation initiées par l’utilisateur">
                  {requests.map((link) => (
                    <RelationshipListItem
                      key={link.id}
                      link={link}
                      focused={focusedLinkId === link.id}
                      descriptionSuffix={`Envoyée le ${readableDate(link.createdAt)} · L’entreprise doit encore examiner la demande.`}
                      actions={<button type="button" disabled={busyId !== null} onClick={() => void cancelRequest(link)} className="min-h-10 rounded-lg border border-dtsc-border px-3 py-2 text-xs font-black text-dtsc-ink disabled:opacity-50">{busyId === `cancel:${link.id}` ? "Annulation…" : "Annuler la demande"}</button>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyRelationship icon={Clock3} title="Aucune demande en cours" description="Vos demandes en attente d’examen apparaîtront ici." />}
            </ModuleSection>
            <ModuleSection title="Demander une relation" description="Saisissez le code exact communiqué par l’entreprise. DTSC ne propose aucun annuaire public des entreprises ou utilisateurs.">
              <form onSubmit={submitUserRequest} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                <label className="min-w-0 text-sm font-black text-dtsc-ink">Code de l’entreprise<input name="organizationCode" autoComplete="off" pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*" placeholder="exemple-entreprise" className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal" required /><span className="mt-1 block text-xs font-normal leading-5 text-dtsc-muted">Demandez ce code directement à l’entreprise concernée.</span></label>
                <label className="min-w-0 text-sm font-black text-dtsc-ink">Relation demandée<select name="relationType" defaultValue="CUSTOMER" className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal">{ENTERPRISE_IDENTITY_RELATION_TYPES.map((relationType) => <option key={relationType} value={relationType}>{getEnterpriseIdentityRelationLabel(relationType, "fr")}</option>)}</select></label>
                <label className="min-w-0 text-sm font-black text-dtsc-ink">Rôle souhaité (facultatif)<input name="roleCode" placeholder="Ex. interlocuteur autorisé" className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal" /></label>
                <label className="min-w-0 text-sm font-black text-dtsc-ink lg:col-span-2">Finalité de la relation<textarea name="purpose" rows={4} placeholder="Expliquez pourquoi vous souhaitez être reconnu et quels services sont concernés." className="mt-1.5 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base font-normal" required /></label>
                <p className="break-words text-sm leading-6 text-dtsc-muted lg:col-span-2">La relation ne devient active qu’après confirmation de l’entreprise. Seules les informations minimales nécessaires à l’examen sont transmises.</p>
                <div data-responsive-actions className="lg:col-span-2"><button type="submit" disabled={busyId !== null} className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="mr-2 inline h-4 w-4" />{busyId === "request" ? "Envoi…" : "Envoyer la demande"}</button></div>
              </form>
            </ModuleSection>
          </>
        ) : null}

        {view === "HISTORY" ? (
          <ModuleSection title="Historique" description="Les refus, expirations, révocations et annulations restent traçables sans réactiver d’accès.">
            {history.length ? <BusinessList ariaLabel="Historique des relations avec les entreprises">{history.map((link) => <RelationshipListItem key={link.id} link={link} focused={focusedLinkId === link.id} descriptionSuffix={`Dernier état enregistré le ${readableDate(link.cancelledAt || link.revokedAt || link.expiresAt || link.createdAt)}.`} />)}</BusinessList> : <EmptyRelationship icon={History} title="Aucun historique" description="Les relations terminées ou refusées apparaîtront ici." />}
          </ModuleSection>
        ) : null}
      </ModuleContent>
    </ModuleWorkspace>
  );
}

function RelationshipListItem({ link, focused, descriptionSuffix, actions }: { link: UserIdentityLink; focused?: boolean; descriptionSuffix?: string; actions?: React.ReactNode }) {
  const status = link.status as EnterpriseIdentityLinkStatus;
  return (
    <div id={`company-relationship-${link.id}`} className={focused ? "rounded-xl bg-cyan-400/10 px-2" : undefined}>
      <BusinessListItem
        title={link.organization?.name || "Entreprise indisponible"}
        leading={<Building2 className="h-5 w-5 text-dtsc-blue" />}
        status={<StatusBadge tone={statusTone(link.status)}>{getEnterpriseIdentityStatusLabel(status, "fr")}</StatusBadge>}
        meta={`${getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, "fr")} · ${link.person?.displayName || "Fiche métier"}`}
        description={`${link.purpose}${descriptionSuffix ? ` · ${descriptionSuffix}` : ""}`}
        actions={actions}
      />
    </div>
  );
}

function EmptyRelationship({ icon: Icon, title, description }: { icon: typeof CheckCircle2; title: string; description: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-dtsc-border px-4 py-10 text-center"><Icon className="h-8 w-8 text-dtsc-muted" /><h3 className="mt-3 font-black text-dtsc-ink">{title}</h3><p className="mt-1 max-w-xl text-sm leading-6 text-dtsc-muted">{description}</p></div>;
}
