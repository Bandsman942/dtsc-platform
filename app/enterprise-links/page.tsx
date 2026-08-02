import { EnterpriseIdentityUserPanel } from "@/components/enterprise/identity-links/enterprise-identity-user-panel";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { getEnterpriseIdentityInvitationPreview } from "@/lib/enterprise/identity-links/queries";
import { listUserIdentityLinks } from "@/lib/enterprise/identity-links/service";

export default async function EnterpriseLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; link?: string; view?: string }>;
}) {
  const user = await requireUser();
  const { token, link, view } = await searchParams;
  const [links, invitation] = await Promise.all([
    listUserIdentityLinks(user.id),
    token
      ? getEnterpriseIdentityInvitationPreview({ token, userId: user.id }).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <AppShell user={user}>
      <EnterpriseIdentityUserPanel
        token={token}
        focusedLinkId={link}
        initialView={view}
        invitation={
          invitation
            ? {
                ...invitation,
                expiresAt: invitation.expiresAt?.toISOString() || null,
              }
            : null
        }
        initialLinks={links.map((identityLink) => ({
          id: identityLink.id,
          organizationId: identityLink.organizationId,
          origin: identityLink.origin,
          requestedRelationType: identityLink.requestedRelationType,
          requestedRoleCode: identityLink.requestedRoleCode,
          status: identityLink.status,
          purpose: identityLink.purpose,
          revision: identityLink.revision,
          createdAt: identityLink.createdAt.toISOString(),
          expiresAt: identityLink.expiresAt?.toISOString() || null,
          activatedAt: identityLink.activatedAt?.toISOString() || null,
          revokedAt: identityLink.revokedAt?.toISOString() || null,
          cancelledAt: identityLink.cancelledAt?.toISOString() || null,
          organization: identityLink.organization,
          person: identityLink.person,
        }))}
      />
    </AppShell>
  );
}
