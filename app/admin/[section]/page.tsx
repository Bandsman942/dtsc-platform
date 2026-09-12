import { DtscConsolePage } from "@/app/admin/console-page";
import { CtoScalabilityFloatingAction } from "@/components/admin/cto-scalability-floating-action";
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
      <CtoScalabilityFloatingAction label={translateScalabilityConsole(user.locale, "launcher")} />
    </>
  );
}
