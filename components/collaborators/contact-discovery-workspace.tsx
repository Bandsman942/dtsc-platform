"use client";

import { Check, Mail, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ConversationAvatar } from "@/components/chat/ConversationAvatar";
import { SearchBar } from "@/components/chat/SearchBar";
import { Button } from "@/components/ui/button";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";

type DirectoryUser = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  maskedEmail: string;
  invitationLabel?: string | null;
};

type ContactRequest = {
  id: string;
  requesterId: string;
  targetUserId: string;
  requester: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null };
  targetUser: { id: string; name: string; avatarUrl?: string | null; jobTitle?: string | null };
};

export function ContactDiscoveryWorkspace({ locale, currentUserRole }: { locale: string; currentUserRole: string }) {
  const english = locale === "en";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ContactRequest[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  useToastMessage(feedback);

  async function loadRequests() {
    const response = await fetch("/api/collaborators/contact-requests", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { incoming?: ContactRequest[]; outgoing?: ContactRequest[] };
    setIncoming(body.incoming || []);
    setOutgoing(body.outgoing || []);
  }

  useEffect(() => { void loadRequests(); }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const response = await fetch(`/api/collaborators/contact-directory?query=${encodeURIComponent(value)}`, {
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);
      if (response?.ok) {
        const body = await response.json() as { users?: DirectoryUser[] };
        setResults(body.users || []);
      } else if (response) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setFeedback(body?.message || (english ? "Unable to search contacts." : "Impossible de rechercher des contacts."));
      }
      setSearching(false);
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [english, query]);

  async function invite(targetUserId: string) {
    setBusyId(targetUserId);
    const response = await fetch("/api/collaborators/contact-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    setBusyId(null);
    if (!response.ok) {
      setFeedback(body?.message || (english ? "Unable to send invitation." : "Impossible d’envoyer l’invitation."));
      return;
    }
    setResults((current) => current.filter((user) => user.id !== targetUserId));
    setFeedback(english ? "Contact invitation sent." : "Invitation de contact envoyée.");
    await loadRequests();
  }

  async function respond(requestId: string, action: "ACCEPT" | "DECLINE" | "CANCEL") {
    setBusyId(requestId);
    const response = await fetch(`/api/collaborators/contact-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null) as { groupId?: string; message?: string } | null;
    setBusyId(null);
    if (!response.ok) {
      setFeedback(body?.message || (english ? "Unable to update invitation." : "Impossible de mettre à jour l’invitation."));
      return;
    }
    await loadRequests();
    if (action === "ACCEPT" && body?.groupId) {
      window.location.assign(`/collaborators?groupId=${encodeURIComponent(body.groupId)}`);
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <section className="grid min-w-0 gap-3">
        <div>
          <h3 className="text-base font-black text-dtsc-ink">{english ? "Find a contact" : "Trouver un contact"}</h3>
          <p className="mt-1 text-sm leading-6 text-dtsc-muted">
            {currentUserRole === "ADMIN"
              ? (english ? "Search a platform profile by name, organization, role or exact email. ADMIN exact-email lookup remains audited." : "Recherchez un profil de la plateforme par nom, organisation, fonction ou adresse e-mail exacte. La recherche ADMIN par e-mail exact reste auditée.")
              : (english ? "Search discoverable profiles by name, organization or role. Exact-email lookup respects profile discovery consent." : "Recherchez les profils découvrables par nom, organisation ou fonction. La recherche par e-mail exact respecte le consentement de visibilité du profil.")}
          </p>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder={english ? "Name, organization, role or email…" : "Nom, organisation, fonction ou e-mail…"} />
        {query.trim().length > 0 && query.trim().length < 3 ? <p className="text-xs font-semibold text-dtsc-muted">{english ? "Enter at least 3 characters." : "Saisissez au moins 3 caractères."}</p> : null}
        {searching ? <p className="py-5 text-center text-sm font-semibold text-dtsc-muted">{english ? "Searching…" : "Recherche…"}</p> : null}
        {!searching && results.length ? (
          <BusinessList ariaLabel={english ? "Contact search results" : "Résultats de recherche de contacts"}>
            {results.map((user) => (
              <BusinessListItem
                key={user.id}
                leading={<ConversationAvatar title={user.name} avatarUrl={user.avatarUrl} className="h-11 w-11" />}
                title={user.name}
                meta={user.jobTitle || user.companyName || user.maskedEmail}
                description={user.invitationLabel ? `${user.invitationLabel} · ${user.maskedEmail}` : user.maskedEmail}
                actions={(
                  <Button type="button" size="sm" disabled={busyId === user.id} onClick={() => void invite(user.id)} className="rounded-full">
                    <UserPlus className="h-4 w-4" />
                    {busyId === user.id ? "…" : english ? "Invite" : "Inviter"}
                  </Button>
                )}
              />
            ))}
          </BusinessList>
        ) : null}
        {!searching && query.trim().length >= 3 && !results.length ? <p className="py-6 text-center text-sm text-dtsc-muted">{english ? "No new discoverable contact found." : "Aucun nouveau contact découvrable trouvé."}</p> : null}
      </section>

      {incoming.length ? (
        <section className="min-w-0">
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.08em] text-dtsc-muted">{english ? "Invitations received" : "Invitations reçues"}</h3>
          <BusinessList ariaLabel={english ? "Incoming contact invitations" : "Invitations de contact reçues"}>
            {incoming.map((request) => (
              <BusinessListItem
                key={request.id}
                leading={<ConversationAvatar title={request.requester.name} avatarUrl={request.requester.avatarUrl} className="h-10 w-10" />}
                title={request.requester.name}
                meta={request.requester.jobTitle || (english ? "Wants to add you" : "Souhaite vous ajouter")}
                actions={(
                  <div className="flex gap-2" data-responsive-actions>
                    <Button type="button" size="icon" disabled={busyId === request.id} onClick={() => void respond(request.id, "ACCEPT")} className="h-10 w-10 rounded-full" aria-label={english ? "Accept" : "Accepter"}><Check className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="outline" disabled={busyId === request.id} onClick={() => void respond(request.id, "DECLINE")} className="h-10 w-10 rounded-full" aria-label={english ? "Decline" : "Refuser"}><X className="h-4 w-4" /></Button>
                  </div>
                )}
              />
            ))}
          </BusinessList>
        </section>
      ) : null}

      {outgoing.length ? (
        <section className="min-w-0">
          <h3 className="mb-2 text-sm font-black uppercase tracking-[0.08em] text-dtsc-muted">{english ? "Pending invitations" : "Invitations en attente"}</h3>
          <BusinessList ariaLabel={english ? "Pending contact invitations" : "Invitations de contact en attente"}>
            {outgoing.map((request) => (
              <BusinessListItem
                key={request.id}
                leading={<ConversationAvatar title={request.targetUser.name} avatarUrl={request.targetUser.avatarUrl} className="h-10 w-10" />}
                title={request.targetUser.name}
                meta={request.targetUser.jobTitle || (english ? "Invitation pending" : "Invitation en attente")}
                actions={<Button type="button" size="sm" variant="outline" disabled={busyId === request.id} onClick={() => void respond(request.id, "CANCEL")} className="rounded-full"><Mail className="h-4 w-4" />{english ? "Cancel" : "Annuler"}</Button>}
              />
            ))}
          </BusinessList>
        </section>
      ) : null}
    </div>
  );
}
