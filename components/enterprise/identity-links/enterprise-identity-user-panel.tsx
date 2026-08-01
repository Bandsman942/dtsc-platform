"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
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
  requestedRelationType: string;
  requestedRoleCode: string | null;
  status: string;
  purpose: string;
  revision: number;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
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

function statusTone(status: string): StatusBadgeTone {
  if (status === "ACTIVE") return "success";
  if (["INVITATION_PENDING", "USER_CONSENT_REQUIRED", "ORGANIZATION_APPROVAL_REQUIRED", "REQUEST_PENDING"].includes(status)) return "warning";
  if (["REFUSED", "REVOKED", "EXPIRED", "CANCELLED"].includes(status)) return "danger";
  return "neutral";
}

export function EnterpriseIdentityUserPanel({
  initialLinks,
  invitation,
  token,
}: {
  initialLinks: UserIdentityLink[];
  invitation: InvitationPreview | null;
  token?: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      router.replace("/enterprise-links");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "L’action n’a pas pu être terminée.");
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
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "La demande n’a pas pu être envoyée.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow="Vie privée et consentements"
        title="Relations avec les entreprises"
        description="Consultez les entreprises qui souhaitent relier votre compte DTSC à une fiche métier. Vous gardez le contrôle de votre consentement."
        count={`${initialLinks.length} relation${initialLinks.length > 1 ? "s" : ""}`}
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <ModuleContent>
        {invitation && token ? (
          <ModuleSection
            title="Invitation reçue"
            description="L’entreprise ne recevra que les informations nécessaires à cette relation. Aucune liaison ne sera activée sans votre décision."
          >
            <article className="min-w-0 rounded-2xl border border-cyan-400/40 bg-cyan-400/5 p-4 sm:p-5">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-black text-dtsc-ink">{invitation.organization.name}</h3>
                  <p className="mt-1 break-words text-sm leading-6 text-dtsc-muted">
                    souhaite relier votre compte à la fiche « {invitation.person.displayName} » comme {getEnterpriseIdentityRelationLabel(invitation.requestedRelationType as EnterpriseIdentityRelationType, "fr").toLocaleLowerCase("fr")}.
                  </p>
                </div>
                <StatusBadge tone={invitation.expired ? "danger" : "warning"}>
                  {invitation.expired ? "Invitation expirée" : "Votre décision est requise"}
                </StatusBadge>
              </div>
              <div className="mt-4 border-l-2 border-cyan-400 pl-4 text-sm leading-6 text-dtsc-muted">
                <p className="font-black text-dtsc-ink">Finalité déclarée</p>
                <p className="mt-1 break-words">{invitation.purpose}</p>
                <p className="mt-2 text-xs">Texte de consentement : version {invitation.consentTextVersion}</p>
              </div>
              <p className="mt-4 break-words text-sm leading-6 text-dtsc-muted">
                En refusant, la fiche métier créée par l’entreprise peut être conservée pour ses besoins légitimes, mais elle ne sera pas reliée à votre compte DTSC.
              </p>
              <div data-responsive-actions className="mt-5">
                <button
                  type="button"
                  disabled={invitation.expired || busyId !== null}
                  onClick={() => submitDecision({ action: "ACCEPT", token }, `accept:${invitation.id}`)}
                  className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === `accept:${invitation.id}` ? "Acceptation…" : "Accepter la relation"}
                </button>
                <button
                  type="button"
                  disabled={invitation.expired || busyId !== null}
                  onClick={() => submitDecision({ action: "REFUSE", token }, `refuse:${invitation.id}`)}
                  className="min-h-11 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-2 text-sm font-black text-dtsc-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === `refuse:${invitation.id}` ? "Refus…" : "Refuser"}
                </button>
              </div>
            </article>
          </ModuleSection>
        ) : null}

        <ModuleSection
          title="Demander une relation"
          description="Saisissez le code exact communiqué par l’entreprise. DTSC ne propose pas d’annuaire public des entreprises ou des utilisateurs."
        >
          <form onSubmit={submitUserRequest} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Code de l’entreprise
              <input
                name="organizationCode"
                autoComplete="off"
                pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*"
                placeholder="exemple-entreprise"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                required
              />
              <span className="mt-1 block text-xs font-normal leading-5 text-dtsc-muted">
                Demandez ce code directement à l’entreprise concernée.
              </span>
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Relation demandée
              <select
                name="relationType"
                defaultValue="CUSTOMER"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
              >
                {ENTERPRISE_IDENTITY_RELATION_TYPES.map((relationType) => (
                  <option key={relationType} value={relationType}>
                    {getEnterpriseIdentityRelationLabel(relationType, "fr")}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Rôle souhaité (facultatif)
              <input
                name="roleCode"
                placeholder="Ex. interlocuteur autorisé"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
              />
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink lg:col-span-2">
              Finalité de la relation
              <textarea
                name="purpose"
                rows={4}
                placeholder="Expliquez pourquoi vous souhaitez être reconnu par cette entreprise et quels services sont concernés."
                className="mt-1.5 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base font-normal"
                required
              />
            </label>
            <p className="break-words text-sm leading-6 text-dtsc-muted lg:col-span-2">
              En envoyant cette demande, vous consentez à transmettre à l’entreprise les informations minimales nécessaires à son examen. La relation ne deviendra active qu’après sa confirmation.
            </p>
            <div data-responsive-actions className="lg:col-span-2">
              <button
                type="submit"
                disabled={busyId !== null}
                className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === "request" ? "Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </form>
        </ModuleSection>

        <ModuleSection
          title="Historique de vos relations"
          description="La révocation coupe les avantages et toute synchronisation future, sans supprimer automatiquement les données métier que l’entreprise doit conserver."
          count={initialLinks.length}
        >
          {initialLinks.length ? (
            <BusinessList ariaLabel="Relations entre votre compte et des entreprises">
              {initialLinks.map((link) => {
                const status = link.status as EnterpriseIdentityLinkStatus;
                return (
                  <BusinessListItem
                    key={link.id}
                    title={link.organization?.name || "Entreprise indisponible"}
                    status={
                      <StatusBadge tone={statusTone(link.status)}>
                        {getEnterpriseIdentityStatusLabel(status, "fr")}
                      </StatusBadge>
                    }
                    meta={`${getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, "fr")} · ${new Date(link.createdAt).toLocaleDateString("fr-FR")}`}
                    description={link.purpose}
                    actions={
                      link.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => submitDecision({ action: "REVOKE", linkId: link.id, revision: link.revision }, `revoke:${link.id}`)}
                          className="min-h-10 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50 dark:text-red-300"
                        >
                          {busyId === `revoke:${link.id}` ? "Retrait…" : "Retirer l’autorisation"}
                        </button>
                      ) : null
                    }
                  />
                );
              })}
            </BusinessList>
          ) : (
            <div className="border-y border-dtsc-border py-10 text-center text-sm text-dtsc-muted">
              Aucune relation n’est actuellement associée à votre compte.
            </div>
          )}
        </ModuleSection>
      </ModuleContent>
    </ModuleWorkspace>
  );
}
