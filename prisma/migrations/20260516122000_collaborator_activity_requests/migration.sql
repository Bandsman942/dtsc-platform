-- Ajoute les demandes collaboratives privées dans Activités DTSC.
-- La table est non destructive et réutilise CooComment via entityType = COLLAB_REQUEST.

CREATE TABLE "CollaboratorRequest" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requestType" TEXT NOT NULL DEFAULT 'INFORMATION',
  "requesterEmployeeId" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "requesterUserId" TEXT,
  "targetEmployeeId" TEXT NOT NULL,
  "targetName" TEXT NOT NULL,
  "targetUserId" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "dueDate" TIMESTAMP(3),
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "message" TEXT NOT NULL,
  "response" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaboratorRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollaboratorRequest_requesterEmployeeId_createdAt_idx" ON "CollaboratorRequest"("requesterEmployeeId", "createdAt");
CREATE INDEX "CollaboratorRequest_targetEmployeeId_status_idx" ON "CollaboratorRequest"("targetEmployeeId", "status");
CREATE INDEX "CollaboratorRequest_requestType_priority_idx" ON "CollaboratorRequest"("requestType", "priority");
CREATE INDEX "CollaboratorRequest_relatedEntityType_relatedEntityId_idx" ON "CollaboratorRequest"("relatedEntityType", "relatedEntityId");
CREATE INDEX "CollaboratorRequest_dueDate_idx" ON "CollaboratorRequest"("dueDate");
