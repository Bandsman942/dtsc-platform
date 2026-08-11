"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Blocks, Gauge, LifeBuoy, MessagesSquare, ShieldCheck } from "lucide-react";
import type { ElementType } from "react";
import type { UserRole } from "@prisma/client";
import { canAccessAdministration } from "@/lib/admin-access";
import type { EnterpriseNavigationModule } from "@/lib/enterprise/enterprise-navigation";
import {
  MODULE_NAVIGATION_GROUPS,
  getModuleNavigationGroupDescription,
  getModuleNavigationGroupHref,
  getModuleNavigationGroupLabel,
  type ModuleNavigationGroupCode,
} from "@/lib/navigation/module-navigation-groups";
import { moduleNavigationGroupOwnsPath } from "@/lib/navigation/module-navigation-paths";
import { cn } from "@/lib/utils";

const ICON_BY_GROUP: Record<ModuleNavigationGroupCode, ElementType> = {
  PILOTAGE: Gauge,
  AI_COLLABORATION: MessagesSquare,
  ORGANIZATION_ERP: Blocks,
  ACCOUNT_SUPPORT: LifeBuoy,
  DTSC_INTERNAL: ShieldCheck,
};

export function NavLinks({
  role,
  mobile = false,
  unreadNotifications = 0,
  unreadCollaboratorMessages = 0,
  pendingEnterpriseInvitations = 0,
  pendingCompanyRelationships = 0,
  showEmployeeActivities = false,
  showInternalModules = false,
  showCollaborationModule = true,
  enterpriseContext = null,
  locale = "fr",
}: {
  role: UserRole;
  mobile?: boolean;
  unreadNotifications?: number;
  unreadCollaboratorMessages?: number;
  pendingEnterpriseInvitations?: number;
  pendingCompanyRelationships?: number;
  showEmployeeActivities?: boolean;
  showInternalModules?: boolean;
  showCollaborationModule?: boolean;
  enterpriseContext?: {
    organizationName: string;
    showAdmin: boolean;
    showActivities: boolean;
    modules: EnterpriseNavigationModule[];
  } | null;
  locale?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedGroup = searchParams.get("group");
  const canOpenInternalGroup = showInternalModules && (showEmployeeActivities || canAccessAdministration(role));
  const visibleGroups = MODULE_NAVIGATION_GROUPS.filter((group) => group.code !== "DTSC_INTERNAL" || canOpenInternalGroup);

  function signalCount(groupCode: ModuleNavigationGroupCode) {
    if (groupCode === "PILOTAGE") return unreadNotifications;
    if (groupCode === "AI_COLLABORATION") return showCollaborationModule ? unreadCollaboratorMessages : 0;
    if (groupCode === "ORGANIZATION_ERP") return pendingEnterpriseInvitations + pendingCompanyRelationships;
    return 0;
  }

  return (
    <div className={cn("min-w-0 max-w-full", mobile ? "flex gap-2 overflow-x-auto" : "space-y-1")}>
      {visibleGroups.map((group) => {
        const Icon = ICON_BY_GROUP[group.code];
        const href = getModuleNavigationGroupHref(group.code);
        const active = (pathname === "/modules" && selectedGroup === group.code) || moduleNavigationGroupOwnsPath(group.code, pathname);
        const badge = signalCount(group.code);
        const label = getModuleNavigationGroupLabel(group, locale, mobile);
        const description = getModuleNavigationGroupDescription(group, locale);
        const organizationHint = group.code === "ORGANIZATION_ERP" && enterpriseContext ? enterpriseContext.organizationName : null;

        return (
          <Link
            key={group.code}
            href={href}
            title={organizationHint ? `${description} · ${organizationHint}` : description}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 items-center gap-3 rounded-xl font-semibold transition",
              mobile ? "shrink-0 px-3 py-2 text-xs" : "px-3 py-2.5 text-sm",
              active
                ? "bg-cyan-400/15 text-cyan-500 shadow-[inset_3px_0_0_rgb(34,211,238)]"
                : "text-dtsc-muted hover:bg-dtsc-soft hover:text-dtsc-ink",
            )}
          >
            <span className="relative inline-flex shrink-0">
              <Icon className={mobile ? "h-4 w-4" : "h-[1.1rem] w-[1.1rem]"} aria-hidden="true" />
              {badge > 0 ? (
                <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-cyan-400 px-1 text-[0.55rem] font-black leading-4 text-[#001736]">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {!mobile && organizationHint ? (
              <span className="max-w-24 truncate rounded-full bg-dtsc-page px-2 py-0.5 text-[0.62rem] font-black text-dtsc-muted">{organizationHint}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
