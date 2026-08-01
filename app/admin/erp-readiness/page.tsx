import { redirect } from "next/navigation";
import { ErpCommercialReadinessDashboard } from "@/components/admin/erp-commercial-readiness-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdministration } from "@/lib/admin-access";
import { getSession, requireUser } from "@/lib/auth";
import {
  listEnterpriseModuleCommercialAssessments,
  type EnterpriseModuleCommercialMaturity,
} from "@/lib/enterprise/module-commercial-readiness";
import { isDtscInternalSession } from "@/lib/organizations";
import { getDashboardUrl } from "@/lib/domains";

const MATURITIES = new Set<EnterpriseModuleCommercialMaturity>([
  "BACKEND_READY",
  "READ_ONLY_UI",
  "OPERATIONAL_UI",
  "PROFESSIONAL_READY",
  "COMMERCIAL_READY",
]);

export default async function ErpReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; maturity?: string }>;
}) {
  const user = await requireUser();
  const session = await getSession();
  if (!isDtscInternalSession(session) || !canAccessAdministration(user.role)) {
    redirect(getDashboardUrl());
  }

  const { q, maturity } = await searchParams;
  const selectedMaturity = MATURITIES.has(maturity as EnterpriseModuleCommercialMaturity)
    ? (maturity as EnterpriseModuleCommercialMaturity)
    : undefined;

  return (
    <AppShell user={user}>
      <ErpCommercialReadinessDashboard
        assessments={listEnterpriseModuleCommercialAssessments()}
        selectedMaturity={selectedMaturity}
        query={q}
      />
    </AppShell>
  );
}
