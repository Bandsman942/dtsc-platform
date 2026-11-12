import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { InsuranceMemberVerifyWorkspace } from "@/components/enterprise/insurance-member-verify-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function InsuranceMemberVerifyPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) redirect("/dashboard");
  const sector = membership.organization.sectorCode;
  const allowed = sector === "HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({ session, organizationId, action: "write" }))?.canCreate)
    : sector === "PHARMACY" ? await canAccessPharmacySales(session.userId, organizationId, "create") : false;
  if (!allowed) redirect("/dashboard");
  return (
    <AppShell user={user}>
      <LocaleProvider locale={user.locale === "en" ? "en" : "fr"}>
        <InsuranceMemberVerifyWorkspace organizationId={organizationId} sector={sector as "HEALTH_CARE" | "PHARMACY"} />
      </LocaleProvider>
    </AppShell>
  );
}
