import { redirect } from "next/navigation";
import { RelationshipBenefitsAdminWorkspace } from "@/components/enterprise/relationship-benefits/relationship-benefits-admin-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { getDashboardUrl } from "@/lib/domains";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import {
  listAssignableRelationshipLinks,
  listRelationshipBenefitsForAdmin,
} from "@/lib/enterprise/relationship-benefits/service";

export default async function EnterpriseRelationshipBenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ usage?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId =
    session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect(getDashboardUrl());

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: user.id,
    organizationId,
    moduleCode: "RELATIONSHIP_BENEFITS",
  });
  if (!capabilities.canRead) redirect(getDashboardUrl());

  const [{ usage }, dataset, links] = await Promise.all([
    searchParams,
    listRelationshipBenefitsForAdmin(organizationId),
    listAssignableRelationshipLinks(organizationId),
  ]);

  return (
    <AppShell user={user}>
      <RelationshipBenefitsAdminWorkspace
        organizationId={organizationId}
        locale={user.locale}
        canManage={capabilities.canManage}
        focusedUsageId={usage}
        initialBenefits={dataset.benefits}
        initialUsages={dataset.usages}
        relationshipLinks={links}
      />
    </AppShell>
  );
}
