import { notFound, redirect } from "next/navigation";
import { MobileMoneyAgencyWorkspace } from "@/components/enterprise/professional/mobile-money-agency-workspace";
import { RetailActiveCustomerBar } from "@/components/enterprise/professional/retail-active-customer-bar";
import { RetailDailyCloseWorkspace } from "@/components/enterprise/professional/retail-daily-close-workspace";
import { RetailDeviceReadiness } from "@/components/enterprise/professional/retail-device-readiness";
import { RetailExpiryAlertsPanel } from "@/components/enterprise/professional/retail-expiry-alerts-panel";
import { RetailFeatureActivationPanel } from "@/components/enterprise/professional/retail-feature-activation-panel";
import { RetailGlobalReadiness } from "@/components/enterprise/professional/retail-global-readiness";
import { RetailHistoricalImportPanel } from "@/components/enterprise/professional/retail-historical-import-panel";
import { RetailInvoiceFlowWorkbench } from "@/components/enterprise/professional/retail-invoice-flow-workbench";
import { RetailInventoryPolicySettings } from "@/components/enterprise/professional/retail-inventory-policy-settings";
import { RetailOfflineContinuity } from "@/components/enterprise/professional/retail-offline-continuity";
import { RetailOmnichannelPanel } from "@/components/enterprise/professional/retail-omnichannel-panel";
import { RetailPaymentFollowup } from "@/components/enterprise/professional/retail-payment-followup";
import { RetailPosDtscWorkspace as RetailPosWorkspace } from "@/components/enterprise/professional/retail-pos-dtsc-workspace";
import { getRetailPosSection, RetailPosSectionDetail, RetailPosSectionDirectory } from "@/components/enterprise/professional/retail-pos-section-navigation";
import { RetailSiteOverview } from "@/components/enterprise/professional/retail-site-overview";
import { RetailSiteStaffAccess } from "@/components/enterprise/professional/retail-site-staff-access";
import { TelcoTopupsWorkspace } from "@/components/enterprise/professional/telco-topups-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export async function renderRetailModulePage(moduleCode: "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE", options?: { section?: string }) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const access = await resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "read" });
  if (!access.allowed || !access.definition || access.definition.code !== moduleCode) notFound();

  const [membership, organization, manageAccess] = await Promise.all([
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT", sectorCode: "COMMERCE_RETAIL" },
      select: { name: true },
    }),
    moduleCode === "RETAIL_DAILY_CLOSE"
      ? resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "manage" })
      : Promise.resolve(null),
  ]);
  if (!membership || !organization) notFound();

  const locale: "fr" | "en" = user.locale === "en" ? "en" : "fr";
  const canManagePos = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role);
  const posSection = moduleCode === "RETAIL_POS" ? getRetailPosSection(options?.section, canManagePos) : undefined;
  if (moduleCode === "RETAIL_POS" && options?.section && !posSection) notFound();

  return (
    <AppShell user={user} hideContextualBack={moduleCode === "RETAIL_POS"}>
      <div className="space-y-4">
        {moduleCode === "RETAIL_DAILY_CLOSE" ? (
          <RetailDailyCloseWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : moduleCode === "RETAIL_POS" ? (
          posSection ? (
            <RetailPosSectionDetail locale={locale} section={posSection}>
              {posSection.id === "checkout" ? (
                <RetailPosWorkspace organizationId={organizationId} organizationName={organization.name} definition={access.definition} />
              ) : posSection.id === "customers" ? (
                <RetailActiveCustomerBar organizationId={organizationId} />
              ) : posSection.id === "sites" ? (
                <RetailSiteOverview organizationId={organizationId} locale={locale} />
              ) : posSection.id === "staff" ? (
                <RetailSiteStaffAccess organizationId={organizationId} locale={locale} />
              ) : posSection.id === "invoices" ? (
                <RetailInvoiceFlowWorkbench organizationId={organizationId} locale={locale} />
              ) : posSection.id === "offline" ? (
                <RetailOfflineContinuity organizationId={organizationId} locale={locale} />
              ) : posSection.id === "omnichannel" ? (
                <RetailOmnichannelPanel organizationId={organizationId} locale={locale} />
              ) : posSection.id === "payments" ? (
                <RetailPaymentFollowup organizationId={organizationId} locale={locale} />
              ) : posSection.id === "equipment" ? (
                <RetailDeviceReadiness organizationId={organizationId} locale={locale} />
              ) : posSection.id === "readiness" ? (
                <RetailGlobalReadiness organizationId={organizationId} locale={locale} />
              ) : posSection.id === "activation" ? (
                <RetailFeatureActivationPanel organizationId={organizationId} locale={locale} />
              ) : posSection.id === "inventory" ? (
                <RetailInventoryPolicySettings organizationId={organizationId} locale={locale} />
              ) : posSection.id === "alerts" ? (
                <RetailExpiryAlertsPanel organizationId={organizationId} locale={locale} />
              ) : null}
            </RetailPosSectionDetail>
          ) : <RetailPosSectionDirectory locale={locale} canManage={canManagePos} />
        ) : moduleCode === "MOBILE_MONEY_AGENCY" ? (
          <MobileMoneyAgencyWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : (
          <TelcoTopupsWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        )}

        {moduleCode === "RETAIL_DAILY_CLOSE" ? (
          <RetailHistoricalImportPanel organizationId={organizationId} canManage={Boolean(manageAccess?.allowed)} />
        ) : null}

      </div>
    </AppShell>
  );
}
