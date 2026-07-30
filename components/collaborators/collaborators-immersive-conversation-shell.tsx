"use client";

import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { useImmersiveConversationViewport } from "@/components/chat/use-immersive-conversation-viewport";
import { CollaboratorsConversationWorkspace } from "@/components/collaborators/collaborators-conversation-workspace";
import { getParticipantColor } from "@/lib/participant-colors";

type Props = ComponentProps<typeof CollaboratorsConversationWorkspace>;

export function CollaboratorsImmersiveConversationShell(props: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useImmersiveConversationViewport();

  const participantIdsByName = useMemo(() => {
    const values = new Map<string, string>();
    const duplicates = new Set<string>();
    const register = (name: string, id: string) => {
      const normalized = name.trim();
      if (!normalized) return;
      const existing = values.get(normalized);
      if (existing && existing !== id) duplicates.add(normalized);
      else values.set(normalized, id);
    };
    for (const user of props.users) register(user.name, user.id);
    for (const group of props.initialGroups) {
      for (const member of group.members) register(member.user.name, member.userId);
    }
    for (const duplicate of duplicates) values.delete(duplicate);
    return values;
  }, [props.initialGroups, props.users]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const applyParticipantColors = () => {
      const bubbles = root.querySelectorAll<HTMLElement>("main .group.relative");
      for (const bubble of bubbles) {
        const sender = bubble.querySelector<HTMLParagraphElement>("p.mb-1.font-black");
        const senderName = sender?.textContent?.trim();
        if (!sender || !senderName) continue;
        const seed = participantIdsByName.get(senderName) || senderName;
        if (bubble.dataset.participantSeed === seed) continue;
        const participantColor = getParticipantColor(seed);
        bubble.dataset.participantSeed = seed;
        bubble.style.background = `color-mix(in srgb, var(--dtsc-surface) 84%, ${participantColor.hex} 16%)`;
        bubble.style.borderColor = `color-mix(in srgb, var(--dtsc-border) 58%, ${participantColor.hex} 42%)`;
        bubble.style.color = "var(--dtsc-ink)";
        sender.style.color = participantColor.hex;
      }
    };

    applyParticipantColors();
    const observer = new MutationObserver(applyParticipantColors);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [participantIdsByName]);

  return (
    <div ref={rootRef} data-collaboration-immersive-root className="h-full min-h-0 min-w-0 overflow-hidden">
      <style>{`
        @media (max-width: 1023px) {
          [data-collaboration-immersive-root] > div {
            height: 100% !important;
            min-height: 0 !important;
          }
        }
      `}</style>
      <CollaboratorsConversationWorkspace {...props} />
    </div>
  );
}
