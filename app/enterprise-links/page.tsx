import { EnterpriseIdentityUserPanel } from "@/components/enterprise/identity-links/enterprise-identity-user-panel";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { getEnterpriseIdentityInvitationPreview } from "@/lib/enterprise/identity-links/queries";
import { listUserIdentityLinks } from "@/lib/enterprise/identity-links/service";

export default async function EnterpriseLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await requireUser();
  const { token } = await searchParams;
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
        invitation={
          invitation
            ? {
                ...invitation,
                expiresAt: invitation.expiresAt?.toISOString() || null,
              }
            : null
        }
        initialLinks={links.map((link) => ({
          id: link.id,
          organizationId: link.organizationId,
          requestedRelationType: link.requestedRelationType,
          requestedRoleCode: link.requestedRoleCode,
          status: link.status,
          purpose: link.purpose,
          revision: link.revision,
          createdAt: link.createdAt.toISOString(),
          activatedAt: link.activatedAt?.toISOString() || null,
          revokedAt: link.revokedAt?.toISOString() || null,
          organization: link.organization,
          person: link.person,
        }))}
      />
    </AppShell>
  );
}
