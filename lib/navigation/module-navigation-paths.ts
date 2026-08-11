import type { ModuleNavigationGroupCode } from "@/lib/navigation/module-navigation-groups";

const PATH_PREFIXES_BY_GROUP: Record<ModuleNavigationGroupCode, string[]> = {
  PILOTAGE: ["/dashboard", "/calendar", "/notifications"],
  AI_COLLABORATION: ["/chat", "/collaborators", "/announcements"],
  ORGANIZATION_ERP: ["/company", "/enterprise-links", "/enterprise-invitations", "/enterprise-activities", "/enterprise-modules", "/enterprise-admin", "/billing"],
  ACCOUNT_SUPPORT: ["/profile", "/settings", "/support"],
  DTSC_INTERNAL: ["/activities", "/admin"],
};

export function moduleNavigationGroupOwnsPath(groupCode: ModuleNavigationGroupCode, pathname: string) {
  return PATH_PREFIXES_BY_GROUP[groupCode].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
