-- Durable transactional outbox: every allow-listed ERP operational event is mirrored
-- in the same database transaction without changing the authoritative domain services.
-- The payload deliberately excludes the source event metadata to avoid copying sensitive
-- or unbounded domain content into the workflow queue.
CREATE OR REPLACE FUNCTION "enqueueEnterpriseWorkflowDomainEvent"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."eventType" IN (
    'ENTERPRISE_TASK_CREATED','ENTERPRISE_TASK_STARTED','ENTERPRISE_TASK_BLOCKED','ENTERPRISE_TASK_RESUMED','ENTERPRISE_TASK_COMPLETED','ENTERPRISE_TASK_CANCELLED',
    'ENTERPRISE_REQUEST_CREATED','ENTERPRISE_REQUEST_SUBMITTED','ENTERPRISE_REQUEST_REVIEW_STARTED','ENTERPRISE_REQUEST_APPROVED','ENTERPRISE_REQUEST_REJECTED','ENTERPRISE_REQUEST_FULFILLED','ENTERPRISE_REQUEST_CANCELLED',
    'ENTERPRISE_MEETING_CREATED','ENTERPRISE_MEETING_STARTED','ENTERPRISE_MEETING_COMPLETED','ENTERPRISE_MEETING_CANCELLED',
    'ENTERPRISE_PURCHASE_CREATED','ENTERPRISE_PURCHASE_SUBMITTED','ENTERPRISE_PURCHASE_APPROVED','ENTERPRISE_PURCHASE_REJECTED','ENTERPRISE_PURCHASE_ORDERED','ENTERPRISE_PURCHASE_RECEIVED','ENTERPRISE_PURCHASE_CLOSED','ENTERPRISE_PURCHASE_CANCELLED',
    'ENTERPRISE_BUDGET_CREATED','ENTERPRISE_BUDGET_SUBMITTED','ENTERPRISE_BUDGET_APPROVED','ENTERPRISE_BUDGET_REJECTED','ENTERPRISE_BUDGET_CLOSED','ENTERPRISE_BUDGET_CANCELLED',
    'ENTERPRISE_EXPENSE_CREATED','ENTERPRISE_EXPENSE_SUBMITTED','ENTERPRISE_EXPENSE_APPROVED','ENTERPRISE_EXPENSE_REJECTED','ENTERPRISE_EXPENSE_CANCELLED',
    'ENTERPRISE_REPORT_GENERATED',
    'ENTERPRISE_APPROVAL_APPROVED','ENTERPRISE_APPROVAL_REJECTED','ENTERPRISE_APPROVAL_CANCELLED'
  ) THEN
    INSERT INTO "EnterpriseDomainEvent" (
      "id", "organizationId", "eventType", "entityType", "entityId",
      "payloadJson", "idempotencyKey", "occurredAt", "processingStatus",
      "attemptCount", "availableAt", "createdAt", "updatedAt"
    ) VALUES (
      'op_' || NEW."id",
      NEW."organizationId",
      NEW."eventType",
      NEW."entityType",
      NEW."entityId",
      jsonb_strip_nulls(jsonb_build_object(
        'fromStatus', NEW."fromStatus",
        'toStatus', NEW."toStatus",
        'actorUserId', NEW."actorUserId",
        'occurredAt', NEW."createdAt"
      )),
      'operational-event:' || NEW."id",
      NEW."createdAt",
      'PENDING',
      0,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "EnterpriseOperationalEvent_workflow_outbox" ON "EnterpriseOperationalEvent";
CREATE TRIGGER "EnterpriseOperationalEvent_workflow_outbox"
AFTER INSERT ON "EnterpriseOperationalEvent"
FOR EACH ROW
EXECUTE FUNCTION "enqueueEnterpriseWorkflowDomainEvent"();
