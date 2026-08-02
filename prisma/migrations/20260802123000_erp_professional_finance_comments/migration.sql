CREATE TABLE "EnterpriseFinanceComment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseFinanceComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseFinanceComment_organizationId_id_key"
ON "EnterpriseFinanceComment"("organizationId", "id");

CREATE INDEX "EnterpriseFinanceComment_scope_idx"
ON "EnterpriseFinanceComment"("organizationId", "entityType", "entityId", "archivedAt", "createdAt");

CREATE INDEX "EnterpriseFinanceComment_author_idx"
ON "EnterpriseFinanceComment"("organizationId", "authorUserId", "archivedAt");
