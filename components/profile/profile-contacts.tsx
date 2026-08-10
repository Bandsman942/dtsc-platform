"use client";

import { Copy, Mail, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConversationAvatar } from "@/components/chat/ConversationAvatar";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { StatusBadge } from "@/components/workspace/status-badge";

type ProfileContact = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  lastSeenAt?: string | null;
  contactSince?: string | null;
};

function isOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= 5 * 60 * 1000;
}

function formatContactDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "fr", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ProfileContacts({ contacts, locale, initialSelectedContactId }: { contacts: ProfileContact[]; locale: string; initialSelectedContactId?: string | null }) {
  const english = locale === "en";
  const [selected, setSelected] = useState<ProfileContact | null>(null);
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  useToastMessage(feedback);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

  useEffect(() => {
    if (!initialSelectedContactId) return;
    setSelected(contactById.get(initialSelectedContactId) || null);
  }, [contactById, initialSelectedContactId]);

  async function openConversation(contact: ProfileContact) {
    if (openingConversationId) return;
    setOpeningConversationId(contact.id);
    try {
      const response = await fetch("/api/collaborators/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: contact.id }),
      });
      const body = await response.json().catch(() => null) as { group?: { id: string }; message?: string } | null;
      if (!response.ok || !body?.group?.id) {
        setFeedback(body?.message || (english ? "Unable to open the conversation." : "Impossible d’ouvrir la conversation."));
        return;
      }
      window.location.assign(`/collaborators?groupId=${encodeURIComponent(body.group.id)}`);
    } finally {
      setOpeningConversationId(null);
    }
  }

  function copyEmail(contact: ProfileContact) {
    void navigator.clipboard?.writeText(contact.email);
    setFeedback(english ? "Email copied." : "Adresse e-mail copiée.");
  }

  function emailContact(contact: ProfileContact) {
    window.location.href = `mailto:${contact.email}`;
  }

  function menuFor(contact: ProfileContact): ActionMenuItem[] {
    return [
      { key: "conversation", label: english ? "Open conversation" : "Ouvrir la conversation", icon: MessageCircle, onSelect: () => void openConversation(contact) },
      { key: "email", label: english ? "Send an email" : "Envoyer un e-mail", icon: Mail, onSelect: () => emailContact(contact) },
      { key: "copy-email", label: english ? "Copy email" : "Copier l’adresse e-mail", icon: Copy, onSelect: () => copyEmail(contact) },
    ];
  }

  if (!contacts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-dtsc-border bg-dtsc-page px-4 py-8 text-center">
        <UserRound className="mx-auto h-9 w-9 text-dtsc-muted" />
        <p className="mt-3 text-sm font-bold text-dtsc-ink">{english ? "No accepted contact yet" : "Aucun contact accepté pour le moment"}</p>
        <p className="mt-1 text-xs leading-5 text-dtsc-muted">{english ? "Use Discussions > Quick actions > Add a contact to send an invitation." : "Utilisez Discussions > Actions rapides > Ajouter un contact pour envoyer une invitation."}</p>
      </div>
    );
  }

  return (
    <>
      <BusinessList ariaLabel={english ? "My professional contacts" : "Mes contacts professionnels"}>
        {contacts.map((contact) => {
          const online = isOnline(contact.lastSeenAt);
          return (
            <BusinessListItem
              key={contact.id}
              leading={<ConversationAvatar title={contact.name} avatarUrl={contact.avatarUrl} isOnline={online} className="h-11 w-11" />}
              title={contact.name}
              meta={contact.jobTitle || (english ? "Professional contact" : "Contact professionnel")}
              description={online ? (english ? "Online now" : "En ligne maintenant") : contact.contactSince ? `${english ? "Contact since" : "Contact depuis"} ${formatContactDate(contact.contactSince, locale) || "—"}` : undefined}
              status={<StatusBadge tone={online ? "success" : "neutral"}>{online ? (english ? "Online" : "En ligne") : (english ? "Contact" : "Contact")}</StatusBadge>}
              onOpen={() => setSelected(contact)}
              openLabel={english ? `Open ${contact.name}` : `Ouvrir ${contact.name}`}
            />
          );
        })}
      </BusinessList>

      <Dialog
        open={Boolean(selected)}
        title={selected?.name || (english ? "Contact" : "Contact")}
        description={selected?.jobTitle || (english ? "Professional contact" : "Contact professionnel")}
        onClose={() => setSelected(null)}
        className="h-[96dvh] max-w-none sm:h-[88dvh] sm:max-w-2xl"
      >
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <section className="flex min-w-0 items-start gap-4 rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <ConversationAvatar title={selected.name} avatarUrl={selected.avatarUrl} isOnline={isOnline(selected.lastSeenAt)} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-xl font-black text-dtsc-ink">{selected.name}</h3>
                <p className="mt-1 break-words text-sm font-semibold text-dtsc-muted">{selected.jobTitle || (english ? "Professional contact" : "Contact professionnel")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge tone={isOnline(selected.lastSeenAt) ? "success" : "neutral"}>{isOnline(selected.lastSeenAt) ? (english ? "Online" : "En ligne") : (english ? "Offline" : "Hors ligne")}</StatusBadge>
                  {selected.role ? <StatusBadge>{selected.role}</StatusBadge> : null}
                </div>
              </div>
              <ActionMenu label={english ? "Contact actions" : "Actions du contact"} items={menuFor(selected)} />
            </section>

            <div className="grid grid-cols-2 gap-3" data-responsive-actions>
              <Button type="button" disabled={openingConversationId === selected.id} onClick={() => void openConversation(selected)} className="min-h-12 rounded-2xl bg-[#002b5b] text-white">
                <MessageCircle className="h-5 w-5" />{openingConversationId === selected.id ? "…" : english ? "Message" : "Message"}
              </Button>
              <Button type="button" variant="outline" onClick={() => emailContact(selected)} className="min-h-12 rounded-2xl">
                <Mail className="h-5 w-5" />{english ? "Email" : "E-mail"}
              </Button>
            </div>

            <section className="min-w-0 divide-y divide-dtsc-border rounded-2xl border border-dtsc-border bg-dtsc-surface">
              <div className="grid min-w-0 gap-1 px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{english ? "Email" : "Adresse e-mail"}</span>
                <span className="break-all text-sm font-semibold text-dtsc-ink">{selected.email}</span>
              </div>
              <div className="grid min-w-0 gap-1 px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{english ? "Contact since" : "Contact depuis"}</span>
                <span className="text-sm font-semibold text-dtsc-ink">{formatContactDate(selected.contactSince, locale) || "—"}</span>
              </div>
              <div className="grid min-w-0 gap-1 px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.08em] text-dtsc-muted">{english ? "Last presence" : "Dernière présence"}</span>
                <span className="text-sm font-semibold text-dtsc-ink">{isOnline(selected.lastSeenAt) ? (english ? "Online now" : "En ligne maintenant") : formatContactDate(selected.lastSeenAt, locale) || (english ? "Unavailable" : "Indisponible")}</span>
              </div>
            </section>

            <p className="mt-auto text-xs leading-5 text-dtsc-muted">{english ? "This contact comes from the accepted DTSC collaboration relationship. Blocking and conversation authorization remain enforced by the collaboration backend." : "Ce contact provient de la relation de collaboration DTSC acceptée. Le blocage et l’autorisation des conversations restent appliqués par le backend de collaboration."}</p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
