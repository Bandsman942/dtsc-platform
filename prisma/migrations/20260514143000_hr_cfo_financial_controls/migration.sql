CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinancialAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" TEXT NOT NULL DEFAULT 'CASH',
  "description" TEXT,
  "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAccount_name_key" ON "FinancialAccount"("name");

CREATE TABLE IF NOT EXISTS "HrcfoPayroll" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "bonusAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "accountId" TEXT,
  "budgetId" TEXT,
  "transactionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrcfoPayroll_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "hrcfoTransactionId" TEXT;

ALTER TABLE "HrcfoEmployee" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "HrcfoEmployee" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "HrcfoEmployee" ADD COLUMN IF NOT EXISTS "managerUserId" TEXT;
ALTER TABLE "HrcfoEmployee" ADD COLUMN IF NOT EXISTS "kpis" TEXT;

ALTER TABLE "HrcfoBudget" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "HrcfoBudget" ADD COLUMN IF NOT EXISTS "accountId" TEXT;

ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "transactionType" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "transactionCategory" TEXT NOT NULL DEFAULT 'OUT';
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "accountId" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "clientUserId" TEXT;
ALTER TABLE "HrcfoExpense" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);

INSERT INTO "Department" ("id", "name", "description", "status", "createdAt", "updatedAt")
VALUES
  ('dept-direction', 'Direction générale', 'Pilotage stratégique et gouvernance DTSC.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dept-hr-cfo', 'HR & CFO', 'Ressources humaines, contrôle financier, budgets, paie et facturation.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dept-sco', 'SCO', 'Achats, stocks, actifs, fournisseurs et logistique opérationnelle.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dept-tech-data', 'Tech, Data & IA', 'Développement, data, automatisation, IA et solutions métier.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dept-commercial', 'Commercial & Relation client', 'Ventes, support client, marketing et accompagnement.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "FinancialAccount" ("id", "name", "accountType", "description", "openingBalance", "currentBalance", "status", "createdAt", "updatedAt")
VALUES
  ('acct-caisse-principale', 'Caisse principale', 'CASH', 'Compte de caisse principal DTSC.', 0, 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acct-banque', 'Banque', 'BANK', 'Compte bancaire principal.', 0, 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acct-mobile-money', 'Mobile Money', 'MOBILE_MONEY', 'Compte de réception et paiement mobile.', 0, 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

CREATE INDEX IF NOT EXISTS "Department_status_name_idx" ON "Department"("status", "name");
CREATE INDEX IF NOT EXISTS "FinancialAccount_status_accountType_idx" ON "FinancialAccount"("status", "accountType");
CREATE UNIQUE INDEX IF NOT EXISTS "HrcfoEmployee_userId_key" ON "HrcfoEmployee"("userId");
CREATE INDEX IF NOT EXISTS "HrcfoEmployee_userId_idx" ON "HrcfoEmployee"("userId");
CREATE INDEX IF NOT EXISTS "HrcfoEmployee_departmentId_idx" ON "HrcfoEmployee"("departmentId");
CREATE INDEX IF NOT EXISTS "HrcfoEmployee_managerUserId_idx" ON "HrcfoEmployee"("managerUserId");
CREATE INDEX IF NOT EXISTS "HrcfoBudget_departmentId_idx" ON "HrcfoBudget"("departmentId");
CREATE INDEX IF NOT EXISTS "HrcfoBudget_accountId_idx" ON "HrcfoBudget"("accountId");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_transactionCategory_status_transactionDate_idx" ON "HrcfoExpense"("transactionCategory", "status", "transactionDate");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_accountId_transactionDate_idx" ON "HrcfoExpense"("accountId", "transactionDate");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_departmentId_transactionDate_idx" ON "HrcfoExpense"("departmentId", "transactionDate");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_budgetId_transactionDate_idx" ON "HrcfoExpense"("budgetId", "transactionDate");
CREATE INDEX IF NOT EXISTS "HrcfoExpense_sourceType_sourceId_idx" ON "HrcfoExpense"("sourceType", "sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_hrcfoTransactionId_key" ON "Invoice"("hrcfoTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "HrcfoPayroll_transactionId_key" ON "HrcfoPayroll"("transactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "HrcfoPayroll_employeeId_periodStart_periodEnd_key" ON "HrcfoPayroll"("employeeId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "HrcfoPayroll_status_periodStart_idx" ON "HrcfoPayroll"("status", "periodStart");
CREATE INDEX IF NOT EXISTS "HrcfoPayroll_accountId_idx" ON "HrcfoPayroll"("accountId");
CREATE INDEX IF NOT EXISTS "HrcfoPayroll_budgetId_idx" ON "HrcfoPayroll"("budgetId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_hrcfoTransactionId_fkey" FOREIGN KEY ("hrcfoTransactionId") REFERENCES "HrcfoExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoEmployee" ADD CONSTRAINT "HrcfoEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoEmployee" ADD CONSTRAINT "HrcfoEmployee_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoEmployee" ADD CONSTRAINT "HrcfoEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoBudget" ADD CONSTRAINT "HrcfoBudget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoBudget" ADD CONSTRAINT "HrcfoBudget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoExpense" ADD CONSTRAINT "HrcfoExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoExpense" ADD CONSTRAINT "HrcfoExpense_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoExpense" ADD CONSTRAINT "HrcfoExpense_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "HrcfoBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoPayroll" ADD CONSTRAINT "HrcfoPayroll_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrcfoEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrcfoPayroll" ADD CONSTRAINT "HrcfoPayroll_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoPayroll" ADD CONSTRAINT "HrcfoPayroll_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "HrcfoBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrcfoPayroll" ADD CONSTRAINT "HrcfoPayroll_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "HrcfoExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
