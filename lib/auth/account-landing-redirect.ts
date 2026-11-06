import type { SessionPayload } from "@/lib/session";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

type AccountLandingSearchParams = Record<string, string | string[] | undefined>;

/**
 * Only a session returned by the authoritative getSession() gateway may
 * short-circuit Account sign-in/sign-up. A signed cookie alone is insufficient:
 * it can outlive server-side revocation, membership removal or MFA recovery.
 */
export function resolveValidatedAccountLandingRedirect(
  session: SessionPayload | null,
  searchParams: AccountLandingSearchParams,
) {
  if (!session?.mfaVerifiedAt || searchParams.reason === "session-expired") return null;

  return resolvePostLoginRedirect({
    next: typeof searchParams.next === "string" ? searchParams.next : null,
    context: session.activeContext,
  });
}
