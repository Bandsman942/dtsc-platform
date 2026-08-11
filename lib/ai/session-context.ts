import type { AiContextCode } from "@/lib/ai/types";
import type { SessionPayload } from "@/lib/session";

export function resolveAiSessionContext(
  session: Pick<SessionPayload, "activeContext" | "activeOrganizationId"> | null | undefined,
): AiContextCode {
  if (session?.activeContext === "DTSC_INTERNAL") return "DTSC_INTERNAL";
  if (session?.activeContext === "ORGANIZATION" && session.activeOrganizationId) return "ORGANIZATION";
  return "PERSONAL";
}
