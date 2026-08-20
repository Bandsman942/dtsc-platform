export const ADMIN_BROADCAST_EMAIL_PAYLOAD_EVENT_TYPE = "PLATFORM_ADMIN_BROADCAST_EMAIL_PAYLOAD";
export const ADMIN_BROADCAST_EMAIL_DELIVERY_EVENT_TYPE = "PLATFORM_ADMIN_BROADCAST_EMAIL_DELIVERY";
export const ADMIN_BROADCAST_EMAIL_PAYLOAD_ENTITY_TYPE = "AdminBroadcastEmailPayload";
export const ADMIN_BROADCAST_EMAIL_DELIVERY_ENTITY_TYPE = "AdminBroadcastEmailDelivery";
export const ADMIN_BROADCAST_PLATFORM_ORGANIZATION_ID = "__DTSC_PLATFORM__";

export const ADMIN_BROADCAST_EMAIL_QUEUE_LIMITS = {
  workerBatchSize: 50,
  workerConcurrency: 5,
  workerLeaseSeconds: 120,
  maxAttempts: 5,
  maxBackoffSeconds: 600,
} as const;
