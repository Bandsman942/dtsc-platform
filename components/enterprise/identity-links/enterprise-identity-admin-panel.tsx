"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IdentityAdminDetail } from "@/components/enterprise/identity-links/identity-admin-detail";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { notifyToast } from "@/lib/client-toast";
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
  kind: "businessPartyId" | "businessPartyContactId" | "employeeId" | "supplierId" | "supplierContactId";
  label: string;
  suggestedName: string;
  suggestedEmail: string;
  partyType?: "PERSON" | "ORGANIZATION";
  roleCodes?: string[];
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
    supplierId?: string | null;
    supplierContactId?: string | null;
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
  focusedLinkId,
  focusedTargetKey,
}: {
  organizationId: string;
  organizationName: string;
  links: OrganizationIdentityLink[];
  targets: IdentityTarget[];
  focusedLinkId?: string;
  focusedTargetKey?: string;
}) {
  const router = useRouter();
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const [openedId, setOpenedId] = useState<string | null>(focusedLinkId && links.some((link) => link.id === focusedLinkId) ? focusedLinkId : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetKind, setTargetKind] = useState("");
  const [relationType, setRelationType] = useState<EnterpriseIdentityRelationType>("CUSTOMER");
  const filteredTargets = useMemo(() => targets.filter((target) => {
    const searchMatch = !targetSearch.trim() || `${target.label} ${target.suggestedEmail}`.toLocaleLowerCase("fr").includes(targetSearch.trim().toLocaleLowerCase("fr"));
    return searchMatch && (!targetKind || target.kind === targetKind);
  }), [targetKind, targetSearch, targets]);
  const targetByComposite = useMemo(
    () => new Map(targets.map((target) => [`${target.kind}:${target.value}`, target])),
    [targets],
  );
  const orderedLinks = useMemo(() => {
    if (!focusedLinkId) return links;
    return [...links].sort((left, right) => Number(right.id === focusedLinkId) - Number(left.id === focusedLinkId));
  }, [focusedLinkId, links]);

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
      const message = data?.message || (locale === "en" ? "Action saved." : "L’action a été enregistrée.");
      setSuccess(message);
      notifyToast(message, "success");
      router.refresh();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "L’action n’a pas pu être terminée.";
      setError(message);
      notifyToast(message, "error");
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

  function openLink(id: string) {
    setOpenedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("link", id);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }

  function closeLink() {
    setOpenedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("link");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
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
            <div className="grid gap-3 lg:col-span-2 sm:grid-cols-2">
              <label className="min-w-0 text-sm font-black text-dtsc-ink">Rechercher une fiche
                <input value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal" placeholder="Nom, référence ou contact" />
              </label>
              <label className="min-w-0 text-sm font-black text-dtsc-ink">Type de fiche
                <select value={targetKind} onChange={(event) => setTargetKind(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal">
                  <option value="">Tous les types</option><option value="businessPartyId">Tiers</option><option value="businessPartyContactId">Contact de tiers</option><option value="supplierId">Fournisseur personne</option><option value="supplierContactId">Contact fournisseur</option><option value="employeeId">Employé ou collaborateur</option>
                </select>
              </label>
            </div>
            <label className="min-w-0 text-sm font-black text-dtsc-ink lg:col-span-2">
              Fiche métier
              <select
                value={selectedTarget}
                onChange={(event) => applyTarget(event.target.value)}
                className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-base font-normal"
                required
              >
                <option value="">Sélectionner une fiche</option>
                {filteredTargets.map((target) => (
                  <option key={`${target.kind}:${target.value}`} value={`${target.kind}:${target.value}`}>
                    {target.label}
                  </option>
                ))}
              </select>
              {!filteredTargets.length ? <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-normal text-dtsc-muted">Aucune fiche correspondante. <Link className="font-black text-dtsc-blue underline" href={`/enterprise-modules/CRM_CUSTOMERS?action=create&returnTo=${encodeURIComponent("/enterprise-identity-admin")}`}>Créer une nouvelle fiche</Link></span> : null}
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
              {orderedLinks.map((link) => {
                const status = link.status as EnterpriseIdentityLinkStatus;
                return (
                  <BusinessListItem
                    key={link.id}
                    title={link.person?.displayName || "Fiche métier indisponible"}
                    status={<StatusBadge tone={statusTone(link.status)}>{getEnterpriseIdentityStatusLabel(status, "fr")}</StatusBadge>}
                    meta={`${getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, "fr")} · ${new Date(link.createdAt).toLocaleDateString("fr-FR")}`}
                    description={link.purpose}
                    onOpen={() => openLink(link.id)}
                    openLabel={locale === "en" ? "Open relationship details" : "Ouvrir les détails de cette relation"}
                    actions={<button type="button" onClick={() => openLink(link.id)}
                      className="min-h-11 rounded-xl border border-dtsc-border px-3 text-xs font-black text-dtsc-blue">
                      {locale === "en" ? "View details" : "Voir détails"}
                    </button>}
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
      <IdentityAdminDetail
        key={openedId || "empty"}
        organizationId={organizationId}
        link={links.find((link) => link.id === openedId) || null}
        targets={targets}
        focusedTargetKey={focusedTargetKey}
        onClose={closeLink}
        onSaved={() => router.refresh()}
      />
    </ModuleWorkspace>
  );
}
