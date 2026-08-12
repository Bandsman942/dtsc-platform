import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactDiscoveryWorkspace } from "@/components/collaborators/contact-discovery-workspace";
import { SaasAccessNotice } from "@/components/enterprise/saas-access-notice";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { canUseFeature, getOrganizationEntitlements } from "@/lib/billing/entitlements";
import { translateSharedWork } from "@/lib/i18n";
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
            title={translateSharedWork(user.locale, "collaboration.unavailable")}
            message={featureAccess.message}
            planLabel={entitlements?.planLabel}
            subscriptionStatus={entitlements?.subscriptionStatus}
          />
        </AppShell>
      );
    }
  }

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow={translateSharedWork(user.locale, "collaboration.contact.pageEyebrow")}
          title={translateSharedWork(user.locale, "collaboration.addContact")}
          description={translateSharedWork(user.locale, "collaboration.contact.pageDescription")}
          primaryAction={(
            <Button asChild type="button" variant="outline" className="rounded-xl">
              <Link href="/collaborators"><ArrowLeft className="h-4 w-4" />{translateSharedWork(user.locale, "collaboration.contact.backToDiscussions")}</Link>
            </Button>
          )}
        />
        <ModuleContent>
          <ModuleSection
            title={translateSharedWork(user.locale, "collaboration.contact.directoryTitle")}
            description={translateSharedWork(user.locale, "collaboration.contact.directoryDescription")}
          >
            <ContactDiscoveryWorkspace locale={user.locale} currentUserRole={user.role} />
          </ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
