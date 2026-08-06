import { UserRole } from "@prisma/client";
import { canAccessAdminSection } from "@/lib/business-roles";
import { hasDtscIndividualPermission } from "@/lib/dtsc-individual-permissions";
import type { AdminRoleAccess } from "@/lib/admin-access";
import { CONSOLE_SECTION_ADMIN_BLOCK, type ConsoleSectionId } from "@/lib/console/console-routes";
import { CONSOLE_CAPABILITIES, CONSOLE_CAPABILITY_SECTIONS, consoleCapabilityPermission, type ConsoleCapability } from "@/lib/console/console-capability-catalog";

export { CONSOLE_CAPABILITIES, consoleCapabilityPermission, type ConsoleCapability } from "@/lib/console/console-capability-catalog";

const readCapabilities = new Set<ConsoleCapability>([
  CONSOLE_CAPABILITIES.OVERVIEW_READ,
  CONSOLE_CAPABILITIES.USERS_READ,
  CONSOLE_CAPABILITIES.ORGANIZATIONS_READ,
  CONSOLE_CAPABILITIES.SUBSCRIPTIONS_READ,
  CONSOLE_CAPABILITIES.HR_CFO_INVOICES_READ,
  CONSOLE_CAPABILITIES.SUPPORT_READ,
  CONSOLE_CAPABILITIES.CONTENT_READ,
  CONSOLE_CAPABILITIES.SECURITY_READ,
  CONSOLE_CAPABILITIES.SETTINGS_READ,
  CONSOLE_CAPABILITIES.MODULE_MATURITY_READ,
]);


export function getConsoleCapabilitySection(capability: ConsoleCapability) {
  return CONSOLE_CAPABILITY_SECTIONS[capability];
}

export type ConsoleAccessDecision = {
  allowed: boolean;
  capability: ConsoleCapability;
  section: ConsoleSectionId;
  reasonCode: "ALLOWED_GLOBAL_ADMIN" | "ALLOWED_INDIVIDUAL_GRANT" | "ALLOWED_ROLE_BLOCK" | "ALLOWED_SUPPORT_ROLE" | "FORBIDDEN_ROLE" | "CAPABILITY_REQUIRED" | "SECTION_FORBIDDEN";
  origin: "GLOBAL_ROLE" | "INDIVIDUAL_PERMISSION" | "ADMIN_BLOCK" | "NONE";
};

export async function getConsoleAccessDecision(input: {
  user: { id: string; role: UserRole };
  capability: ConsoleCapability;
  adminRoleAccess?: AdminRoleAccess | unknown;
}): Promise<ConsoleAccessDecision> {
  const { user, capability } = input;
  const section = getConsoleCapabilitySection(capability);
  if (user.role === UserRole.CLIENT) {
    return { allowed: false, capability, section, reasonCode: "FORBIDDEN_ROLE", origin: "NONE" };
  }

  if (user.role === UserRole.ADMIN) {
    return { allowed: true, capability, section, reasonCode: "ALLOWED_GLOBAL_ADMIN", origin: "GLOBAL_ROLE" };
  }

  if (await hasDtscIndividualPermission(user.id, consoleCapabilityPermission(capability))) {
    return { allowed: true, capability, section, reasonCode: "ALLOWED_INDIVIDUAL_GRANT", origin: "INDIVIDUAL_PERMISSION" };
  }

  const blockId = CONSOLE_SECTION_ADMIN_BLOCK[section];
  if (!blockId) {
    return { allowed: false, capability, section, reasonCode: "CAPABILITY_REQUIRED", origin: "NONE" };
  }

  const sectionAllowed = await canAccessAdminSection(user, blockId, input.adminRoleAccess);
  if (!sectionAllowed) {
    return { allowed: false, capability, section, reasonCode: "SECTION_FORBIDDEN", origin: "NONE" };
  }

  if (readCapabilities.has(capability)) {
    return { allowed: true, capability, section, reasonCode: "ALLOWED_ROLE_BLOCK", origin: "ADMIN_BLOCK" };
  }

  if (user.role === UserRole.SUPPORT && capability === CONSOLE_CAPABILITIES.SUPPORT_MANAGE) {
    return { allowed: true, capability, section, reasonCode: "ALLOWED_SUPPORT_ROLE", origin: "GLOBAL_ROLE" };
  }

  return { allowed: false, capability, section, reasonCode: "CAPABILITY_REQUIRED", origin: "NONE" };
}
