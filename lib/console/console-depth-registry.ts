import type { ConsoleSectionId } from "@/lib/console/console-routes";

/**
 * Deep-console pages may be opened as independent sub-workspaces without
 * inventing new backend endpoints. Only canonical, rendered subsection IDs
 * are accepted; this prevents malformed URLs from hiding arbitrary content.
 */
export const CONSOLE_SUBSECTION_REGISTRY: Partial<Record<ConsoleSectionId, readonly string[]>> = {
  overview: ["platform-indicators"],
  "ai-control-center": ["ai-models", "ai-connectors", "ai-safety"],
  "platform-settings": ["platform-preferences", "platform-flags"],
  users: ["users-create", "users-newsletter", "users-list"],
  subscriptions: ["billing-plans", "billing-manual", "billing-subscriptions"],
  "security-audit": ["security-incidents", "security-traces"],
} as const;

export function resolveConsoleFocus(section: ConsoleSectionId, requested: string | null | undefined) {
  if (!requested) return null;
  const normalized = requested.trim();
  return CONSOLE_SUBSECTION_REGISTRY[section]?.includes(normalized) ? normalized : null;
}
