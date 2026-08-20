export const KNOWLEDGE_INDEX_EVENT_TYPE = "PLATFORM_KNOWLEDGE_INDEX_JOB";
export const KNOWLEDGE_INDEX_ENTITY_TYPE = "KnowledgeDocument";
export const KNOWLEDGE_INDEX_PERSONAL_SCOPE = "__DTSC_PERSONAL_KNOWLEDGE__";

export const KNOWLEDGE_INDEX_QUEUE_LIMITS = {
  workerBatchSize: 8,
  workerConcurrency: 2,
  workerLeaseSeconds: 300,
  maxAttempts: 5,
  maxBackoffSeconds: 900,
  orphanRecoveryAgeSeconds: 120,
  orphanRecoveryBatchSize: 25,
} as const;
