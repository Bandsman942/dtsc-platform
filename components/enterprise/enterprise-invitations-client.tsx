"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EnterpriseInvitationItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  logoUrl: string | null;
  role: string;
  invitedByName: string | null;
  createdAt: string;
  highlighted: boolean;
};

function roleLabel(role: string) {
  if (role === "MANAGER") {
    return "Manager";
  }
  if (role === "GUEST") {
    return "Invité";
  }
  return "Membre";
}

export function EnterpriseInvitationsClient({ invitations }: { invitations: EnterpriseInvitationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(invitations);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [acceptedOrganizationId, setAcceptedOrganizationId] = useState<string | null>(null);

  async function switchToOrganization(organizationId: string) {
    const contextResponse = await fetch("/api/account/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!contextResponse.ok) {
      setAcceptedOrganizationId(organizationId);
      setFeedback("Invitation acceptée. Le changement d'espace n'a pas pu être appliqué automatiquement.");
      return;
    }
    router.refresh();
    router.push("/dashboard");
  }

  async function respond(invitation: EnterpriseInvitationItem, action: "ACCEPT" | "DECLINE") {
    setPendingId(invitation.id);
    setFeedback("");
    const response = await fetch(`/api/enterprise/invitations/${invitation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string; organizationId?: string } | null;
    setPendingId(null);

    if (!response.ok) {
      setFeedback(body?.message || "Impossible de traiter cette invitation.");
      return;
    }

    if (action === "ACCEPT") {
      const nextOrganizationId = body?.organizationId || invitation.organizationId;
      setItems((currentItems) => currentItems.filter((item) => item.id !== invitation.id));
      setAcceptedOrganizationId(nextOrganizationId);
      setFeedback("Invitation acceptée. Accès à l'entreprise en cours...");
      await switchToOrganization(nextOrganizationId);
      return;
    }

    setItems((currentItems) => currentItems.filter((item) => item.id !== invitation.id));
    setFeedback("Invitation refusée.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 p-4 text-sm font-bold text-dtsc-blue">
          {feedback}
          {acceptedOrganizationId && (
            <Button type="button" onClick={() => void switchToOrganization(acceptedOrganizationId)} className="mt-3 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
              <ExternalLink className="h-4 w-4" />
              Accéder à l&apos;entreprise
            </Button>
          )}
        </div>
      )}
      {items.map((invitation) => {
        const pending = pendingId === invitation.id;
        return (
          <article
            key={invitation.id}
            className={`dtsc-card p-5 ${invitation.highlighted ? "ring-2 ring-cyan-300" : ""}`}
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-dtsc-soft text-cyan-600">
                  {invitation.logoUrl ? <img src={invitation.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Invitation entreprise</p>
                  <h2 className="mt-1 truncate text-2xl font-black text-dtsc-ink">{invitation.organizationName}</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-dtsc-blue">
                    <span className="rounded-full bg-dtsc-soft px-3 py-1">Rôle {roleLabel(invitation.role)}</span>
                    {invitation.invitedByName && <span className="rounded-full bg-dtsc-soft px-3 py-1">Invité par {invitation.invitedByName}</span>}
                    <span className="rounded-full bg-dtsc-soft px-3 py-1">{new Date(invitation.createdAt).toLocaleString("fr-FR")}</span>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-dtsc-muted">
                    Acceptez cette invitation pour activer votre accès à l&apos;espace privé de cette entreprise. Un refus retire l&apos;invitation active sans supprimer l&apos;historique d&apos;audit.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:min-w-40">
                <Button type="button" onClick={() => void respond(invitation, "ACCEPT")} disabled={pending} className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Accepter
                </Button>
                <Button type="button" variant="outline" onClick={() => void respond(invitation, "DECLINE")} disabled={pending} className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
                  <XCircle className="h-4 w-4" />
                  Refuser
                </Button>
              </div>
            </div>
          </article>
        );
      })}
      {!items.length && (
        <div className="dtsc-card p-8 text-center">
          <p className="text-lg font-black text-dtsc-ink">Aucune invitation en attente.</p>
          <p className="mt-2 text-sm leading-6 text-dtsc-muted">Les prochaines invitations entreprise apparaîtront ici et resteront séparées des invitations de groupes collaborateurs.</p>
        </div>
      )}
    </div>
  );
}
