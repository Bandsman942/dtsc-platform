"use client";

import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

const MODULE_DEEPLINK_PATTERN = /\]\((\/modules\?open=[A-Za-z0-9_]+)\)/g;

export function resolveAssistantModuleDeeplinks(markdown: string, origin: string) {
  if (!origin) return markdown;
  return markdown.replace(MODULE_DEEPLINK_PATTERN, (_match, modulePath: string) => `](${origin}${modulePath})`);
}

export function AssistantMarkdown({ children }: { children: string }) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const content = useMemo(() => resolveAssistantModuleDeeplinks(children, origin), [children, origin]);

  return (
    <Streamdown
      className="min-w-0 [&_a]:font-bold [&_a]:text-cyan-600 [&_a]:underline [&_a]:decoration-cyan-400 [&_a]:underline-offset-2 [&_a]:transition-colors [&_a:hover]:text-cyan-700 [&_a:focus-visible]:rounded-sm [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-cyan-400/70 dark:[&_a]:text-cyan-300 dark:[&_a:hover]:text-cyan-200"
    >
      {content}
    </Streamdown>
  );
}
