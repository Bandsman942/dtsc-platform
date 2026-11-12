import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { HirmsOcrWorkspace } from "@/components/enterprise/hirms-ocr-workspace";
import { getSession, requireUser } from "@/lib/auth";
import { getHealthInsuranceAccess } from "@/lib/health-insurance-access";
import { canAccessPharmacySales } from "@/lib/pharmacy-sale-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function InsuranceOcrPage({searchParams}: {searchParams:Promise<{environment?:string}>}) {
  const user=await requireUser();
  const session=await getSession();
  const organizationId=session?.activeContext==="ORGANIZATION"?session.activeOrganizationId:null;
  if(!session||!organizationId)redirect("/dashboard");
  const membership=await requireEnterpriseMembership(session,organizationId);
  const sector=membership?.organization.sectorCode;
  const allowed=sector==="HEALTH_CARE"
    ? Boolean((await getHealthInsuranceAccess({session,organizationId,action:"read"}))?.canViewReports)
    : sector==="PHARMACY" ? await canAccessPharmacySales(session.userId,organizationId,"view") : false;
  if(!allowed)redirect("/dashboard");
  const query=await searchParams;
  const environment=query.environment==="PRODUCTION"?"PRODUCTION":"UAT";
  return <AppShell user={user}><LocaleProvider locale={user.locale==="en"?"en":"fr"}>
    <HirmsOcrWorkspace organizationId={organizationId} initialEnvironment={environment}/>
  </LocaleProvider></AppShell>;
}
