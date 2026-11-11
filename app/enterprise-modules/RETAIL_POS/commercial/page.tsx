import { notFound, redirect } from "next/navigation";
import { getSession, requireUser } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { RetailCommercialWorkspace } from "@/components/enterprise/professional/retail-commercial-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";
import { RETAIL_OWNER_ROLES } from "@/lib/enterprise/retail/site-access";

export default async function RetailCommercialControlPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in?next=/enterprise-modules/RETAIL_POS/commercial");
  const user = await requireUser();
  const organizationId = session.activeOrganizationId;
  if (!organizationId || session.activeContext !== "ORGANIZATION") redirect("/dashboard");
  const access = await resolveEnterpriseModuleAccess({
    userId: session.userId,
    organizationId,
    moduleCode: "RETAIL_POS",
    action: "read",
  });
  if (!access.allowed) redirect("/enterprise-modules/RETAIL_POS");
  const [member, organization] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id, status: "ACTIVE", removedAt: null },
      select: { role: true },
    }),
    prisma.organization.findFirst({
      where: { id: organizationId, organizationType: "CLIENT", status: "ACTIVE", deletedAt: null },
      select: { name: true },
    }),
  ]);
  if (!member || !organization || !RETAIL_OWNER_ROLES.has(member.role)) notFound();
  return (
    <AppShell user={user} hideContextualBack>
      <RetailCommercialWorkspace organizationId={organizationId} organizationName={organization.name} />
    </AppShell>
  );
}
