CREATE TABLE IF NOT EXISTS "HrcfoEmployee" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "department" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "contractType" TEXT NOT NULL DEFAULT 'PERMANENT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startDate" TIMESTAMP(3),
  "monthlyCompensation" DECIMAL(10,2),
  "managerName" TEXT,
  "skills" TEXT,
  "complianceStatus" TEXT NOT NULL DEFAULT 'TO_REVIEW',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrcfoBudget" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerDepartment" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "amount" DECIMAL(12,2) NOT NULL,
  "spentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrcfoExpense" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "project" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "evidenceUrl" TEXT,
  "dueDate" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HrcfoInvoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "counterparty" TEXT NOT NULL,
  "invoiceType" TEXT NOT NULL DEFAULT 'PAYABLE',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "relatedProject" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScoVendor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "paymentTerms" TEXT,
  "reliabilityScore" INTEGER NOT NULL DEFAULT 70,
  "avgLeadTimeDays" INTEGER NOT NULL DEFAULT 7,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoVendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScoPurchaseRequest" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "justification" TEXT NOT NULL,
  "project" TEXT,
  "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
  "estimatedAmount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "budgetStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "selectedVendorName" TEXT,
  "neededBy" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoPurchaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScoInventoryItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "minimumQuantity" INTEGER NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT 'unité',
  "location" TEXT,
  "ownerName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "lastInventoryAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScoAsset" (
  "id" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "assignedTo" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "purchaseDate" TIMESTAMP(3),
  "maintenanceDueAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScoLogisticsEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "eventDate" TIMESTAMP(3),
  "ownerName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "transportPlan" TEXT,
  "equipmentChecklist" TEXT,
  "riskNotes" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoLogisticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HrcfoEmployee_status_department_idx" ON "HrcfoEmployee"("status", "department");
CREATE INDEX IF NOT EXISTS "HrcfoEmployee_createdAt_idx" ON "HrcfoEmployee"("createdAt");
CREATE INDEX IF NOT EXISTS "HrcfoBudget_status_ownerDepartment_idx" ON "HrcfoBudget"("status", "ownerDepartment");
CREATE INDEX IF NOT EXISTS "HrcfoBudget_createdAt_idx" ON "HrcfoBudget"("createdAt");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_status_priority_idx" ON "HrcfoExpense"("status", "priority");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_createdAt_idx" ON "HrcfoExpense"("createdAt");
CREATE INDEX IF NOT EXISTS "HrcfoInvoice_status_dueDate_idx" ON "HrcfoInvoice"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "HrcfoInvoice_invoiceType_createdAt_idx" ON "HrcfoInvoice"("invoiceType", "createdAt");
CREATE INDEX IF NOT EXISTS "ScoVendor_status_category_idx" ON "ScoVendor"("status", "category");
CREATE INDEX IF NOT EXISTS "ScoVendor_createdAt_idx" ON "ScoVendor"("createdAt");
CREATE INDEX IF NOT EXISTS "ScoPurchaseRequest_status_urgency_idx" ON "ScoPurchaseRequest"("status", "urgency");
CREATE INDEX IF NOT EXISTS "ScoPurchaseRequest_createdAt_idx" ON "ScoPurchaseRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "ScoInventoryItem_status_category_idx" ON "ScoInventoryItem"("status", "category");
CREATE INDEX IF NOT EXISTS "ScoInventoryItem_quantity_idx" ON "ScoInventoryItem"("quantity");
CREATE INDEX IF NOT EXISTS "ScoAsset_status_condition_idx" ON "ScoAsset"("status", "condition");
CREATE INDEX IF NOT EXISTS "ScoAsset_tag_idx" ON "ScoAsset"("tag");
CREATE INDEX IF NOT EXISTS "ScoLogisticsEvent_status_eventDate_idx" ON "ScoLogisticsEvent"("status", "eventDate");
CREATE INDEX IF NOT EXISTS "ScoLogisticsEvent_createdAt_idx" ON "ScoLogisticsEvent"("createdAt");
