CREATE TABLE IF NOT EXISTS "CooOperation" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "pilotDepartmentId" TEXT,
  "pilotDepartmentName" TEXT,
  "involvedDepartments" TEXT,
  "leadEmployeeId" TEXT,
  "leadEmployeeName" TEXT,
  "collaborators" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "objectives" TEXT,
  "deliverables" TEXT,
  "comments" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "taskType" TEXT NOT NULL DEFAULT 'ADMINISTRATIVE',
  "operationId" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "assigneeEmployeeId" TEXT,
  "assigneeName" TEXT,
  "plannedDate" TIMESTAMP(3),
  "plannedStartTime" TEXT,
  "deadlineTime" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "managerComment" TEXT,
  "assigneeComment" TEXT,
  "proofUrl" TEXT,
  "lateReason" TEXT,
  "blockerReason" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooRecurringTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'DAILY',
  "daysOfWeek" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "deadlineTime" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "assigneeEmployeeId" TEXT,
  "assigneeName" TEXT,
  "taskTemplate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooRecurringTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooDepartmentRequest" (
  "id" TEXT NOT NULL,
  "requesterDepartmentId" TEXT,
  "requesterDepartmentName" TEXT,
  "targetDepartmentId" TEXT,
  "targetDepartmentName" TEXT,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "requesterEmployeeId" TEXT,
  "requesterName" TEXT,
  "targetResponsibleEmployeeId" TEXT,
  "targetResponsibleName" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "requestedAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "expectedResponse" TEXT,
  "comment" TEXT,
  "taskId" TEXT,
  "operationId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooDepartmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooBlocker" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'TASK',
  "taskId" TEXT,
  "operationId" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "impact" TEXT,
  "correctiveAction" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "declaredAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolutionComment" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooBlocker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooMeeting" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "meetingType" TEXT NOT NULL DEFAULT 'COORDINATION',
  "meetingDate" TIMESTAMP(3),
  "meetingTime" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "participants" TEXT,
  "agenda" TEXT,
  "decisions" TEXT,
  "generatedTasks" TEXT,
  "reportOwnerEmployeeId" TEXT,
  "reportOwnerName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "minutes" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooWorkflow" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "steps" TEXT NOT NULL,
  "stepOwners" TEXT,
  "stepDeadlines" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CooOperationalReport" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reportType" TEXT NOT NULL DEFAULT 'DAILY',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "departmentId" TEXT,
  "departmentName" TEXT,
  "employeeId" TEXT,
  "employeeName" TEXT,
  "operationId" TEXT,
  "tasksCreated" INTEGER NOT NULL DEFAULT 0,
  "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
  "tasksValidated" INTEGER NOT NULL DEFAULT 0,
  "tasksRejected" INTEGER NOT NULL DEFAULT 0,
  "lateTasks" INTEGER NOT NULL DEFAULT 0,
  "blockersCount" INTEGER NOT NULL DEFAULT 0,
  "executionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "mainBlockers" TEXT,
  "recommendations" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CooOperationalReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CooOperation_status_priority_idx" ON "CooOperation"("status", "priority");
CREATE INDEX IF NOT EXISTS "CooOperation_pilotDepartmentId_idx" ON "CooOperation"("pilotDepartmentId");
CREATE INDEX IF NOT EXISTS "CooOperation_leadEmployeeId_idx" ON "CooOperation"("leadEmployeeId");
CREATE INDEX IF NOT EXISTS "CooOperation_dueDate_idx" ON "CooOperation"("dueDate");
CREATE INDEX IF NOT EXISTS "CooTask_status_priority_idx" ON "CooTask"("status", "priority");
CREATE INDEX IF NOT EXISTS "CooTask_plannedDate_idx" ON "CooTask"("plannedDate");
CREATE INDEX IF NOT EXISTS "CooTask_departmentId_idx" ON "CooTask"("departmentId");
CREATE INDEX IF NOT EXISTS "CooTask_responsibleEmployeeId_idx" ON "CooTask"("responsibleEmployeeId");
CREATE INDEX IF NOT EXISTS "CooTask_assigneeEmployeeId_idx" ON "CooTask"("assigneeEmployeeId");
CREATE INDEX IF NOT EXISTS "CooTask_operationId_idx" ON "CooTask"("operationId");
CREATE INDEX IF NOT EXISTS "CooRecurringTask_status_frequency_idx" ON "CooRecurringTask"("status", "frequency");
CREATE INDEX IF NOT EXISTS "CooRecurringTask_departmentId_idx" ON "CooRecurringTask"("departmentId");
CREATE INDEX IF NOT EXISTS "CooDepartmentRequest_status_priority_idx" ON "CooDepartmentRequest"("status", "priority");
CREATE INDEX IF NOT EXISTS "CooDepartmentRequest_requesterDepartmentId_idx" ON "CooDepartmentRequest"("requesterDepartmentId");
CREATE INDEX IF NOT EXISTS "CooDepartmentRequest_targetDepartmentId_idx" ON "CooDepartmentRequest"("targetDepartmentId");
CREATE INDEX IF NOT EXISTS "CooDepartmentRequest_operationId_idx" ON "CooDepartmentRequest"("operationId");
CREATE INDEX IF NOT EXISTS "CooBlocker_status_severity_idx" ON "CooBlocker"("status", "severity");
CREATE INDEX IF NOT EXISTS "CooBlocker_departmentId_idx" ON "CooBlocker"("departmentId");
CREATE INDEX IF NOT EXISTS "CooBlocker_taskId_idx" ON "CooBlocker"("taskId");
CREATE INDEX IF NOT EXISTS "CooBlocker_operationId_idx" ON "CooBlocker"("operationId");
CREATE INDEX IF NOT EXISTS "CooMeeting_status_meetingDate_idx" ON "CooMeeting"("status", "meetingDate");
CREATE INDEX IF NOT EXISTS "CooMeeting_departmentId_idx" ON "CooMeeting"("departmentId");
CREATE INDEX IF NOT EXISTS "CooWorkflow_status_departmentId_idx" ON "CooWorkflow"("status", "departmentId");
CREATE INDEX IF NOT EXISTS "CooOperationalReport_reportType_status_idx" ON "CooOperationalReport"("reportType", "status");
CREATE INDEX IF NOT EXISTS "CooOperationalReport_departmentId_idx" ON "CooOperationalReport"("departmentId");
CREATE INDEX IF NOT EXISTS "CooOperationalReport_employeeId_idx" ON "CooOperationalReport"("employeeId");
CREATE INDEX IF NOT EXISTS "CooOperationalReport_operationId_idx" ON "CooOperationalReport"("operationId");

ALTER TABLE "CooTask" ADD CONSTRAINT "CooTask_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CooOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooDepartmentRequest" ADD CONSTRAINT "CooDepartmentRequest_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CooOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooBlocker" ADD CONSTRAINT "CooBlocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CooTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooBlocker" ADD CONSTRAINT "CooBlocker_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CooOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooOperationalReport" ADD CONSTRAINT "CooOperationalReport_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CooOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
