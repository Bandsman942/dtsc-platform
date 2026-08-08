import { notFound, redirect } from "next/navigation";
import { RetailActiveCustomerBar } from "@/components/enterprise/professional/retail-active-customer-bar";
import { RetailDeviceReadiness } from "@/components/enterprise/professional/retail-device-readiness";
import { EnterpriseRetailShopWorkspace } from "@/components/enterprise/professional/enterprise-retail-shop-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export async function renderRetailModulePage(moduleCode: "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE") {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const access = await resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "read" });
  if (!access.allowed || !access.definition || access.definition.code !== moduleCode) notFound();

  const [membership, organization] = await Promise.all([
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { name: true },
    }),
  ]);
  if (!membership || !organization) notFound();

  const locale: "fr" | "en" = user.locale === "en" ? "en" : "fr";

  return (
    <AppShell user={user}>
      <div className="space-y-4">
        {moduleCode === "RETAIL_POS" ? <RetailActiveCustomerBar organizationId={organizationId} /> : null}
        {moduleCode === "RETAIL_POS" ? <RetailDeviceReadiness organizationId={organizationId} locale={locale} /> : null}
        <EnterpriseRetailShopWorkspace
          organizationId={organizationId}
          organizationName={organization.name}
          definition={access.definition}
        />
      </div>
    </AppShell>
  );
}
