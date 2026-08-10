"use client";

import type { ReactNode } from "react";
import { AiAgentRunDock } from "@/components/chat/ai-agent-run-dock";
import { useImmersiveConversationViewport } from "@/components/chat/use-immersive-conversation-viewport";
import { cn } from "@/lib/utils";

type AssistantWorkspaceVariant = "chatbot" | "enterprise";

export function AssistantImmersiveWorkspaceShell({
  children,
  variant,
  className,
}: {
  children: ReactNode;
  variant: AssistantWorkspaceVariant;
  className?: string;
}) {
  useImmersiveConversationViewport();

  return (
    <div
      data-collaboration-immersive-root
      data-assistant-immersive-root
      data-assistant-immersive-variant={variant}
      className={cn(
        "h-full min-h-0 min-w-0 overflow-hidden lg:h-[calc(100vh-7rem)]",
        className
      )}
    >
      <style>{`
        [data-assistant-immersive-root] > :last-child {
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
        }

        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child {
          display: flex !important;
          min-width: 0;
          flex-direction: column;
          overflow: hidden !important;
        }

        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > div:first-child,
        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > nav {
          flex: 0 0 auto;
        }

        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > section.relative.grid {
          height: auto !important;
          min-height: 0 !important;
          flex: 1 1 0%;
        }

        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > section:not(.relative),
        [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > form {
          min-height: 0;
          flex: 1 1 0%;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 1023px) {
          [data-assistant-immersive-root] > :last-child {
            width: 100% !important;
          }

          [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > section:not(.relative),
          [data-assistant-immersive-root][data-assistant-immersive-variant="enterprise"] > :last-child > form {
            padding-bottom: calc(5.75rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
      {children}
      <AiAgentRunDock variant={variant} />
    </div>
  );
}
