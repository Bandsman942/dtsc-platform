"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppLocale } from "@/components/i18n/locale-provider";
import { RelationshipOverviewPanel } from "@/components/enterprise/identity-links/relationship-overview-panel";
import { FullscreenEntityDetail } from "@/components/workspace/fullscreen-entity-detail";
import { StatusBadge } from "@/components/workspace/status-badge";
import { notifyToast } from "@/lib/client-toast";
import { confirmSensitiveAction } from "@/lib/client-confirmation";
import {
  getEnterpriseIdentityRelationLabel,
  getEnterpriseIdentityStatusLabel,
  type EnterpriseIdentityRelationType,
  type EnterpriseIdentityLinkStatus,
} from "@/lib/enterprise/identity-links/contracts";

export type IdentityAdminTarget = {
  kind: "businessPartyId" | "businessPartyContactId" | "employeeId" | "supplierId" | "supplierContactId";
  value: string; label: string; suggestedName: string; suggestedEmail: string;
  partyType?: "PERSON" | "ORGANIZATION"; roleCodes?: string[];
};

export type IdentityAdminLink = {
  id: string; requestedRelationType: string; requestedRoleCode: string | null;
  status: string; purpose: string; revision: number; createdAt: string;
  person: { id: string; displayName: string; status: string } | null;
  references: Array<{ id: string; relationType: string; roleCode: string | null }>;
};

export function IdentityAdminDetail({
  organizationId, link, targets, focusedTargetKey, onClose, onSaved,
}: {
  organizationId: string;
  link: IdentityAdminLink | null;
  targets: IdentityAdminTarget[];
  focusedTargetKey?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const locale = useAppLocale() === "en" ? "en" : "fr";
  const [targetKey, setTargetKey] = useState(focusedTargetKey || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const candidates = useMemo(() => {
    if (!link) return [];
    const type = link.requestedRelationType;
    return targets.filter((item) => {
      if (type === "SUPPLIER") return item.kind === "supplierId" || (
        item.kind === "businessPartyId" && item.partyType === "PERSON" && item.roleCodes?.includes("SUPPLIER")
      );
      if (type === "SUPPLIER_REPRESENTATIVE") return item.kind === "supplierContactId" ||
        (item.kind === "businessPartyContactId" && Boolean(item.roleCodes?.includes("SUPPLIER")));
      if (type === "CUSTOMER_CONTACT") return item.kind === "businessPartyContactId" && Boolean(item.roleCodes?.includes("CUSTOMER"));
      if (type === "EMPLOYEE" || type === "COLLABORATOR") return item.kind === "employeeId";
      if (["CUSTOMER", "PROSPECT", "PARTNER", "CONTRACTOR"].includes(type)) {
        return item.kind === "businessPartyId" && item.partyType === "PERSON" && Boolean(item.roleCodes?.includes(type));
      }
      return item.kind === "businessPartyId" && item.partyType === "PERSON";
    });
  }, [link, targets]);

  async function decide(action: "APPROVE" | "REFUSE" | "CANCEL") {
    if (!link || busy) return;
    const chosen = candidates.find((item) => `${item.kind}:${item.value}` === targetKey);
    if (action === "APPROVE" && !chosen) {
      const message = locale === "en" ? "Choose a compatible business record before approving." : "Sélectionnez une fiche métier compatible avant l’approbation.";
      setError(message);
      notifyToast(message, "error");
      return;
    }
    if (action !== "APPROVE") {
      const confirmation = await confirmSensitiveAction({
        title: locale === "en" ? "Confirm this decision" : "Confirmer cette décision",
        description: locale === "en"
          ? "This request will be refused or cancelled. Its history will be retained."
          : "Cette demande sera refusée ou annulée. Son historique sera conservé.",
        confirmLabel: locale === "en" ? "Confirm" : "Confirmer",
        cancelLabel: locale === "en" ? "Keep request" : "Conserver la demande",
        tone: action === "REFUSE" ? "danger" : "warning",
      });
      if (!confirmation.confirmed) return;
    }
    const payload: Record<string, unknown> = { revision: link.revision, action };
    if (chosen && action === "APPROVE") {
      payload[chosen.kind] = chosen.value;
      payload.displayName = link.person?.displayName || chosen.suggestedName;
      payload.roleCode = link.requestedRoleCode || undefined;
    }
    if (action !== "APPROVE" && reason.trim().length >= 3) payload.reason = reason.trim();

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/enterprise/${encodeURIComponent(organizationId)}/identity-links/${encodeURIComponent(link.id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || (locale === "en" ? "Unable to save this decision." : "La décision n’a pas pu être enregistrée."));
      notifyToast(locale === "en" ? "Decision saved." : "Décision enregistrée.", "success");
      onSaved();
      setTargetKey("");
      setReason("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : (locale === "en" ? "Unable to save this decision." : "La décision n’a pas pu être enregistrée.");
      setError(message);
      notifyToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenEntityDetail
      open={Boolean(link)}
      onClose={() => { if (!busy) onClose(); }}
      title={link?.person?.displayName || (locale === "en" ? "Business relationship" : "Relation professionnelle")}
      description={link ? getEnterpriseIdentityRelationLabel(link.requestedRelationType as EnterpriseIdentityRelationType, locale) : undefined}
    >
      {link ? (
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge tone={link.status === "ACTIVE" ? "success" : "neutral"}>
              {getEnterpriseIdentityStatusLabel(link.status as EnterpriseIdentityLinkStatus, locale)}
            </StatusBadge>
            <p className="text-xs text-dtsc-muted">
              {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR").format(new Date(link.createdAt))}
            </p>
          </div>
          <RelationshipOverviewPanel organizationId={organizationId} links={[link]} />
          {link.references.length ? (
            <div className="grid gap-1 border-t border-dtsc-border pt-3">
              <p className="text-xs font-black uppercase text-dtsc-muted">
                {locale === "en" ? "Associated business records" : "Fiches métier associées"}
              </p>
              {link.references.map((reference) => (
                <p key={reference.id} className="text-sm text-dtsc-ink">
                  {getEnterpriseIdentityRelationLabel(reference.relationType as EnterpriseIdentityRelationType, locale)}
                  {reference.roleCode ? ` · ${reference.roleCode}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          {link.status === "ORGANIZATION_APPROVAL_REQUIRED" ? (
            <label className="text-sm font-bold text-dtsc-ink">
              {locale === "en" ? "Record to associate with the request" : "Fiche métier à associer à la demande"}
              <select className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3"
                value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
                <option value="">{locale === "en" ? "Select a compatible record" : "Sélectionner une fiche compatible"}</option>
                {candidates.map((candidate) => (
                  <option value={`${candidate.kind}:${candidate.value}`} key={`${candidate.kind}:${candidate.value}`}>{candidate.label}</option>
                ))}
              </select>
              {!candidates.length ? (
                <span className="mt-2 block text-xs font-normal text-dtsc-muted">
                  {locale === "en" ? "No compatible record is available." : "Aucune fiche compatible n’est disponible."}{" "}
                  <Link href={`/enterprise-modules/CRM_CUSTOMERS?action=create&returnTo=${encodeURIComponent(`/enterprise-identity-admin?link=${link.id}`)}`}
                    className="font-black text-dtsc-blue underline">
                    {locale === "en" ? "Create a record" : "Créer une fiche"}
                  </Link>
                </span>
              ) : null}
            </label>
          ) : null}
          {["ORGANIZATION_APPROVAL_REQUIRED", "INVITATION_PENDING", "REQUEST_PENDING", "USER_CONSENT_REQUIRED"].includes(link.status) ? (
            <label className="text-sm font-bold text-dtsc-ink">
              {locale === "en" ? "Reason (optional)" : "Motif (facultatif)"}
              <textarea value={reason} onChange={(event) => setReason(event.target.value)}
                rows={3} className="mt-1.5 w-full rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2" />
            </label>
          ) : null}
          {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
          {link.status === "ORGANIZATION_APPROVAL_REQUIRED" ? (
            <div data-responsive-actions className="flex min-w-0 flex-wrap gap-3">
              <button type="button" disabled={busy || !targetKey} aria-busy={busy} onClick={() => void decide("APPROVE")}
                className="min-h-11 rounded-xl bg-dtsc-blue px-4 text-sm font-bold text-white disabled:opacity-50">
                {locale === "en" ? "Approve" : "Approuver"}
              </button>
              <button type="button" disabled={busy} onClick={() => void decide("REFUSE")}
                className="min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-bold text-red-700 dark:text-red-300 disabled:opacity-50">
                {locale === "en" ? "Refuse" : "Refuser"}
              </button>
            </div>
          ) : null}
          {["INVITATION_PENDING", "REQUEST_PENDING", "USER_CONSENT_REQUIRED"].includes(link.status) ? (
            <button type="button" disabled={busy} onClick={() => void decide("CANCEL")}
              className="min-h-11 w-fit rounded-xl border border-dtsc-border px-4 text-sm font-bold text-dtsc-ink disabled:opacity-50">
              {locale === "en" ? "Cancel request" : "Annuler la demande"}
            </button>
          ) : null}
        </div>
      ) : null}
    </FullscreenEntityDetail>
  );
}
