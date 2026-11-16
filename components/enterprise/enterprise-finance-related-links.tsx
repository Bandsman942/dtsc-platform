import Link from "next/link";
import { ArrowUpRight, Network } from "lucide-react";
import { getSession } from "@/lib/auth";
import { translateEnterpriseFinance } from "@/lib/i18n";
import { resolveEnterpriseModuleAccess } from "@/lib/enterprise/module-access";

/** Server-only navigation: never reveal destinations without effective tenant access. */
const RELATED_MODULES: Record<string, readonly string[]> = {
  FINANCE_CLOSE: ["FINANCE_ACCOUNTING", "FINANCE_RECONCILIATION", "FINANCE_STATEMENTS", "REPORTS"],
  FINANCE_STATEMENTS: ["FINANCE_ACCOUNTING", "FINANCE_CLOSE", "FINANCE_ASSETS", "FINANCE_INVENTORY", "REPORTS"],
  FINANCE_ASSETS: ["ASSETS_MAINTENANCE", "FINANCE_ACCOUNTING", "FINANCE_STATEMENTS", "REPORTS"],
  FINANCE_INVENTORY: ["INVENTORY_LOGISTICS", "FINANCE_ACCOUNTING", "FINANCE_STATEMENTS", "REPORTS"],
  REPORTS: ["FINANCE_STATEMENTS", "FINANCE_CLOSE", "FINANCE_ASSETS", "FINANCE_INVENTORY"],
};

export async function EnterpriseFinanceRelatedLinks({
  organizationId, fromCode, locale,
}: { organizationId: string; fromCode: string; locale: string | null | undefined }) {
  const session = await getSession();
  if (session?.activeContext !== "ORGANIZATION" || session.activeOrganizationId !== organizationId) return null;
  const codes = RELATED_MODULES[fromCode] || [];
  if (!codes.length) return null;
  const permitted = await Promise.all(codes.map(async (code) => {
    const access = await resolveEnterpriseModuleAccess({ userId: session.userId, organizationId, moduleCode: code, action: "read" });
    if (!access.allowed || !access.definition) return null;
    return { code, label: locale === "en" ? access.definition.labelEn : access.definition.labelFr };
  }));
  const links = permitted.filter((item): item is { code: string; label: string } => item !== null);
  if (!links.length) return null;
  return (
    <nav aria-label={locale === "en" ? "Related modules" : "Modules associés"} className="mx-auto mb-4 w-full max-w-[1600px] min-w-0 px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-y border-dtsc-border py-3">
        <span className="flex shrink-0 items-center gap-2 pr-2 text-xs font-extrabold uppercase tracking-wide text-dtsc-muted">
          <Network className="h-4 w-4 text-dtsc-blue" aria-hidden="true" />
          {translateEnterpriseFinance(locale, "relatedFinanceWorkflows")}
        </span>
        <div className="flex min-w-0 flex-1 touch-pan-x gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((item) => (
            <Link key={item.code} href={`/enterprise-modules/${encodeURIComponent(item.code)}`} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-xs font-bold text-dtsc-ink transition hover:border-cyan-500/60 hover:bg-dtsc-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              {item.label}<ArrowUpRight className="h-3.5 w-3.5 text-dtsc-blue" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
