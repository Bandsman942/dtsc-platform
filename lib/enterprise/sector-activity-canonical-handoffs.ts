/** #878 / wave 1 — Canonical destinations for genuine business operations.
 *
 * Historical block.targetModuleCode values are NOT trusted as navigation
 * codes. This allow-list links only two professionally implemented commands
 * to their current ERP owners. Never use it for writes or to assume RBAC.
 */
const PROFESSIONAL_SERVICES_HANDOFFS = {
  DECLARE_TIME_WORKED: { moduleCode: "TIME_ATTENDANCE", intent: "DECLARE_TIME_WORKED" },
  SUBMIT_DELIVERABLE: { moduleCode: "TIME_DELIVERABLES", intent: "SUBMIT_DELIVERABLE" },
} as const;

export function canonicalSectorActivityDestination(sectorCode: string | null | undefined, blockCode: string) {
  if (sectorCode !== "PROFESSIONAL_SERVICES") return null;
  if (blockCode === "DECLARE_TIME_WORKED") return PROFESSIONAL_SERVICES_HANDOFFS.DECLARE_TIME_WORKED;
  if (blockCode === "SUBMIT_DELIVERABLE") return PROFESSIONAL_SERVICES_HANDOFFS.SUBMIT_DELIVERABLE;
  return null;
}
