import { redirect } from "next/navigation";
import { getSession, requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { HirmsInvoiceSubmissionWorkspace } from "@/components/enterprise/hirms-invoice-submission-workspace";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function InsuranceInvoiceSubmitPage({ searchParams }: { searchParams: Promise<{ environment?: string }> }) {
  const query = await searchParams;
  const initialEnvironment = query.environment === "PRODUCTION" ? "PRODUCTION" : "UAT";
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");
  const membership = await requireEnterpriseMembership(session,organizationId);
  const sector = membership?.organization.sectorCode;
  const allowed = sector === "HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({ session, organizationId, action: "write" }))?.canSubmit)
    : sector === "PHARMACY" ? await canAccessPharmacySales(session.userId,organizationId,"confirm") : false;
  if (!allowed) redirect("/dashboard");
  return <AppShell user={user}><LocaleProvider locale={user.locale === "en" ? "en" : "fr"}>
    <HirmsInvoiceSubmissionWorkspace organizationId={organizationId} initialEnvironment={initialEnvironment}/>
  </LocaleProvider></AppShell>;
}
