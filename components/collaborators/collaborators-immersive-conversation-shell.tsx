"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { useImmersiveConversationViewport } from "@/components/chat/use-immersive-conversation-viewport";
import { CollaboratorsConversationWorkspace } from "@/components/collaborators/collaborators-conversation-workspace";
import { useFloatingAction } from "@/components/floating-actions/floating-action-hub";
import { translateSharedWork } from "@/lib/i18n";
import { getParticipantColor } from "@/lib/participant-colors";

type Props = ComponentProps<typeof CollaboratorsConversationWorkspace>;
type ParticipantPresentation = { id: string; name: string; avatarUrl?: string | null };

export function CollaboratorsImmersiveConversationShell(props: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  useImmersiveConversationViewport();

  useFloatingAction({
    id: "collaborators-add-contact",
    label: translateSharedWork(props.userPreferences.locale, "collaboration.addContact"),
    icon: UserPlus,
    order: 40,
    onSelect: () => router.push("/collaborators/contacts/new"),
  });

  const participantsByName = useMemo(() => {
    const values = new Map<string, ParticipantPresentation>();
    const duplicates = new Set<string>();
    const register = (participant: ParticipantPresentation) => {
      const normalized = participant.name.trim();
      if (!normalized) return;
      const existing = values.get(normalized);
      if (existing && existing.id !== participant.id) duplicates.add(normalized);
      else values.set(normalized, participant);
    };
    for (const user of props.users) register(user);
    for (const contact of props.initialContacts) register(contact);
    for (const group of props.initialGroups) {
      for (const member of group.members) register({ id: member.userId, name: member.user.name, avatarUrl: member.user.avatarUrl });
    }
    for (const duplicate of duplicates) values.delete(duplicate);
    return values;
  }, [props.initialContacts, props.initialGroups, props.users]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const compactContacts = () => {
      const aside = root.querySelector<HTMLElement>("aside");
      const section = aside?.querySelector<HTMLElement>('section[aria-label="Mes contacts acceptés"], section[aria-label="My accepted contacts"]');
      if (!aside || !section) return;
      section.dataset.contactAvatarRail = "true";
      const header = aside.firstElementChild;
      if (header && header.nextElementSibling !== section) aside.insertBefore(section, header.nextSibling);

      for (const button of aside.querySelectorAll<HTMLButtonElement>("button")) {
        const label = button.getAttribute("aria-label");
        if (label === "Nouvelle conversation directe" || label === "New direct conversation") {
          button.hidden = true;
        }
      }
    };

    const applyConversationPolish = () => {
      const bubbles = root.querySelectorAll<HTMLElement>("main .group.relative");
      for (const bubble of bubbles) {
        bubble.dataset.collaborationMessageBubble = "true";
        const sender = bubble.querySelector<HTMLParagraphElement>("p.mb-1.font-black");
        const senderName = sender?.textContent?.trim();
        if (!sender || !senderName) continue;
        const participant = participantsByName.get(senderName);
        const seed = participant?.id || senderName;
        if (bubble.dataset.participantSeed !== seed) {
          const participantColor = getParticipantColor(seed);
          bubble.dataset.participantSeed = seed;
          bubble.style.background = `color-mix(in srgb, var(--dtsc-surface) 88%, ${participantColor.hex} 12%)`;
          bubble.style.borderColor = `color-mix(in srgb, var(--dtsc-border) 68%, ${participantColor.hex} 32%)`;
          bubble.style.color = "var(--dtsc-ink)";
          sender.style.color = participantColor.hex;
        }

        const messageRow = bubble.parentElement;
        if (!messageRow || messageRow.querySelector(":scope > [data-message-author-avatar]")) continue;
        const avatar = document.createElement("span");
        avatar.dataset.messageAuthorAvatar = "true";
        avatar.className = "dtsc-message-author-avatar";
        avatar.setAttribute("aria-hidden", "true");
        if (participant?.avatarUrl) {
          const image = document.createElement("img");
          image.src = participant.avatarUrl;
          image.alt = "";
          image.loading = "lazy";
          avatar.appendChild(image);
        } else {
          const initials = senderName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || "")
            .join("");
          avatar.textContent = initials || "•";
        }
        messageRow.prepend(avatar);
      }

      const textarea = root.querySelector<HTMLTextAreaElement>("main form textarea");
      const composer = textarea?.closest<HTMLElement>("form")?.parentElement;
      if (composer) composer.dataset.collaborationComposer = "true";
    };

    const apply = () => {
      compactContacts();
      applyConversationPolish();
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [participantsByName]);

  return (
    <div ref={rootRef} data-collaboration-immersive-root className="h-full min-h-0 min-w-0 overflow-hidden">
      <style>{`
        @media (max-width: 1023px) {
          [data-collaboration-immersive-root] > div {
            height: 100% !important;
            min-height: 0 !important;
          }
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] {
          width: 100%;
          min-width: 0;
          margin: 0;
          padding: 0.2rem 0.75rem 0.55rem;
          border: 0;
          border-radius: 0;
          background: transparent;
          overflow: hidden;
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] > div:first-child {
          display: none !important;
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] > div:last-child {
          gap: 0.75rem;
          padding: 0.2rem 0 0.1rem;
          scroll-snap-type: x proximity;
          overscroll-behavior-inline: contain;
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] > div:last-child > button {
          width: 4.25rem;
          min-width: 4.25rem;
          padding: 0.2rem;
          border-radius: 1rem;
          scroll-snap-align: start;
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] > div:last-child > button > span:last-child {
          display: none !important;
        }

        [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] > div:last-child > button > span:nth-last-child(2) {
          margin-top: 0.35rem;
          font-size: 0.68rem;
          line-height: 1rem;
        }

        [data-collaboration-immersive-root] main [data-message-id] {
          margin-block: 0.18rem;
          gap: 0.45rem;
        }

        [data-collaboration-immersive-root] main [data-collaboration-message-bubble="true"] {
          max-width: min(82%, 34rem);
          border-radius: 1.35rem;
          box-shadow: none;
        }

        [data-collaboration-immersive-root] main [data-message-id].justify-start [data-collaboration-message-bubble="true"] {
          border-bottom-left-radius: 0.38rem;
        }

        [data-collaboration-immersive-root] main [data-message-id].justify-end [data-collaboration-message-bubble="true"] {
          border-bottom-right-radius: 0.38rem;
        }

        [data-collaboration-immersive-root] .dtsc-message-author-avatar {
          display: grid;
          width: 2rem;
          height: 2rem;
          flex: 0 0 2rem;
          align-self: flex-end;
          place-items: center;
          overflow: hidden;
          border: 1px solid var(--dtsc-border);
          border-radius: 9999px;
          background: var(--dtsc-surface);
          color: var(--dtsc-muted);
          font-size: 0.65rem;
          font-weight: 900;
        }

        [data-collaboration-immersive-root] .dtsc-message-author-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        [data-collaboration-immersive-root] [data-collaboration-message-bubble="true"] > div > button:last-child {
          opacity: 0.38;
        }

        [data-collaboration-immersive-root] [data-collaboration-composer="true"] {
          position: relative;
          background: color-mix(in srgb, var(--dtsc-surface) 94%, transparent);
          backdrop-filter: blur(14px);
        }

        [data-collaboration-immersive-root] [data-collaboration-composer="true"] > .mb-2.flex.justify-end {
          position: absolute;
          z-index: 4;
          left: 0.7rem;
          bottom: calc(0.75rem + env(safe-area-inset-bottom));
          margin: 0;
        }

        [data-collaboration-immersive-root] [data-collaboration-composer="true"] > .mb-2.flex.justify-end > button {
          width: 2.75rem;
          min-width: 2.75rem;
          height: 2.75rem;
          padding: 0;
          border-radius: 9999px;
          font-size: 0;
        }

        [data-collaboration-immersive-root] [data-collaboration-composer="true"] > form {
          margin-left: 3.15rem;
          border-radius: 9999px;
        }

        @media (min-width: 640px) {
          [data-collaboration-immersive-root] [data-contact-avatar-rail="true"] {
            padding-inline: 1rem;
          }
          [data-collaboration-immersive-root] .dtsc-message-author-avatar {
            width: 2.15rem;
            height: 2.15rem;
            flex-basis: 2.15rem;
          }
        }
      `}</style>
      <CollaboratorsConversationWorkspace {...props} />
    </div>
  );
}
