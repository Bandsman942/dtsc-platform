import { notFound, redirect } from "next/navigation";
import { MobileMoneyAgencyWorkspace } from "@/components/enterprise/professional/mobile-money-agency-workspace";
import { RetailDailyCloseWorkspace } from "@/components/enterprise/professional/retail-daily-close-workspace";
import { RetailDeviceReadiness } from "@/components/enterprise/professional/retail-device-readiness";
import { RetailExpiryAlertsPanel } from "@/components/enterprise/professional/retail-expiry-alerts-panel";
import { RetailFeatureActivationPanel } from "@/components/enterprise/professional/retail-feature-activation-panel";
import { RetailGlobalReadiness } from "@/components/enterprise/professional/retail-global-readiness";
import { RetailHistoricalImportPanel } from "@/components/enterprise/professional/retail-historical-import-panel";
import { RetailInvoiceFlowWorkbench } from "@/components/enterprise/professional/retail-invoice-flow-workbench";
import { RetailInvoiceApprovalWorkbench } from "@/components/enterprise/professional/retail-invoice-approval-workbench";
import { RetailInvoiceCashierWorkbench } from "@/components/enterprise/professional/retail-invoice-cashier-workbench";
import { RetailInventoryPolicySettings } from "@/components/enterprise/professional/retail-inventory-policy-settings";
import { RetailMultiStoreOnboarding, RetailMyStores } from "@/components/enterprise/professional/retail-multi-store-onboarding";
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
import { formatEnterpriseBusinessDate } from "@/lib/enterprise/business-context";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";
import { siteStaffCapabilities } from "@/lib/enterprise/retail/site-access";

export async function renderRetailModulePage(moduleCode: "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE", options?: { section?: string; siteId?: string }) {
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
      select: { name: true, timezone: true },
    }),
    moduleCode === "RETAIL_DAILY_CLOSE"
      ? resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode, action: "manage" })
      : Promise.resolve(null),
  ]);
  if (!membership || !organization) notFound();

  const locale: "fr" | "en" = user.locale === "en" ? "en" : "fr";
  const canManagePos = ["OWNER", "ADMIN_ENTREPRISE", "ADMIN_ENTERPRISE"].includes(membership.role);
  const posAssignments = moduleCode === "RETAIL_POS" && !canManagePos
    ? await prisma.enterpriseRetailSiteAssignment.findMany({
      where: { organizationId, userId: user.id, isActive: true, site: { status: "ACTIVE", archivedAt: null } },
      select: { siteId: true, roleCode: true, permissionsJson: true }, take: 500,
    })
    : [];
  const posCapabilities = new Set<string>(posAssignments.flatMap((assignment) => siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson)));
  if (moduleCode === "RETAIL_POS") {
    const [approve, post] = await Promise.all([
      resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "approve" }),
      resolveEnterpriseModuleAccess({ userId: user.id, organizationId, moduleCode: "FINANCE_RECEIVABLES", action: "manage" }),
    ]);
    if (approve.allowed || post.allowed || posCapabilities.has("ISSUE_INVOICE")) posCapabilities.add("INVOICE_WORKFLOW");
  }
  const posConfiguration = moduleCode === "RETAIL_POS"
    ? await prisma.enterpriseRetailConfiguration.findUnique({ where: { organizationId }, select: { settingsJson: true } }) : null;
  const invoiceCheckoutEnabled = Boolean(posConfiguration?.settingsJson && typeof posConfiguration.settingsJson === "object" && !Array.isArray(posConfiguration.settingsJson) && posConfiguration.settingsJson.invoiceCheckoutEnabled === true);
  const companySites = moduleCode === "RETAIL_DAILY_CLOSE" && canManagePos
    ? await prisma.enterpriseSite.findMany({
      where: { organizationId, status: "ACTIVE", archivedAt: null },
      select: { id: true, name: true, code: true, siteType: true }, orderBy: { name: "asc" }, take: 500,
    })
    : undefined;
  const adminStores = companySites?.some((site) => site.siteType === "STORE")
    ? companySites.filter((site) => site.siteType === "STORE") : companySites;
  const posSection = moduleCode === "RETAIL_POS" ? getRetailPosSection(options?.section, canManagePos, posCapabilities) : undefined;
  if (moduleCode === "RETAIL_POS" && options?.section && !posSection) notFound();
  if (posSection && options?.siteId && posSection.id !== "approvals" && !canManagePos && !posAssignments.some((assignment) =>
    assignment.siteId === options.siteId && (!posSection.requiredCapability || siteStaffCapabilities(assignment.roleCode, assignment.permissionsJson).includes(posSection.requiredCapability as "PREPARE_INVOICE" | "COLLECT_PAYMENT" | "VIEW_STOCK")),
  )) notFound();
  if (posSection?.id === "customers") redirect(`/enterprise-modules/RETAIL_POS?section=checkout${options?.siteId ? `&siteId=${encodeURIComponent(options.siteId)}` : ""}`);

  return (
    <AppShell user={user} hideContextualBack={moduleCode === "RETAIL_POS"}>
      <div className="space-y-4">
        {moduleCode === "RETAIL_DAILY_CLOSE" ? (
          <RetailDailyCloseWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
            adminStores={adminStores}
            preferredSiteId={options?.siteId}
            defaultBusinessDate={formatEnterpriseBusinessDate(new Date(), organization.timezone || "UTC")}
          />
        ) : moduleCode === "RETAIL_POS" ? (
          posSection ? (
            <RetailPosSectionDetail locale={locale} section={posSection}>
              {posSection.id === "checkout" ? (
                invoiceCheckoutEnabled
                  ? <RetailInvoiceFlowWorkbench organizationId={organizationId} organizationName={organization.name} locale={locale} preferredSiteId={options?.siteId} mode="checkout" />
                  : <RetailPosWorkspace organizationId={organizationId} organizationName={organization.name} definition={access.definition} preferredSiteId={options?.siteId} />
              ) : posSection.id === "store-setup" ? (
                <RetailMultiStoreOnboarding organizationId={organizationId} locale={locale} selectedSiteId={options?.siteId} />
              ) : posSection.id === "my-stores" ? (
                <RetailMyStores organizationId={organizationId} userId={user.id} role={membership.role} locale={locale} />
              ) : posSection.id === "sites" ? (
                <RetailSiteOverview organizationId={organizationId} locale={locale} />
              ) : posSection.id === "staff" ? (
                <RetailSiteStaffAccess organizationId={organizationId} locale={locale} />
              ) : posSection.id === "invoices" ? (
                <RetailInvoiceFlowWorkbench organizationId={organizationId} organizationName={organization.name} locale={locale} preferredSiteId={options?.siteId} mode="invoices" />
              ) : posSection.id === "approvals" ? (
                <RetailInvoiceApprovalWorkbench organizationId={organizationId} locale={locale} preferredSiteId={options?.siteId} />
              ) : posSection.id === "collections" ? (
                <RetailInvoiceCashierWorkbench organizationId={organizationId} locale={locale} preferredSiteId={options?.siteId} />
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
          ) : <RetailPosSectionDirectory locale={locale} canManage={canManagePos} capabilities={posCapabilities} />
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
