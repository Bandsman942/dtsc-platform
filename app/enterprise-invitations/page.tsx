import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EnterpriseInvitationsClient, type EnterpriseInvitationItem } from "@/components/enterprise/enterprise-invitations-client";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { requireUser } from "@/lib/auth";
import { getPendingEnterpriseInvitationsForUser } from "@/lib/enterprise-invitations";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export default async function EnterpriseInvitationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ organizationId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const highlightedOrganizationId = params?.organizationId || "";
  const [invitations, invitationHistory] = await Promise.all([
    getPendingEnterpriseInvitationsForUser(user.id),
    prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: { in: ["ACTIVE", "REMOVED", "SUSPENDED"] },
        organization: { organizationType: "CLIENT" },
      },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        removedAt: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);
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
  const acceptedCount = invitationHistory.filter((item) => item.status === "ACTIVE").length;
  const declinedCount = invitationHistory.filter((item) => item.status === "REMOVED").length;

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Compte global"
          title="Invitations entreprise"
          count={`${invitations.length} en attente`}
          description="Examinez les invitations à rejoindre une organisation avant toute adhésion. Elles restent visibles dans le compte personnel et ne nécessitent jamais l’activation préalable de l’organisation concernée."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=invitations">Guide des Invitations</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Synthèse des invitations">
          <ModuleMetric label="À traiter" value={invitations.length} hint="Reçues et valides" />
          <ModuleMetric label="Memberships actifs" value={acceptedCount} hint="Invitations acceptées" />
          <ModuleMetric label="Refusées ou retirées" value={declinedCount} hint="Historique conservé" />
          <ModuleMetric label="Historique" value={invitationHistory.length} hint="30 événements récents" />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Invitations reçues" description="L’acceptation et le refus sont protégés, audités et idempotents.">
            <EnterpriseInvitationsClient invitations={invitationItems} />
          </ModuleSection>
          <ModuleSection title="Historique récent" description="L’historique distingue les memberships actifs, refusés, retirés ou suspendus sans réactiver une ancienne invitation.">
            {invitationHistory.length ? (
              <BusinessList ariaLabel="Historique des invitations entreprise">
                {invitationHistory.map((item) => (
                  <BusinessListItem
                    key={item.id}
                    title={item.organization.name}
                    description={`Rôle ${formatEnumLabel(item.role)} · Organisation ${formatEnumLabel(item.organization.status)}`}
                    meta={`${item.joinedAt ? `Rejointe le ${item.joinedAt.toLocaleDateString("fr-FR")}` : item.removedAt ? `Retirée le ${item.removedAt.toLocaleDateString("fr-FR")}` : `Mise à jour le ${item.updatedAt.toLocaleDateString("fr-FR")}`}`}
                    status={<StatusBadge tone={item.status === "ACTIVE" ? "success" : item.status === "SUSPENDED" ? "warning" : "neutral"}>{formatEnumLabel(item.status)}</StatusBadge>}
                  />
                ))}
              </BusinessList>
            ) : <EmptyState compact title="Aucun historique d’invitation" />}
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
