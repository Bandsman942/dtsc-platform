import Link from "next/link";
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
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4 shadow-sm">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Compte global</p>
            <h1 className="mt-1 text-xl font-black text-dtsc-ink">Relations avec les entreprises</h1>
            <p className="mt-1 text-sm leading-6 text-dtsc-muted">Demandes, consentements, activations et révocations provenant du moteur canonique de relations.</p>
          </div>
          <Link href="/help/standard?guide=company-relationships" className="inline-flex min-h-11 items-center rounded-xl border border-dtsc-border bg-dtsc-surface px-4 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">
            Guide des Relations
          </Link>
        </div>
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
      </div>
    </AppShell>
  );
}
