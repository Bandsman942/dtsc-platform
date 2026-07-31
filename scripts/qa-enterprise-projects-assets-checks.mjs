import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-projects-assets.prisma",
  "lib/enterprise/projects-assets/projects.ts",
  "lib/enterprise/projects-assets/assets.ts",
  "app/api/enterprise/[organizationId]/projects/route.ts",
  "app/api/enterprise/[organizationId]/assets/route.ts",
]);
requireTokens("lib/enterprise/projects-assets/projects.ts", [
  "PROJECT_MEMBER_DUPLICATE",
  "DELIVERABLE_TRANSITION_INVALID",
  "SELF_APPROVAL_FORBIDDEN",
  "revision",
]);
requireTokens("lib/enterprise/projects-assets/assets.ts", [
  "ASSET_ALREADY_ASSIGNED",
  "ASSET_RETURNED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
  "ASSET_INCIDENT_RESOLVED",
]);
requireTokens("components/enterprise/enterprise-common-domain-workspace.tsx", ["PROJECTS_SERVICES", "TIME_DELIVERABLES", "ASSETS_MAINTENANCE"]);
success("enterprise project and asset lifecycles");
