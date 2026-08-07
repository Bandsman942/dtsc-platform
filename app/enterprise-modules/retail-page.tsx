import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EnterpriseRetailShopWorkspace } from "@/components/enterprise/professional/enterprise-retail-shop-workspace";
import { getSession } from "@/lib/auth";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";
import { prisma } from "@/lib/prisma";

export async function renderRetailModulePage(moduleCode: "RETAIL_POS" | "MOBILE_MONEY_AGENCY" | "TELCO_TOPUPS" | "RETAIL_DAILY_CLOSE") {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/enterprise-modules/${moduleCode}`)}`);
  const organizationId = session.activeOrganizationId;
  if (!organizationId) redirect("/dashboard");
  const access = await resolveEnterpriseModuleAccess({ session, organizationId, moduleCode, action: "read" });
  if (!access.ok) return access.response;
  const organization = await prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!organization) notFound();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, role: true, profilePhotoUrl: true } });
  if (!user) redirect("/login");
  return <AppShell user={user}><EnterpriseRetailShopWorkspace organizationId={organization.id} organizationName={organization.name} definition={access.definition} /></AppShell>;
}
