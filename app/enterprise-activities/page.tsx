import { redirect } from "next/navigation";
import { EnterpriseActivitiesModule } from "@/components/enterprise/enterprise-activities-module";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { getEnterpriseActivitiesDataset } from "@/lib/enterprise/enterprise-activities-loader";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";

export default async function EnterpriseActivitiesPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) {
    redirect("/dashboard");
  }
  const membership = await requireEnterpriseMembership(session, organizationId);
  if (!membership) {
    redirect("/dashboard");
  }

  const dataset = await getEnterpriseActivitiesDataset({ organizationId, userId: user.id, membershipRole: membership.role });
  if (!dataset) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <EnterpriseActivitiesModule {...dataset} />
    </AppShell>
  );
}
