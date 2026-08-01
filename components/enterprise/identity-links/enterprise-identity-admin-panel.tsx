"use client";

import { FormEvent, useMemo, useState } from "react";
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

type IdentityTarget = {
  value: string;
  kind: "businessPartyId" | "businessPartyContactId" | "employeeId";
  label: string;
  suggestedName: string;
  suggestedEmail: string;
};

type OrganizationIdentityLink = {
  id: string;
  requestedRelationType: string;
  requestedRoleCode: string | null;
  status: string;
  purpose: string;
  revision: number;
  createdAt: string;
  person: { id: string; displayName: string; status: string } | null;
  references: Array<{
    id: string;
    relationType: string;
    roleCode: string | null;
    businessPartyId: string | null;
    businessPartyContactId: string | null;
    employeeId: string | null;
  }>;
};

function statusTone(status: string): StatusBadgeTone {
  if (status === "ACTIVE") return "success";
  if (["INVITATION_PENDING", "ORGANIZATION_APPROVAL_REQUIRED", "USER_CONSENT_REQUIRED", "REQUEST_PENDING"].includes(status)) return "warning";
  if (["REFUSED", "REVOKED", "EXPIRED", "CANCELLED"].includes(status)) return "danger";
  return "neutral";
}

function targetPayload(target: IdentityTarget | undefined) {
  if (!target) return {};
  return { [target.kind]: target.value };
}

export function EnterpriseIdentityAdminPanel({
  organizationId,
  organizationName,
  links,
  targets,
}: {
  organizationId: string;
  organizationName: string;
  links: OrganizationIdentityLink[];
  targets: IdentityTarget[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.value ? `${targets[0].kind}:${targets[0].value}` : "");
  const [displayName, setDisplayName] = useState(targets[0]?.suggestedName || "");
  const [email, setEmail] = useState(targets[0]?.suggestedEmail || "");
  const [relationType, setRelationType] = useState<EnterpriseIdentityRelationType>("CUSTOMER");
  const targetByComposite = useMemo(
    () => new Map(targets.map((target) => [`${target.kind}:${target.value}`, target])),
    [targets],
  );

  function applyTarget(composite: string) {
    setSelectedTarget(composite);
    const target = targetByComposite.get(composite);
    if (target) {
      setDisplayName(target.suggestedName);
      if (target.suggestedEmail) setEmail(target.suggestedEmail);
    }
  }

  async function request(url: string, payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "L’action n’a pas pu être terminée.");
      setSuccess(data?.message || "L’action a été enregistrée.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "L’action n’a pas pu être terminée.");
    } finally {
      setBusy(null);
    }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = targetByComposite.get(selectedTarget);
    if (!target) {
      setError("Sélectionnez une fiche métier précise.");
      return;
    }
    await request(
      `/api/enterprise/${organizationId}/identity-link-invitations`,
      {
        email,
        displayName,
        relationType,
        roleCode: String(form.get("roleCode") || "") || undefined,
        purpose: String(form.get("purpose") || ""),
        ...targetPayload(target),
      },
      "invite",
    );
  }

  async function decide(link: OrganizationIdentityLink, action: "APPROVE" | "REFUSE" | "CANCEL") {
    const target = targetByComposite.get(selectedTarget);
    const payload: Record<string, unknown> = { action, revision: link.revision };
    if (action === "APPROVE") {
      if (!target) {
        setError("Sélectionnez la fiche métier à associer avant l’approbation.");
        return;
      }
      Object.assign(payload, targetPayload(target), {
        displayName: link.person?.displayName || target.suggestedName,
        roleCode: link.requestedRoleCode || undefined,
      });
    }
    await request(
      `/api/enterprise/${organizationId}/identity-links/${link.id}/decision`,
      payload,
      `${action}:${link.id}`,
    );
  }

  return (
    <ModuleWorkspace>
      <ModuleHeader
        eyebrow={`Administration · ${organizationName}`}
        title="Identités et consentements"
        description="Invitez une personne précise ou examinez ses demandes. La base globale des utilisateurs DTSC n’est jamais exposée."
        count={`${links.length} opération${links.length > 1 ? "s" : ""}`}
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
        <ModuleSection
          title="Inviter une personne"
          description="La recherche est limitée à vos propres fiches métier. L’adresse exacte reçoit une réponse privée et neutre, qu’un compte DTSC existe déjà ou non."
        >
          <form onSubmit={submitInvitation} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <label className="min-w-0 text-sm font-black text-dtsc-ink lg:col-span-2">
              Fiche métier
              <select
                value={selectedTarget}
                onChange={(event) => applyTarget(event.target.value)}
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                required
              >
                <option value="">Sélectionner une fiche</option>
                {targets.map((target) => (
                  <option key={`${target.kind}:${target.value}`} value={`${target.kind}:${target.value}`}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Nom affiché
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                required
              />
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Adresse exacte de la personne
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                required
              />
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Type de relation
              <select
                value={relationType}
                onChange={(event) => setRelationType(event.target.value as EnterpriseIdentityRelationType)}
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
              >
                {ENTERPRISE_IDENTITY_RELATION_TYPES.map((type) => (
                  <option key={type} value={type}>{getEnterpriseIdentityRelationLabel(type, "fr")}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink">
              Rôle dans la relation (facultatif)
              <input
                name="roleCode"
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                placeholder="Ex. interlocuteur autorisé"
              />
            </label>
            <label className="min-w-0 text-sm font-black text-dtsc-ink lg:col-span-2">
              Finalité précise
              <textarea
                name="purpose"
                rows={4}
                className="mt-1.5 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base font-normal"
                placeholder="Expliquez les services et accès rendus possibles par cette relation."
                required
              />
            </label>
            <div data-responsive-actions className="lg:col-span-2">
              <button
                type="submit"
                disabled={busy !== null || !targets.length}
                className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "invite" ? "Envoi…" : "Envoyer l’invitation privée"}
              </button>
            </div>
          </form>
        </ModuleSection>

        <ModuleSection
          title="Invitations, demandes et relations"
          description="Les actions impossibles dans l’état courant ne sont pas proposées. Les fiches métier restent conservées en cas de refus, expiration ou révocation."
          count={links.length}
        >
          {links.length ? (
            <BusinessList ariaLabel="Gestion des consentements entreprise">
              {links.map((link) => {
                const status = link.status as EnterpriseIdentityLinkStatus;
                const canApprove = link.status === "ORGANIZATION_APPROVAL_REQUIRED";
                const canCancel = ["INVITATION_PENDING", "REQUEST_PENDING", "USER_CONSENT_REQUIRED", "ORGANIZATION_APPROVAL_REQUIRED"].includes(link.status);
                return (
                  <BusinessListItem
                    key={link.id}
                    title={link.person?.displayName || "Fiche métier indisponible"}
                    status={<StatusBadge tone={statusTone(link.status)}>{getEnterpriseIdentityStatusLabel(status, "fr")}</StatusBadge>}
                    meta={`${getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, "fr")} · ${new Date(link.createdAt).toLocaleDateString("fr-FR")}`}
                    description={link.purpose}
                    actions={
                      canApprove || canCancel ? (
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                          {canApprove ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => decide(link, "APPROVE")}
                              className="min-h-10 rounded-lg bg-dtsc-blue px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                            >
                              {busy === `APPROVE:${link.id}` ? "Approbation…" : "Approuver"}
                            </button>
                          ) : null}
                          {canApprove ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => decide(link, "REFUSE")}
                              className="min-h-10 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50 dark:text-red-300"
                            >
                              Refuser
                            </button>
                          ) : null}
                          {!canApprove && canCancel ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => decide(link, "CANCEL")}
                              className="min-h-10 rounded-lg border border-dtsc-border px-3 py-2 text-xs font-black text-dtsc-ink disabled:opacity-50"
                            >
                              Annuler
                            </button>
                          ) : null}
                        </div>
                      ) : null
                    }
                  />
                );
              })}
            </BusinessList>
          ) : (
            <div className="border-y border-dtsc-border py-10 text-center text-sm text-dtsc-muted">
              Aucune invitation ou demande n’a encore été créée.
            </div>
          )}
        </ModuleSection>
      </ModuleContent>
    </ModuleWorkspace>
  );
}
