import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactDiscoveryWorkspace } from "@/components/collaborators/contact-discovery-workspace";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { DTSC_INTERNAL_ORGANIZATION_ID, getActiveOrganizationId } from "@/lib/organizations";

export default async function AddCollaborationContactPage() {
  const user = await requireUser();
  const session = await getSession();
  if (!session) throw new Error("SESSION_REQUIRED");

  const activeOrganizationId = getActiveOrganizationId(session);
  if (activeOrganizationId && activeOrganizationId !== DTSC_INTERNAL_ORGANIZATION_ID) {
    const featureAccess = await canUseFeature(activeOrganizationId, "collaborators");
    if (!featureAccess.allowed) {
      const entitlements = await getOrganizationEntitlements(activeOrganizationId);
      return (
        <AppShell user={user}>
          <SaasAccessNotice
            title="Collaboration indisponible"
            message={featureAccess.message}
            planLabel={entitlements?.planLabel}
            subscriptionStatus={entitlements?.subscriptionStatus}
          />
        </AppShell>
      );
    }
  }

  const english = user.locale === "en";
  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={english ? "Professional contacts" : "Contacts professionnels"}
          title={english ? "Add a contact" : "Ajouter un contact"}
          description={english ? "Find a discoverable DTSC Platform profile, send a contact invitation and manage pending invitations without leaving the collaboration security model." : "Recherchez un profil DTSC Platform découvrable, envoyez une invitation de contact et gérez les invitations en attente sans quitter le modèle de sécurité de la collaboration."}
          primaryActions={(
            <Button asChild type="button" variant="outline" className="rounded-xl">
              <Link href="/collaborators"><ArrowLeft className="h-4 w-4" />{english ? "Back to discussions" : "Retour aux discussions"}</Link>
            </Button>
          )}
        />
        <ModuleContent>
          <ModuleSection
            title={english ? "Contact directory" : "Répertoire des contacts"}
            description={english ? "Invitations use the existing DTSC collaboration contact request workflow; no separate address book is created." : "Les invitations utilisent le workflow de demandes de contact DTSC existant ; aucun carnet d’adresses parallèle n’est créé."}
          >
            <ContactDiscoveryWorkspace locale={user.locale} currentUserRole={user.role} />
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
