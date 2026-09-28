import { notFound, redirect } from "next/navigation";
import { EnterpriseEducationWorkspace } from "@/components/enterprise/education/enterprise-education-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getSession, requireUser } from "@/lib/auth";
import { EDUCATION_MODULE_CODES, EDUCATION_SECTOR_CODE, type EducationModuleCode } from "@/lib/enterprise/education/constants";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { normalizeEnterpriseModuleCode, resolveEnterpriseModuleRoute } from "@/lib/enterprise/module-registry";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ moduleCode: string }> };
const EDUCATION_MODULE_SET = new Set<string>(EDUCATION_MODULE_CODES);

export default async function EnterpriseEducationPage({ params }: Params) {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  const { moduleCode: requestedModuleCode } = await params;
  const canonicalModuleCode = normalizeEnterpriseModuleCode(requestedModuleCode);
  if (!EDUCATION_MODULE_SET.has(canonicalModuleCode)) notFound();

  const route = resolveEnterpriseModuleRoute(canonicalModuleCode);
  if (!route || route.definition.workspaceKey !== "ENTERPRISE_EDUCATION" || !route.path.startsWith("/enterprise-education/")) notFound();

  const capabilities = await resolveEnterpriseModuleCapabilities({
    userId: user.id,
    organizationId,
    moduleCode: canonicalModuleCode,
  });
  if (!capabilities.canRead || !capabilities.definition) notFound();

  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      status: "ACTIVE",
      deletedAt: null,
      organizationType: "CLIENT",
      sectorCode: EDUCATION_SECTOR_CODE,
    },
    select: { name: true },
  });
  if (!organization) notFound();

  return (
    <AppShell user={user}>
      <EnterpriseEducationWorkspace
        organizationId={organizationId}
        organizationName={organization.name}
        definition={capabilities.definition}
        initialFocus={canonicalModuleCode as EducationModuleCode}
        locale={user.locale}
      />
    </AppShell>
  );
}
