import Link from "next/link";
import { BriefcaseBusiness, Building2, FileText, ShieldCheck, UserPlus } from "lucide-react";
import { SubscriptionStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyManager } from "@/components/company/company-manager";
import { DocumentManager } from "@/components/documents/document-manager";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BusinessList, BusinessListItem } from "@/components/workspace/business-list";
import { EmptyState } from "@/components/workspace/empty-state";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { getSession, requireUser } from "@/lib/auth";
import { getPendingEnterpriseInvitationsForUser } from "@/lib/enterprise-invitations";
import { listUserIdentityLinks } from "@/lib/enterprise/identity-links/service";
import { formatEnumLabel } from "@/lib/labels";
import { getActiveOrganizationId } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export default async function CompanyPage() {
  const user = await requireUser();
  const session = await getSession();
  const activeOrganizationId = getActiveOrganizationId(session);
  const [profile, activities, documents, activeSubscription, memberships, pendingInvitations, identityLinks] = await Promise.all([
    prisma.companyProfile.findFirst({ where: { userId: user.id, organizationId: activeOrganizationId } }),
    prisma.companyActivity.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.knowledgeDocument.findMany({
      where: { userId: user.id, organizationId: activeOrganizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
      take: 100,
    }),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        status: "ACTIVE",
        removedAt: null,
        organization: { status: "ACTIVE", deletedAt: null },
      },
      select: {
        role: true,
        joinedAt: true,
        organization: { select: { id: true, name: true, organizationType: true, sectorCode: true } },
      },
      orderBy: { organization: { name: "asc" } },
      take: 30,
    }),
    getPendingEnterpriseInvitationsForUser(user.id),
    listUserIdentityLinks(user.id),
  ]);

  const readyDocuments = documents.filter((document) => document.status === "READY").length;
  const documentCapacity = activeSubscription?.plan.maxDocuments ?? 0;
  const activeRelationships = identityLinks.filter((identityLink) => identityLink.status === "ACTIVE");
  const pendingRelationships = identityLinks.filter((identityLink) => identityLink.status !== "ACTIVE" && !["REVOKED", "CANCELLED", "DECLINED", "EXPIRED"].includes(identityLink.status));

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Entreprise du compte"
          title="Profil professionnel, organisations et relations"
          count={profile?.organizationName || "Profil à compléter"}
          description="Le profil professionnel déclaré, une organisation cliente, un membership, une relation d’entreprise et le contexte actif sont des concepts distincts. Cette page les présente sans fusionner leurs sources de vérité."
          secondaryActions={(
            <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft">
              <Link href="/help/standard?guide=company">Guide Entreprise</Link>
            </Button>
          )}
        />
        <ModuleMetrics label="Indicateurs du compte entreprise">
          <ModuleMetric label="Profil déclaré" value={profile ? "Actif" : "Incomplet"} hint={<span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />Contexte professionnel</span>} />
          <ModuleMetric label="Organisations rejointes" value={memberships.length} hint="Memberships actifs" />
          <ModuleMetric label="Invitations" value={pendingInvitations.length} hint="Avant adhésion" />
          <ModuleMetric label="Relations actives" value={activeRelationships.length} hint="Moteur canonique" />
          <ModuleMetric label="Relations en attente" value={pendingRelationships.length} hint="Consentement ou décision" />
          <ModuleMetric label="Documents prêts" value={`${readyDocuments}/${documents.length}`} hint={<span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Base privée</span>} />
        </ModuleMetrics>
        <ModuleContent>
          <ModuleSection title="Modèle du compte" description="Les données éditables par l’utilisateur restent séparées des données administrées par une organisation.">
            <BusinessList ariaLabel="Distinctions du modèle entreprise">
              <BusinessListItem leading={<BriefcaseBusiness className="h-5 w-5 text-cyan-600" />} title="Profil professionnel déclaré" description="Informations que vous renseignez pour contextualiser votre compte et votre assistant privé. Elles ne créent ni organisation ni permission." status={<StatusBadge>Éditable par vous</StatusBadge>} />
              <BusinessListItem leading={<Building2 className="h-5 w-5 text-cyan-600" />} title="Organisation cliente DTSC" description="Espace multi-tenant administré selon les rôles, les permissions, l’abonnement et les modules actifs." status={<StatusBadge tone="warning">Contrôlé</StatusBadge>} />
              <BusinessListItem leading={<ShieldCheck className="h-5 w-5 text-cyan-600" />} title="Membership et contexte actif" description="Le membership autorise la sélection d’un espace. Le contexte actif détermine les données et modules consultables à cet instant." status={<StatusBadge tone="success">Vérifié côté serveur</StatusBadge>} />
              <BusinessListItem leading={<UserPlus className="h-5 w-5 text-cyan-600" />} title="Relation avec une entreprise" description="Identité relationnelle et consentement. Une relation active n’accorde aucun accès ERP, médical, financier ou administratif automatique." status={<StatusBadge>Moteur canonique</StatusBadge>} />
            </BusinessList>
          </ModuleSection>

          <Accordion>
            <AccordionItem title="Profil professionnel et activités" defaultOpen>
              <CompanyManager
                initialProfile={profile ? JSON.parse(JSON.stringify(profile)) : null}
                initialActivities={JSON.parse(JSON.stringify(activities))}
              />
            </AccordionItem>

            <AccordionItem title="Organisations rejointes">
              {memberships.length ? (
                <BusinessList ariaLabel="Organisations rejointes">
                  {memberships.map((membership) => (
                    <BusinessListItem
                      key={membership.organization.id}
                      title={membership.organization.name}
                      description={`${formatEnumLabel(membership.organization.organizationType)}${membership.organization.sectorCode ? ` · ${formatEnumLabel(membership.organization.sectorCode)}` : ""}`}
                      meta={membership.joinedAt ? `Rejointe le ${membership.joinedAt.toLocaleDateString("fr-FR")}` : "Membership actif"}
                      status={<StatusBadge tone={membership.organization.id === activeOrganizationId ? "success" : "neutral"}>{membership.organization.id === activeOrganizationId ? "Contexte actif" : formatEnumLabel(membership.role)}</StatusBadge>}
                    />
                  ))}
                </BusinessList>
              ) : <EmptyState compact title="Aucune organisation rejointe" description="Une organisation devient accessible uniquement après acceptation d’une invitation valide." />}
            </AccordionItem>

            <AccordionItem title="Invitations et relations">
              <div className="min-w-0 space-y-5">
                {pendingInvitations.length ? (
                  <BusinessList ariaLabel="Invitations entreprise en attente">
                    {pendingInvitations.map((invitation) => (
                      <BusinessListItem
                        key={invitation.id}
                        title={invitation.organization.name}
                        description={`Rôle proposé : ${formatEnumLabel(invitation.role)}`}
                        meta={invitation.createdAt.toLocaleString("fr-FR")}
                        status={<StatusBadge tone="warning">Invitation reçue</StatusBadge>}
                        actions={<Link href={`/enterprise-invitations?organizationId=${encodeURIComponent(invitation.organizationId)}`} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-black text-dtsc-blue hover:bg-dtsc-soft">Examiner</Link>}
                      />
                    ))}
                  </BusinessList>
                ) : <EmptyState compact title="Aucune invitation en attente" />}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-invitations">Gérer les invitations</Link></Button>
                  <Button asChild variant="outline" className="rounded-xl border-dtsc-border bg-dtsc-surface text-dtsc-blue hover:bg-dtsc-soft"><Link href="/enterprise-links">Gérer les relations</Link></Button>
                </div>
              </div>
            </AccordionItem>

            <AccordionItem title="Base documentaire privée du chatbot">
              <DocumentManager
                maxDocuments={documentCapacity}
                initialDocuments={documents.map((document) => ({
                  id: document.id,
                  title: document.title,
                  fileName: document.fileName,
                  mimeType: document.mimeType,
                  sizeBytes: document.sizeBytes,
                  status: document.status,
                  errorMessage: document.errorMessage,
                  createdAt: document.createdAt.toISOString(),
                  _count: document._count,
                }))}
              />
            </AccordionItem>
          </Accordion>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
