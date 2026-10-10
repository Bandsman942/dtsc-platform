import { redirect } from "next/navigation";
import { RelationshipBenefitsAdminWorkspace } from "@/components/enterprise/relationship-benefits/relationship-benefits-admin-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { getDashboardUrl } from "@/lib/domains";
import { canUseModule } from "@/lib/billing/entitlements";
import { listEnterpriseCurrencies } from "@/lib/enterprise/accounting/currency-service";
import { getEnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";
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

  const [{ usage }, dataset, links, currencies, retailAccess] = await Promise.all([
    searchParams,
    listRelationshipBenefitsForAdmin(organizationId),
    listAssignableRelationshipLinks(organizationId),
    listEnterpriseCurrencies(organizationId),
    canUseModule(organizationId, "RETAIL_POS"),
  ]);
  const retailDefinition = retailAccess.allowed
    ? getEnterpriseModuleDefinition("RETAIL_POS")
    : null;
  const supportedTargets = retailDefinition
    ? [{
        code: retailDefinition.code,
        label: user.locale === "en" ? retailDefinition.labelEn : retailDefinition.labelFr,
      }]
    : [];

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
        currencyOptions={currencies.map((currency) => ({
          code: currency.code,
          label: `${currency.code} · ${currency.name}`,
        }))}
        supportedTargets={supportedTargets}
      />
    </AppShell>
  );
}
