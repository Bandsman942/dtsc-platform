import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { RetailCommercialWorkspace } from "@/components/enterprise/professional/retail-commercial-workspace";

export default async function RetailCommercialControlPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=/enterprise-modules/RETAIL_POS/commercial");
  const organizationId = session.activeOrganizationId;
  if (!organizationId || session.activeContext !== "ORGANIZATION") redirect("/dashboard");
  const access = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode: "RETAIL_POS",
    action: "read",
  });
  if (!access.allowed) redirect("/enterprise-modules/RETAIL_POS");
  return <RetailCommercialWorkspace organizationId={organizationId} />;
}
