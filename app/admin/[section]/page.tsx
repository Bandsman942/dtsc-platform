import Link from "next/link";
import { Gauge } from "lucide-react";
import { DtscConsolePage } from "@/app/admin/console-page";
import { parseAdminRoleAccess } from "@/lib/admin-access";
import { requireUser } from "@/lib/auth";
import { CONSOLE_CAPABILITIES, getConsoleAccessDecision } from "@/lib/console/console-capabilities";
import { translateScalabilityConsole } from "@/lib/scalability/console-i18n";
import { getAppSettings } from "@/lib/settings";

export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section } = await params;
  const page = await DtscConsolePage({ forcedSection: section, searchParams });
  if (section !== "cto") return page;

  const user = await requireUser();
  const settings = await getAppSettings();
  const adminRoleAccess = parseAdminRoleAccess(settings.adminRoleAccess);
  const securityDecision = await getConsoleAccessDecision({ user, capability: CONSOLE_CAPABILITIES.SECURITY_READ, adminRoleAccess });
  if (!securityDecision.allowed) return page;

  return (
    <>
      {page}
      <Link
        href="/admin/cto/scalability"
        data-responsive-actions
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 max-w-[calc(100vw-2rem)] items-center justify-center gap-2 rounded-full border border-cyan-300 bg-[#002b5b] px-4 py-3 text-sm font-black text-white shadow-[0_16px_40px_rgba(0,43,91,0.28)] transition hover:bg-[#003b78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:bottom-6 lg:right-6"
      >
        <Gauge className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="break-words">{translateScalabilityConsole(user.locale, "launcher")}</span>
      </Link>
    </>
  );
}
