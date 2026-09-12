import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PeriodicAccountingPanel } from "@/components/enterprise/professional/periodic-accounting-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { getSession, requireUser } from "@/lib/auth";
import { ensureCanonicalFinanceModulesForOrganization } from "@/lib/enterprise/finance-modules";
import { resolveEnterpriseModuleCapabilities } from "@/lib/enterprise/module-access";
import { requireEnterpriseMembership } from "@/lib/enterprise-sector-templates";
import { prisma } from "@/lib/prisma";

export async function EnterprisePeriodicAccountingPage() {
  const user = await requireUser();
  const session = await getSession();
  const organizationId = session?.activeContext === "ORGANIZATION" ? session.activeOrganizationId : null;
  if (!session || !organizationId) redirect("/dashboard");

  await ensureCanonicalFinanceModulesForOrganization({ organizationId });
  const [capabilities, membership, organization] = await Promise.all([
    resolveEnterpriseModuleCapabilities({ userId: user.id, organizationId, moduleCode: "FINANCE_ACCOUNTING" }),
    requireEnterpriseMembership(session, organizationId),
    prisma.organization.findFirst({
      where: { id: organizationId, status: "ACTIVE", deletedAt: null, organizationType: "CLIENT" },
      select: { name: true },
    }),
  ]);
  if (!capabilities.canRead || !membership || !organization) notFound();

  const locale = user.locale === "en" ? "en" : "fr";
  return (
    <AppShell user={user}>
      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 pb-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dtsc-border pb-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-dtsc-muted">{organization.name}</p>
            <h1 className="mt-1 text-2xl font-black text-dtsc-ink">{locale === "en" ? "Periodic accounting" : "Comptabilité périodique"}</h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/enterprise-modules/FINANCE_ACCOUNTING"><ArrowLeft className="h-4 w-4" />{locale === "en" ? "Back to Accounting" : "Retour à Comptabilité"}</Link>
          </Button>
        </div>
        <PeriodicAccountingPanel
          organizationId={organizationId}
          locale={locale}
          canCreate={capabilities.canCreate}
          canSubmit={capabilities.canSubmit}
          canApprove={capabilities.canApprove}
          canManage={capabilities.canManage}
        />
      </main>
    </AppShell>
  );
}
