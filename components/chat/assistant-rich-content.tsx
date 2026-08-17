"use client";

import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { ASSISTANT_LINK_STYLES, resolveAssistantModuleDeeplinks } from "@/components/chat/assistant-markdown";
import { cn } from "@/lib/utils";

export function AssistantRichContent({ content, className }: { content: string; className?: string }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const resolvedContent = useMemo(
    () => (origin ? resolveAssistantModuleDeeplinks(content, origin) : content),
    [content, origin],
  );

  return (
    <div className={cn("dtsc-assistant-markdown min-w-0 leading-7", ASSISTANT_LINK_STYLES, className)}>
      <Streamdown>{resolvedContent}</Streamdown>
    </div>
  );
}
