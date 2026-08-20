export const WEB_PUSH_DOMAIN_EVENT_TYPE = "PLATFORM_WEB_PUSH_NOTIFICATION";
export const WEB_PUSH_DOMAIN_ENTITY_TYPE = "Notification";
export const WEB_PUSH_PLATFORM_ORGANIZATION_ID = "__DTSC_PLATFORM__";

export const WEB_PUSH_QUEUE_LIMITS = {
  workerBatchSize: 50,
  workerLeaseSeconds: 90,
  maxAttempts: 5,
  maxBackoffSeconds: 300,
} as const;

export function webPushQueueOrganizationId(organizationId: string | null | undefined) {
  return organizationId || WEB_PUSH_PLATFORM_ORGANIZATION_ID;
}
