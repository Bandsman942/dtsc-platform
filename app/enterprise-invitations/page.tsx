import { AppShell } from "@/components/layout/app-shell";
import { EnterpriseInvitationsClient, type EnterpriseInvitationItem } from "@/components/enterprise/enterprise-invitations-client";
import { requireUser } from "@/lib/auth";
import { getPendingEnterpriseInvitationsForUser } from "@/lib/enterprise-invitations";
import { prisma } from "@/lib/prisma";

export default async function EnterpriseInvitationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ organizationId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const highlightedOrganizationId = params?.organizationId || "";
  const invitations = await getPendingEnterpriseInvitationsForUser(user.id);
  const inviterIds = Array.from(new Set(invitations.map((invitation) => invitation.invitedBy).filter((value): value is string => Boolean(value))));
  const inviters = inviterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: inviterIds } },
        select: { id: true, name: true },
      })
    : [];
  const inviterById = new Map(inviters.map((inviter) => [inviter.id, inviter.name]));
  const invitationItems: EnterpriseInvitationItem[] = invitations.map((invitation) => ({
    id: invitation.id,
    organizationId: invitation.organizationId,
    organizationName: invitation.organization.name,
    organizationSlug: invitation.organization.slug,
    logoUrl: invitation.organization.logoUrl,
    role: invitation.role,
    invitedByName: invitation.invitedBy ? inviterById.get(invitation.invitedBy) || null : null,
    createdAt: invitation.createdAt.toISOString(),
    highlighted: invitation.organizationId === highlightedOrganizationId,
  }));

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <section className="dtsc-panel p-6">
          <p className="text-sm font-bold text-cyan-600">Accès entreprise</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-dtsc-ink">Invitations reçues</h1>
          <p className="mt-3 max-w-3xl leading-7 text-dtsc-muted">
            Acceptez ou refusez les invitations vers les espaces privés des entreprises clientes. Une entreprise ne devient disponible dans le sélecteur de contexte qu&apos;après acceptation explicite.
          </p>
        </section>
        <EnterpriseInvitationsClient invitations={invitationItems} />
      </div>
    </AppShell>
  );
}
