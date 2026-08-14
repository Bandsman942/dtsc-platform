import { notFound, redirect } from "next/navigation";
import { MobileMoneyAgencyWorkspace } from "@/components/enterprise/professional/mobile-money-agency-workspace";
import { RetailActiveCustomerBar } from "@/components/enterprise/professional/retail-active-customer-bar";
import { RetailDailyCloseWorkspace } from "@/components/enterprise/professional/retail-daily-close-workspace";
import { RetailDeviceReadiness } from "@/components/enterprise/professional/retail-device-readiness";
import { RetailGlobalReadiness } from "@/components/enterprise/professional/retail-global-readiness";
import { RetailOfflineContinuity } from "@/components/enterprise/professional/retail-offline-continuity";
import { RetailOmnichannelPanel } from "@/components/enterprise/professional/retail-omnichannel-panel";
import { RetailOperatorWorkspace } from "@/components/enterprise/professional/retail-operator-workspace";
import { RetailPaymentFollowup } from "@/components/enterprise/professional/retail-payment-followup";
import { RetailPosWorkspace } from "@/components/enterprise/professional/retail-pos-workspace";
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

        {moduleCode === "RETAIL_DAILY_CLOSE" ? (
          <RetailDailyCloseWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : moduleCode === "RETAIL_POS" ? (
          <RetailPosWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : moduleCode === "MOBILE_MONEY_AGENCY" ? (
          <MobileMoneyAgencyWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
          />
        ) : (
          <RetailOperatorWorkspace
            organizationId={organizationId}
            organizationName={organization.name}
            definition={access.definition}
            moduleCode={moduleCode}
          />
        )}

        {moduleCode === "RETAIL_POS" ? (
          <section aria-label={locale === "en" ? "Additional Shop tools" : "Outils complémentaires du Shop"} className="space-y-3">
            <details className="group rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                <span>{locale === "en" ? "Orders, pickup & offline sales" : "Commandes, retraits & vente hors connexion"}</span>
                <span className="text-xs font-bold text-dtsc-muted group-open:hidden">{locale === "en" ? "Open" : "Ouvrir"}</span>
                <span className="hidden text-xs font-bold text-dtsc-muted group-open:inline">{locale === "en" ? "Close" : "Fermer"}</span>
              </summary>
              <div className="grid gap-4 border-t border-dtsc-border p-3 sm:p-4">
                <RetailOfflineContinuity organizationId={organizationId} locale={locale} />
                <RetailOmnichannelPanel organizationId={organizationId} locale={locale} />
              </div>
            </details>

            <RetailPaymentFollowup organizationId={organizationId} locale={locale} />

            <details className="group rounded-2xl border border-dtsc-border bg-dtsc-surface shadow-sm">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-dtsc-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                <span>{locale === "en" ? "Shop setup & POS equipment" : "Mise en service & équipements du Shop"}</span>
                <span className="text-xs font-bold text-dtsc-muted group-open:hidden">{locale === "en" ? "Open" : "Ouvrir"}</span>
                <span className="hidden text-xs font-bold text-dtsc-muted group-open:inline">{locale === "en" ? "Close" : "Fermer"}</span>
              </summary>
              <div className="grid gap-4 border-t border-dtsc-border p-3 sm:p-4">
                <RetailDeviceReadiness organizationId={organizationId} locale={locale} />
                <RetailGlobalReadiness organizationId={organizationId} locale={locale} />
              </div>
            </details>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
